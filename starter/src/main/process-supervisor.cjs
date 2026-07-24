'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { utilityProcess } = require('electron');
const {
  createExecutionFailure,
  createExecutionResult,
  createProtocolError,
  errorCodes,
  serializeError,
  sha256
} = require('../shared/contracts.cjs');
const {
  attachPersistenceRedaction,
  redactForPersistence,
  redactTextForPersistence
} = require('../shared/persistence-redaction.cjs');

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_LOG_BYTES = 256 * 1024;
const DEFAULT_KILL_GRACE_MS = 3000;
const UTILITY_ENV_ALLOWLIST = Object.freeze([
  'ComSpec', 'LANG', 'LC_ALL', 'PATH', 'PATHEXT', 'SystemRoot',
  'TEMP', 'TMP', 'TMPDIR', 'WINDIR'
]);

function buildUtilityProcessEnvironment(source = process.env) {
  const environment = { BLANKSEED_GENERATED_RUNTIME: '1' };
  for (const key of UTILITY_ENV_ALLOWLIST) {
    if (typeof source[key] === 'string' && source[key]) environment[key] = source[key];
  }
  return environment;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function redactEnvironment(environment = {}) {
  return Object.fromEntries(Object.keys(environment).sort().map((key) => [key, '[redacted]']));
}

function hydrateError(serialized, fallbackCode = 'INTERNAL_ERROR') {
  const error = new Error(serialized?.message || 'Generated runtime failed.');
  error.name = serialized?.name || 'Error';
  error.code = serialized?.code || fallbackCode;
  error.details = serialized?.details && typeof serialized.details === 'object' ? serialized.details : {};
  error.retryable = Boolean(serialized?.retryable);
  if (typeof serialized?.stack === 'string') error.stack = serialized.stack;
  return error;
}

function runTaskkill(pid) {
  return new Promise((resolve) => {
    if (!pid) {
      resolve({ method: 'taskkill', ok: false, code: null, stdout: '', stderr: 'Missing pid.' });
      return;
    }
    const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      resolve({
        method: 'taskkill',
        ok: false,
        code: null,
        stdout,
        stderr,
        error: serializeError(error)
      });
    });
    child.on('close', (code) => {
      resolve({
        method: 'taskkill',
        ok: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

async function defaultKillProcessTree(record) {
  if (process.platform === 'win32') {
    return runTaskkill(record.childPid);
  }
  const ok = record.child?.kill();
  return { method: 'child.kill', ok, code: null, stdout: '', stderr: '' };
}

class ProcessSupervisor {
  constructor({
    eventStore,
    workspaceRoot,
    runtimeEntry = path.join(__dirname, '..', 'utility', 'agent-runtime.cjs'),
    utilityProcessApi = utilityProcess,
    killProcessTree = defaultKillProcessTree,
    defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
    maxLogBytes = DEFAULT_MAX_LOG_BYTES,
    killGraceMs = DEFAULT_KILL_GRACE_MS,
    runtimeEnvironment = buildUtilityProcessEnvironment()
  }) {
    this.eventStore = eventStore;
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.experimentsRoot = path.join(this.workspaceRoot, 'experiments');
    this.runtimeEntry = runtimeEntry;
    this.utilityProcess = utilityProcessApi;
    this.killProcessTree = killProcessTree;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.maxLogBytes = maxLogBytes;
    this.killGraceMs = killGraceMs;
    this.runtimeEnvironment = { ...runtimeEnvironment };
    this.active = new Map();
    fs.mkdirSync(this.experimentsRoot, { recursive: true });
  }

  async ping(context = {}) {
    return this.execute({
      source: `return {
  ok: true,
  runtime: {
    pid: process.pid,
    platform: process.platform,
    node: process.versions.node,
    electron: process.versions.electron
  }
};`,
      timeoutMs: 3000,
      environment: {}
    }, { ...context, kind: 'utility.ping' });
  }

  async execute({
    source,
    cwd,
    timeoutMs = this.defaultTimeoutMs,
    environment = {}
  }, context = {}) {
    const executionId = `exe_${crypto.randomUUID()}`;
    const startedAt = new Date().toISOString();
    const sourceHash = sha256(source);
    const executionDirectory = this.#createExecutionDirectory(executionId);
    const resolvedCwd = this.#resolveCwd(cwd, executionDirectory);
    const eventContext = { ...context, executionId };
    const requestKind = context.kind || 'node.execute';
    const record = {
      child: null,
      childPid: null,
      childExited: false,
      childExitCode: null,
      context: eventContext,
      environment,
      executionDirectory,
      executionId,
      finished: false,
      killFailed: null,
      killPromise: null,
      killRequested: false,
      message: null,
      requestKind,
      resolvedCwd,
      sourceHash,
      startedAt,
      stopRequested: false,
      timedOut: false,
      timeoutMs,
      writtenBytes: { stdout: 0, stderr: 0 },
      redactionArtifacts: {}
    };

    this.#writeExecutionFiles(record, source);
    this.eventStore.append('node.execution.started', {
      sourceHash,
      timeoutMs,
      executionDirectory,
      cwd: resolvedCwd,
      environment: redactEnvironment(environment),
      runtime: 'utilityProcess'
    }, eventContext);

    const promise = new Promise((resolve) => {
      record.resolve = resolve;
      record.timeoutHandle = setTimeout(() => {
        this.#markTimeout(record);
      }, timeoutMs);
    });
    record.finishedPromise = promise;
    this.active.set(executionId, record);

    try {
      const child = this.utilityProcess.fork(this.runtimeEntry, [], {
        cwd: resolvedCwd,
        env: { ...this.runtimeEnvironment },
        stdio: 'pipe',
        serviceName: 'BlankSeed Generated Runtime'
      });
      record.child = child;
      this.#wireChild(record);
      child.postMessage({
        type: 'execute',
        protocol: 'blankseed/0.1',
        executionId,
        source,
        sourceHash,
        environment,
        cwd: resolvedCwd
      });
    } catch (error) {
      this.#finish(record, 'failed', createProtocolError(errorCodes.processExited, 'Failed to start generated runtime.', {
        executionDirectory,
        cause: serializeError(error)
      }, true));
    }

    return promise;
  }

  async stop(context = {}) {
    const records = [...this.active.values()].filter((record) => !record.finished);
    this.eventStore.append('node.runtime.stop.requested', {
      activeExecutions: records.map((record) => ({
        executionId: record.executionId,
        pid: record.childPid,
        requestKind: record.requestKind
      }))
    }, context);
    await Promise.all(records.map(async (record) => {
      record.stopRequested = true;
      await this.#requestKill(record, 'operator stop');
      await record.finishedPromise;
    }));
    this.eventStore.append('node.runtime.stop.confirmed', {
      stopped: records.length,
      remaining: this.active.size
    }, context);
    return { stopped: records.length, remaining: this.active.size };
  }

  getActiveCount() {
    return this.active.size;
  }

  shutdown(context = {}) {
    this.eventStore.append('node.runtime.shutdown.requested', {
      active: this.active.size
    }, context);
    for (const record of this.active.values()) {
      record.stopRequested = true;
      void this.#requestKill(record, 'app shutdown');
    }
  }

  #wireChild(record) {
    const child = record.child;
    child.on('spawn', () => {
      record.childPid = child.pid;
      this.#writeJson(record, 'runtime.json', {
        pid: record.childPid,
        spawnedAt: new Date().toISOString(),
        runtimeEntry: this.runtimeEntry
      });
      this.eventStore.append('node.runtime.spawned', {
        pid: record.childPid,
        executionDirectory: record.executionDirectory
      }, record.context);
    });
    child.stdout?.on('data', (chunk) => this.#recordStream(record, 'stdout', chunk));
    child.stderr?.on('data', (chunk) => this.#recordStream(record, 'stderr', chunk));
    child.on('message', (message) => {
      if (message?.type !== 'result') return;
      record.message = message;
    });
    child.on('error', (type, location, report) => {
      this.eventStore.append('node.runtime.error', {
        pid: record.childPid,
        type,
        location,
        report
      }, record.context);
    });
    child.on('exit', (code) => {
      record.childExited = true;
      record.childExitCode = code;
      this.eventStore.append('node.runtime.exited', {
        pid: record.childPid,
        code,
        timedOut: record.timedOut,
        stopRequested: record.stopRequested,
        hasResult: Boolean(record.message)
      }, record.context);
      this.#finishFromExit(record);
    });
  }

  #finishFromExit(record) {
    if (record.finished) return;
    if (record.killRequested && record.killPromise && !record.killResult) {
      record.killPromise.finally(() => this.#finishFromExit(record));
      return;
    }
    if (record.message?.status === 'ok') {
      this.#finish(record, 'completed', null, record.message.result);
      return;
    }
    if (record.message?.status === 'error') {
      const error = hydrateError(record.message.error, 'GENERATED_RUNTIME_ERROR');
      this.#finish(record, 'failed', error);
      return;
    }
    if (record.timedOut) {
      this.#finish(record, 'failed', createProtocolError(errorCodes.executionTimeout, `Generated runtime exceeded ${record.timeoutMs} ms.`, {
        timeoutMs: record.timeoutMs,
        pid: record.childPid,
        executionDirectory: record.executionDirectory,
        kill: record.killResult ?? null
      }, true));
      return;
    }
    if (record.stopRequested) {
      this.#finish(record, 'failed', createProtocolError(errorCodes.executionCancelled, 'Generated runtime was stopped by operator request.', {
        pid: record.childPid,
        executionDirectory: record.executionDirectory,
        kill: record.killResult ?? null
      }, true));
      return;
    }
    this.#finish(record, 'failed', createProtocolError(errorCodes.processExited, 'Generated runtime exited before completing execution.', {
      code: record.childExitCode,
      pid: record.childPid,
      executionDirectory: record.executionDirectory
    }, true));
  }

  #finish(record, outcome, error = null, result = null) {
    if (record.finished) return;
    record.finished = true;
    clearTimeout(record.timeoutHandle);
    clearTimeout(record.killGraceHandle);
    this.active.delete(record.executionId);

    if (outcome === 'completed') {
      this.eventStore.append('node.execution.completed', {
        durationMs: Date.now() - Date.parse(record.startedAt),
        executionDirectory: record.executionDirectory,
        pid: record.childPid,
        exitCode: record.childExitCode
      }, record.context);
      const envelope = createExecutionResult({
        sessionId: record.context.sessionId,
        requestId: record.context.requestId,
        executionId: record.executionId,
        kind: record.requestKind,
        startedAt: record.startedAt,
        sourceHash: record.sourceHash,
        result
      });
      this.#writeJson(record, 'result.json', envelope);
      record.resolve(envelope);
      return;
    }

    const finalError = error ?? createProtocolError('GENERATED_RUNTIME_ERROR', 'Generated runtime failed.');
    this.eventStore.append('node.execution.failed', {
      durationMs: Date.now() - Date.parse(record.startedAt),
      executionDirectory: record.executionDirectory,
      pid: record.childPid,
      exitCode: record.childExitCode,
      error: serializeError(finalError)
    }, record.context);
    const envelope = createExecutionFailure({
      sessionId: record.context.sessionId,
      requestId: record.context.requestId,
      executionId: record.executionId,
      kind: record.requestKind,
      startedAt: record.startedAt,
      sourceHash: record.sourceHash,
      error: finalError
    });
    this.#writeJson(record, 'result.json', envelope);
    record.resolve(envelope);
  }

  #markTimeout(record) {
    if (record.finished) return;
    record.timedOut = true;
    this.eventStore.append('node.execution.timeout', {
      timeoutMs: record.timeoutMs,
      pid: record.childPid,
      executionDirectory: record.executionDirectory
    }, record.context);
    void this.#requestKill(record, 'timeout');
  }

  async #requestKill(record, reason) {
    if (record.killPromise) return record.killPromise;
    record.killRequested = true;
    this.eventStore.append('node.runtime.kill.requested', {
      pid: record.childPid,
      reason,
      executionDirectory: record.executionDirectory
    }, record.context);

    record.killPromise = Promise.resolve()
      .then(() => this.killProcessTree(record))
      .then((result) => {
        record.killResult = result;
        const eventType = result?.ok ? 'node.runtime.kill.completed' : 'node.runtime.kill.failed';
        this.eventStore.append(eventType, {
          pid: record.childPid,
          reason,
          result
        }, record.context);
        if (!result?.ok) record.killFailed = result;
        record.killGraceHandle = setTimeout(() => {
          if (record.finished || record.childExited) return;
          this.#finish(record, 'failed', createProtocolError(errorCodes.processKillFailed, 'Generated runtime did not exit after kill request.', {
            pid: record.childPid,
            executionDirectory: record.executionDirectory,
            kill: result
          }, true));
        }, this.killGraceMs);
        return result;
      });
    return record.killPromise;
  }

  #recordStream(record, streamName, chunk) {
    const text = chunk.toString();
    const fileName = `${streamName}.log`;
    const existing = record.writtenBytes[streamName] ?? 0;
    const incomingBytes = Buffer.byteLength(text, 'utf8');
    const remaining = Math.max(0, this.maxLogBytes - existing);
    const persisted = redactTextForPersistence(text, { wholeString: true });
    const writeText = remaining > 0 ? persisted.value.slice(0, remaining) : '';
    if (writeText) {
      fs.appendFileSync(path.join(record.executionDirectory, fileName), writeText, 'utf8');
      record.writtenBytes[streamName] = existing + Buffer.byteLength(writeText, 'utf8');
    }
    this.#recordRedaction(record, fileName, persisted.metadata);
    this.eventStore.append(`node.runtime.${streamName}`, {
      text: text.slice(0, 16000),
      bytes: incomingBytes,
      retainedBytes: record.writtenBytes[streamName],
      truncated: incomingBytes > Buffer.byteLength(text.slice(0, 16000), 'utf8') || writeText.length < text.length
    }, record.context);
  }

  #createExecutionDirectory(executionId) {
    const directory = path.join(this.experimentsRoot, executionId);
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  }

  #resolveCwd(cwd, fallback) {
    if (!cwd) return fallback;
    const requested = path.isAbsolute(cwd) ? path.resolve(cwd) : path.resolve(this.workspaceRoot, cwd);
    if (!isInside(this.experimentsRoot, requested)) {
      throw createProtocolError(errorCodes.invalidRequest, 'Generated runtime cwd must stay inside workspace/experiments.', {
        cwd,
        experimentsRoot: this.experimentsRoot
      });
    }
    fs.mkdirSync(requested, { recursive: true });
    return requested;
  }

  #writeExecutionFiles(record, source) {
    const persistedSource = redactTextForPersistence(source);
    fs.writeFileSync(path.join(record.executionDirectory, 'source.cjs'), persistedSource.value, 'utf8');
    this.#recordRedaction(record, 'source.cjs', persistedSource.metadata);
    this.#writeJson(record, 'input.json', {
      protocol: 'blankseed/0.1',
      executionId: record.executionId,
      requestId: record.context.requestId,
      requestKind: record.requestKind,
      startedAt: record.startedAt,
      timeoutMs: record.timeoutMs,
      sourceHash: record.sourceHash,
      cwd: record.resolvedCwd,
      environment: redactEnvironment(record.environment)
    });
  }

  #writeJson(record, fileName, value) {
    const redacted = redactForPersistence(value);
    const persistedValue = attachPersistenceRedaction(redacted.value, redacted.metadata);
    fs.writeFileSync(path.join(record.executionDirectory, fileName), JSON.stringify(persistedValue, null, 2) + '\n', 'utf8');
    this.#recordRedaction(record, fileName, redacted.metadata);
  }

  #recordRedaction(record, fileName, metadata) {
    if (metadata.status !== 'redacted') return;
    record.redactionArtifacts[fileName] = metadata;
    const receipt = {
      schema: 'blankseed-persistence-redaction-receipt/0.1',
      executionId: record.executionId,
      updatedAt: new Date().toISOString(),
      artifacts: record.redactionArtifacts
    };
    fs.writeFileSync(path.join(record.executionDirectory, 'redaction.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  }
}

module.exports = {
  ProcessSupervisor,
  UTILITY_ENV_ALLOWLIST,
  buildUtilityProcessEnvironment,
  defaultKillProcessTree,
  hydrateError
};
