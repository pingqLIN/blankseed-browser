'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertInteger,
  assertPayloadSize,
  assertPlainObject,
  assertString,
  createProtocolError,
  errorCodes,
  measureJsonBytes,
  serializeError,
  sha256
} = require('../shared/contracts.cjs');
const { POLICY_VERSION: TIMEOUT_POLICY_VERSION, selectEvolutionTurnTimeout } = require('./adaptive-timeout-policy.cjs');

const PROTOCOL = 'blankseed/0.1';
const RUN_SCHEMA = 'blankseed-evolution-run/0.1';

const TOOL_DEFINITIONS = Object.freeze([
  tool('target_navigate', 'Navigate the current browser target to an HTTP(S) URL through the observable target controller.', {
    type: 'object', additionalProperties: false, required: ['url'], properties: { url: { type: 'string' } }
  }),
  tool('page_snapshot', 'Capture the current remote page through the observable page broker.', {
    type: 'object', additionalProperties: false, properties: {}
  }),
  tool('page_execute', 'Execute JavaScript in the isolated page world through the observable page broker.', {
    type: 'object', additionalProperties: false, required: ['source'], properties: { source: { type: 'string' } }
  }),
  tool('cdp_send', 'Send one raw Chrome DevTools Protocol command through the observable broker.', {
    type: 'object', additionalProperties: false, required: ['method'], properties: {
      method: { type: 'string' }, params: { type: 'object' }
    }
  }),
  tool('node_execute', 'Execute generated JavaScript in the supervised utility runtime.', {
    type: 'object', additionalProperties: false, required: ['source'], properties: {
      source: { type: 'string' }, cwd: { type: 'string' }, timeoutMs: { type: 'integer' }, environment: { type: 'object' }
    }
  }),
  tool('module_list', 'List generated capability candidates, committed versions, and active versions.', {
    type: 'object', additionalProperties: false, properties: {}
  }),
  tool('module_candidate_create', 'Create an inspectable generated capability candidate.', {
    type: 'object', additionalProperties: false, required: ['manifest', 'source'], properties: {
      manifest: { type: 'object' }, source: { type: 'string' }
    }
  }),
  tool('module_candidate_test', 'Test a generated capability candidate in the supervised utility runtime. Source must provide module.exports.execute(context), module.exports.evaluate(observation, environment), or a defined top-level return value; exporting run() alone is invalid.', {
    type: 'object', additionalProperties: false, required: ['candidateId'], properties: { candidateId: { type: 'string' } }
  }),
  tool('module_candidate_page_test', 'Run a tested candidate page test through the observable isolated-world broker. The candidate execute result must contain pageTest.installSource, verifySource, uninstallSource, and rollbackVerifySource; every page script must return { ok: true } only when its phase succeeds.', {
    type: 'object', additionalProperties: false, required: ['candidateId'], properties: { candidateId: { type: 'string' } }
  }),
  tool('module_candidate_commit', 'Commit a tested candidate as an immutable generated capability version.', {
    type: 'object', additionalProperties: false, required: ['candidateId'], properties: { candidateId: { type: 'string' } }
  }),
  tool('module_activate', 'Activate a committed generated capability version.', {
    type: 'object', additionalProperties: false, required: ['id', 'version'], properties: {
      id: { type: 'string' }, version: { type: 'string' }
    }
  }),
  tool('module_rollback', 'Rollback an active generated capability to a specified committed version.', {
    type: 'object', additionalProperties: false, required: ['id', 'version'], properties: {
      id: { type: 'string' }, version: { type: 'string' }
    }
  }),
  tool('module_invoke', 'Invoke the active generated capability in the supervised utility runtime.', {
    type: 'object', additionalProperties: false, required: ['id'], properties: {
      id: { type: 'string' }, environment: { type: 'object' }, timeoutMs: { type: 'integer' }
    }
  }),
  tool('checkpoint_create', 'Create a recoverable checkpoint of current application state.', {
    type: 'object', additionalProperties: false, properties: { label: { type: 'string' } }
  })
]);

const DEFAULT_AGENT_TOOLS = Object.freeze(
  TOOL_DEFINITIONS
    .map((entry) => entry.function.name)
    .filter((name) => !['module_candidate_commit', 'module_activate', 'module_rollback'].includes(name))
);

function tool(name, description, parameters) {
  return Object.freeze({ type: 'function', function: Object.freeze({ name, description, parameters }) });
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

function protocolError(message, details = {}) {
  return createProtocolError(errorCodes.invalidRequest, message, details);
}

function asObject(value, name) {
  return value === undefined ? {} : assertPlainObject(value, name);
}

function classifyActionValue(value) {
  if (value?.passed === false) return { status: 'error', error: value.result?.error ?? null };
  if (value?.status === 'error') return { status: 'error', error: value.error ?? null };
  return { status: 'ok', error: null };
}

function serializeEvolutionError(error, metadata = {}, fallbackCode = 'INTERNAL_ERROR') {
  const serialized = serializeError(error, fallbackCode);
  const checkpointId = metadata.checkpointId ?? serialized.checkpointId ?? serialized.details?.checkpointId ?? null;
  const turnId = metadata.turnId ?? serialized.turnId ?? serialized.details?.turnId ?? null;
  const actionId = metadata.actionId ?? serialized.actionId ?? serialized.details?.actionId ?? null;
  const cause = {
    code: serialized.code,
    name: serialized.name,
    message: serialized.message,
    details: serialized.details,
    retryable: serialized.retryable
  };
  return {
    ...serialized,
    checkpointId,
    turnId,
    actionId,
    details: {
      ...serialized.details,
      checkpointId,
      turnId,
      actionId,
      cause
    }
  };
}

function summarizeObservationValue(value, depth = 0) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value ?? null;
  if (typeof value === 'string') {
    return value.length <= 240
      ? value
      : { type: 'string', originalChars: value.length, preview: value.slice(0, 240) };
  }
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      items: depth >= 3 ? [] : value.slice(0, 3).map((entry) => summarizeObservationValue(entry, depth + 1))
    };
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (depth >= 3) return { type: 'object', keys: keys.slice(0, 20), omittedKeys: Math.max(0, keys.length - 20) };
    const fields = {};
    for (const key of keys.slice(0, 16)) {
      if (key === 'stack') continue;
      fields[key] = summarizeObservationValue(value[key], depth + 1);
    }
    return {
      type: 'object',
      keys: keys.slice(0, 32),
      omittedKeys: Math.max(0, keys.length - 32),
      fields
    };
  }
  return { type: typeof value, preview: String(value).slice(0, 240) };
}

function compactObservationError(error, messageChars = 1000) {
  if (!error) return null;
  return {
    code: error.code,
    name: error.name,
    message: String(error.message || '').slice(0, messageChars),
    retryable: Boolean(error.retryable),
    checkpointId: error.checkpointId ?? error.details?.checkpointId ?? null,
    turnId: error.turnId ?? error.details?.turnId ?? null,
    actionId: error.actionId ?? error.details?.actionId ?? null,
    details: summarizeObservationValue(error.details || {})
  };
}

function boundedString(value, maxChars) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, maxChars);
}

function compactFallbackError(error) {
  if (!error) return null;
  const rawCode = String(error.code || 'INTERNAL_ERROR');
  const rawName = String(error.name || 'Error');
  return {
    code: rawCode.slice(0, 120),
    codeHash: rawCode.length > 120 ? sha256(rawCode) : null,
    name: rawName.slice(0, 120),
    nameHash: rawName.length > 120 ? sha256(rawName) : null,
    message: String(error.message || '').slice(0, 200),
    retryable: Boolean(error.retryable),
    checkpointId: boundedString(error.checkpointId ?? error.details?.checkpointId, 120),
    turnId: boundedString(error.turnId ?? error.details?.turnId, 120),
    actionId: boundedString(error.actionId ?? error.details?.actionId, 120)
  };
}

function serializeCompressedObservation(actionResult, serialized, maxChars) {
  const buildEnvelope = (observation, error, minimal = false) => ({
    protocol: actionResult.protocol,
    kind: actionResult.kind,
    actionId: actionResult.actionId,
    toolCallId: actionResult.toolCallId,
    name: actionResult.name,
    actionKind: actionResult.actionKind,
    status: actionResult.status,
    result: {
      compressed: true,
      originalChars: serialized.length,
      originalBytes: measureJsonBytes(actionResult),
      originalHash: sha256(serialized),
      observation
    },
    error,
    sourceHash: actionResult.sourceHash,
    ...(minimal ? { compressionFallback: true } : {})
  });
  let envelope = buildEnvelope(
    summarizeObservationValue(actionResult.result),
    compactObservationError(actionResult.error)
  );
  let output = JSON.stringify(envelope);
  if (output.length <= maxChars) return output;

  const value = actionResult.result;
  const observation = value && typeof value === 'object'
    ? {
        type: Array.isArray(value) ? 'array' : 'object',
        keys: Array.isArray(value) ? [] : Object.keys(value).slice(0, 16),
        length: Array.isArray(value) ? value.length : undefined
      }
    : summarizeObservationValue(value, 2);
  envelope = buildEnvelope(observation, compactObservationError(actionResult.error, 300), true);
  output = JSON.stringify(envelope);
  if (output.length <= maxChars) return output;

  const fallback = {
    protocol: boundedString(actionResult.protocol, 80),
    kind: boundedString(actionResult.kind, 80),
    actionId: boundedString(actionResult.actionId, 120),
    toolCallId: boundedString(actionResult.toolCallId, 120),
    name: boundedString(actionResult.name, 120),
    actionKind: boundedString(actionResult.actionKind, 120),
    status: actionResult.status,
    result: {
      compressed: true,
      originalChars: serialized.length,
      originalHash: sha256(serialized)
    },
    error: compactFallbackError(actionResult.error),
    sourceHash: boundedString(actionResult.sourceHash, 160),
    compressionFallback: true
  };
  const fallbackOutput = JSON.stringify(fallback);
  if (fallbackOutput.length <= maxChars) return fallbackOutput;
  return JSON.stringify({
    protocol: 'blankseed/0.1',
    kind: 'model.action.result',
    status: actionResult.status === 'error' ? 'error' : 'ok',
    result: {
      compressed: true,
      originalChars: serialized.length,
      originalHash: sha256(serialized)
    },
    error: compactFallbackError(actionResult.error),
    compressionFallback: true
  });
}

function serializeToolResultForModel(actionResult, maxChars = 12000, maxObservationChars = 4000) {
  const serialized = JSON.stringify(actionResult);
  const observationKinds = new Set(['node.execute', 'cdp.send', 'page.snapshot', 'module.list']);
  const limit = observationKinds.has(actionResult.actionKind) ? maxObservationChars : maxChars;
  if (serialized.length <= limit) return serialized;
  if (observationKinds.has(actionResult.actionKind)) {
    return serializeCompressedObservation(actionResult, serialized, limit);
  }
  return JSON.stringify({
    protocol: actionResult.protocol,
    kind: actionResult.kind,
    actionId: actionResult.actionId,
    toolCallId: actionResult.toolCallId,
    name: actionResult.name,
    actionKind: actionResult.actionKind,
    status: actionResult.status,
    result: {
      truncated: true,
      originalChars: serialized.length,
      originalHash: sha256(serialized),
      preview: serialized.slice(0, Math.floor(maxChars / 2))
    },
    error: actionResult.error ? {
      code: actionResult.error.code,
      name: actionResult.error.name,
      message: String(actionResult.error.message || '').slice(0, 1000),
      retryable: Boolean(actionResult.error.retryable)
    } : null,
    sourceHash: actionResult.sourceHash
  });
}

class RawCapabilityDispatcher {
  constructor({ target, checkpointStore, eventStore, processSupervisor, moduleStore, config }) {
    this.target = target;
    this.checkpointStore = checkpointStore;
    this.eventStore = eventStore;
    this.processSupervisor = processSupervisor;
    this.moduleStore = moduleStore;
    this.config = config;
  }

  getToolDefinitions(allowedTools = null) {
    if (!Array.isArray(allowedTools)) return TOOL_DEFINITIONS;
    const allowed = new Set(allowedTools);
    return TOOL_DEFINITIONS.filter((entry) => allowed.has(entry.function.name));
  }

  async execute({ actionId, toolCallId, name, arguments: rawArguments }, context = {}) {
    const eventContext = { ...context, actionId };
    const kind = this.#kind(name);
    let payload;
    try {
      if (Array.isArray(context.allowedTools) && !context.allowedTools.includes(name)) {
        throw protocolError('Model tool is outside the Agent profile allowlist.', { name, allowedTools: context.allowedTools });
      }
      if (typeof rawArguments !== 'string') throw protocolError('Tool arguments must be a JSON string.', { name });
      payload = JSON.parse(rawArguments);
      assertPlainObject(payload, 'tool arguments');
      assertPayloadSize(payload, this.config.ipcPayloadLimitBytes);
    } catch (error) {
      return this.#failure({ actionId, toolCallId, name, kind, error }, eventContext);
    }

    this.eventStore.append('evolution.action.started', {
      actionId,
      toolCallId,
      name,
      kind,
      payloadHash: sha256(JSON.stringify(payload))
    }, eventContext);

    try {
      const value = await this.#invoke(kind, payload, eventContext);
      const classification = classifyActionValue(value);
      const actionError = classification.error
        ? serializeEvolutionError(classification.error, {
            checkpointId: eventContext.checkpointId,
            turnId: eventContext.turnId,
            actionId
          })
        : null;
      let result = {
        protocol: PROTOCOL,
        kind: 'model.action.result',
        actionId,
        toolCallId,
        name,
        actionKind: kind,
        status: classification.status,
        result: value,
        error: actionError,
        sourceHash: value?.sourceHash ?? value?.manifest?.sourceHash ?? null
      };
      result = this.#boundResult(result);
      this.eventStore.append(
        result.status === 'ok' ? 'evolution.action.completed' : 'evolution.action.failed',
        {
          actionId,
          toolCallId,
          name,
          kind,
          status: result.status,
          executionId: value?.executionId ?? value?.result?.executionId ?? null,
          candidateId: value?.candidateId ?? null,
          moduleId: value?.moduleId ?? value?.manifest?.id ?? null,
          version: value?.version ?? value?.manifest?.version ?? null,
          sourceHash: result.sourceHash,
          error: result.error
        },
        eventContext
      );
      return result;
    } catch (error) {
      return this.#failure({ actionId, toolCallId, name, kind, error }, eventContext);
    }
  }

  #kind(name) {
    const known = new Map([
      ['target_navigate', 'target.navigate'],
      ['page_snapshot', 'page.snapshot'],
      ['page_execute', 'page.execute'],
      ['cdp_send', 'cdp.send'],
      ['node_execute', 'node.execute'],
      ['module_list', 'module.list'],
      ['module_candidate_create', 'module.candidate.create'],
      ['module_candidate_test', 'module.candidate.test'],
      ['module_candidate_page_test', 'module.candidate.page-test'],
      ['module_candidate_commit', 'module.candidate.commit'],
      ['module_activate', 'module.activate'],
      ['module_rollback', 'module.rollback'],
      ['module_invoke', 'module.invoke'],
      ['checkpoint_create', 'checkpoint.create']
    ]);
    return known.get(name) ?? null;
  }

  async #invoke(kind, payload, context) {
    if (!kind) throw protocolError('Unknown model tool.', { name: context.name });
    switch (kind) {
      case 'target.navigate':
        await this.target.navigate(assertString(payload.url, 'url', { max: 8192 }));
        return this.target.getState();
      case 'page.snapshot':
        return this.target.snapshot({
          maxTextChars: this.config.snapshotMaxTextChars,
          maxElements: this.config.snapshotMaxElements
        }, { ...context, kind });
      case 'page.execute':
        return this.target.execute(assertString(payload.source, 'source', { max: 1_000_000 }), { ...context, kind });
      case 'cdp.send':
        return this.target.sendCdp(
          assertString(payload.method, 'method', { max: 300 }),
          asObject(payload.params, 'params'),
          { ...context, kind }
        );
      case 'node.execute': {
        if (!this.config.generatedNodeRuntimeEnabled) throw protocolError('Generated Node runtime is disabled by configuration.');
        const timeoutMs = payload.timeoutMs === undefined
          ? this.config.generatedNodeRuntimeTimeoutMs
          : assertInteger(payload.timeoutMs, 'timeoutMs', { min: 1, max: 300000 });
        return this.processSupervisor.execute({
          source: assertString(payload.source, 'source', { max: 1_000_000 }),
          cwd: payload.cwd === undefined ? undefined : assertString(payload.cwd, 'cwd', { max: 4096 }),
          timeoutMs,
          environment: asObject(payload.environment, 'environment')
        }, { ...context, kind });
      }
      case 'module.list':
        return this.moduleStore.list();
      case 'module.candidate.create': {
        const manifest = asObject(payload.manifest, 'manifest');
        const provenance = asObject(manifest.provenance, 'manifest.provenance');
        return this.moduleStore.createCandidate({
          manifest: {
            ...manifest,
            provenance: {
              ...provenance,
              sessionId: context.sessionId ?? provenance.sessionId ?? null,
              checkpointId: context.checkpointId ?? provenance.checkpointId ?? null,
              model: {
                adapter: context.adapter ?? null,
                evolutionRunId: context.evolutionRunId ?? null,
                turnId: context.turnId ?? null,
                actionId: context.actionId ?? null
              }
            }
          },
          source: assertString(payload.source, 'source', { max: 1_000_000 })
        }, { ...context, kind });
      }
      case 'module.candidate.test':
        return this.moduleStore.testCandidate(assertString(payload.candidateId, 'candidateId', { max: 120 }), { ...context, kind });
      case 'module.candidate.page-test':
        return this.#runCandidatePageTest(assertString(payload.candidateId, 'candidateId', { max: 120 }), context);
      case 'module.candidate.commit':
        return this.moduleStore.commitCandidate(assertString(payload.candidateId, 'candidateId', { max: 120 }), { ...context, kind });
      case 'module.activate':
        return this.moduleStore.activate({
          id: assertString(payload.id, 'id', { max: 120 }),
          version: assertString(payload.version, 'version', { max: 80 })
        }, { ...context, kind });
      case 'module.rollback':
        return this.moduleStore.rollback({
          id: assertString(payload.id, 'id', { max: 120 }),
          version: assertString(payload.version, 'version', { max: 80 })
        }, { ...context, kind });
      case 'module.invoke': {
        const timeoutMs = payload.timeoutMs === undefined
          ? this.config.generatedNodeRuntimeTimeoutMs
          : assertInteger(payload.timeoutMs, 'timeoutMs', { min: 1, max: 300000 });
        return this.moduleStore.invoke({
          id: assertString(payload.id, 'id', { max: 120 }),
          environment: asObject(payload.environment, 'environment'),
          timeoutMs
        }, { ...context, kind });
      }
      case 'checkpoint.create':
        return this.checkpointStore.create(payload.label ?? 'model-requested checkpoint', { ...context, kind });
      default:
        throw protocolError('Unknown model action kind.', { kind });
    }
  }

  async #runCandidatePageTest(candidateId, context) {
    const prepared = await this.moduleStore.prepareCandidatePageTest(candidateId, {
      ...context,
      kind: 'module.candidate.page-test.plan'
    });
    if (prepared.status !== 'ok') return prepared;

    const target = context.expectedTarget || (() => {
      const state = this.target.getState();
      return { targetId: state.targetId, documentGeneration: state.documentGeneration };
    })();
    const phases = {};
    const phaseError = (phase, result) => {
      if (result?.status !== 'ok') return result?.error || protocolError(`Page Module ${phase} execution failed.`, { phase });
      if (result?.result?.ok !== true) {
        return protocolError(`Page Module ${phase} did not return { ok: true }.`, {
          phase,
          result: result?.result ?? null
        });
      }
      return null;
    };
    const executePhase = async (phase, source) => {
      const result = await this.target.execute(source, {
        ...context,
        kind: 'module.candidate.page-test',
        phase,
        expectedTarget: target
      });
      phases[phase] = result;
      return phaseError(phase, result);
    };

    let failure = await executePhase('install', prepared.pageTest.installSource);
    if (!failure) failure = await executePhase('verify', prepared.pageTest.verifySource);
    const uninstallFailure = await executePhase('uninstall', prepared.pageTest.uninstallSource);
    if (!failure && uninstallFailure) failure = uninstallFailure;
    const rollbackVerifyFailure = await executePhase('rollbackVerify', prepared.pageTest.rollbackVerifySource);
    if (!failure && rollbackVerifyFailure) failure = rollbackVerifyFailure;

    const value = {
      status: failure ? 'error' : 'ok',
      passed: !failure,
      candidateId: prepared.candidateId,
      moduleId: prepared.moduleId,
      version: prepared.version,
      sourceHash: prepared.sourceHash,
      planExecutionId: prepared.execution.executionId,
      target,
      phases,
      error: failure
    };
    this.eventStore.append(failure ? 'module.candidate.page-test.failed' : 'module.candidate.page-test.completed', {
      candidateId: prepared.candidateId,
      moduleId: prepared.moduleId,
      version: prepared.version,
      sourceHash: prepared.sourceHash,
      planExecutionId: prepared.execution.executionId,
      target,
      phases: Object.fromEntries(Object.entries(phases).map(([phase, result]) => [phase, {
        executionId: result?.executionId ?? null,
        status: result?.status ?? 'error'
      }])),
      error: failure
    }, context);
    return value;
  }

  #failure({ actionId, toolCallId, name, kind, error }, context) {
    const serialized = serializeEvolutionError(error, {
      checkpointId: context.checkpointId,
      turnId: context.turnId,
      actionId
    }, errorCodes.invalidRequest);
    const result = {
      protocol: PROTOCOL,
      kind: 'model.action.result',
      actionId,
      toolCallId,
      name: typeof name === 'string' ? name : null,
      actionKind: kind,
      status: 'error',
      result: null,
      error: serialized,
      sourceHash: null
    };
    this.eventStore.append('evolution.action.failed', {
      actionId,
      toolCallId,
      name: result.name,
      kind,
      status: 'error',
      error: serialized
    }, context);
    return result;
  }

  #boundResult(result) {
    const maxBytes = this.config.evolutionActionResultLimitBytes;
    const bytes = measureJsonBytes(result);
    if (!Number.isInteger(maxBytes) || bytes <= maxBytes) return result;
    return {
      ...result,
      status: 'error',
      result: null,
      error: serializeError(protocolError('Model action result exceeded the configured evidence limit.', {
        bytes,
        maxBytes,
        resultHash: sha256(JSON.stringify(result))
      }))
    };
  }
}

class EvolutionRunManager {
  constructor({
    eventStore,
    modelTurnManager,
    dispatcher,
    checkpointStore,
    workspaceRoot,
    defaultMaxTurns = 12,
    defaultMaxActions = 32,
    maxObservationChars = 4000,
    timeoutPolicyMs = null,
    maxEvidenceBytes = 16_777_216
  }) {
    this.eventStore = eventStore;
    this.modelTurnManager = modelTurnManager;
    this.dispatcher = dispatcher;
    this.checkpointStore = checkpointStore;
    this.runsRoot = path.join(path.resolve(workspaceRoot), 'evolution-runs');
    this.defaultMaxTurns = defaultMaxTurns;
    this.defaultMaxActions = defaultMaxActions;
    this.maxObservationChars = maxObservationChars;
    this.timeoutPolicyMs = timeoutPolicyMs;
    this.maxEvidenceBytes = maxEvidenceBytes;
    this.active = new Map();
    fs.mkdirSync(this.runsRoot, { recursive: true });
  }

  async run(payload = {}, context = {}, runtime = {}) {
    const evolutionRunId = `evo_${crypto.randomUUID()}`;
    const startedAt = new Date().toISOString();
    const controller = new AbortController();
    const cancelFromParent = () => controller.abort('cancel');
    if (runtime.signal?.aborted) cancelFromParent();
    else runtime.signal?.addEventListener('abort', cancelFromParent, { once: true });
    const adapter = assertString(payload.adapter || 'local.manual', 'adapter', { max: 120 });
    const maxTurns = payload.maxTurns === undefined
      ? this.defaultMaxTurns
      : assertInteger(payload.maxTurns, 'maxTurns', { min: 1, max: 100 });
    const maxActions = payload.maxActions === undefined
      ? this.defaultMaxActions
      : assertInteger(payload.maxActions, 'maxActions', { min: 1, max: 500 });
    const messages = Array.isArray(payload.messages) ? payload.messages.map((message) => ({ ...message })) : payload.messages;
    const allowedTools = payload.allowedTools === undefined
      ? [...DEFAULT_AGENT_TOOLS]
      : [...new Set((Array.isArray(payload.allowedTools) ? payload.allowedTools : []).map((name) => assertString(name, 'allowed tool', { max: 120 })))];
    const directory = path.join(this.runsRoot, evolutionRunId);
    const evidencePath = path.join(directory, 'run.json');
    const runContext = { ...context, evolutionRunId, adapter, allowedTools };
    const checkpoint = this.checkpointStore.create(`evolution run ${evolutionRunId}`, runContext);
    runContext.checkpointId = checkpoint.id;
    const evidence = {
      schema: RUN_SCHEMA,
      protocol: PROTOCOL,
      evolutionRunId,
      sessionId: context.sessionId ?? null,
      requestId: context.requestId ?? null,
      adapter,
      agent: context.agentId ? {
        agentId: context.agentId,
        role: context.agentRole ?? null,
        multiAgentRunId: context.multiAgentRunId ?? null,
        parentAgentId: context.parentAgentId ?? null,
        handoffId: context.handoffId ?? null
      } : null,
      startedAt,
      finishedAt: null,
      status: 'running',
      limits: { maxTurns, maxActions, timeoutPolicyVersion: TIMEOUT_POLICY_VERSION },
      checkpoint,
      inputMessages: messages,
      transcript: [],
      actions: [],
      metrics: { turns: 0, actions: 0, failedActions: 0 },
      output: null,
      error: null
    };
    this.active.set(evolutionRunId, { controller, evidencePath });
    this.#persist(evidencePath, evidence);
    this.eventStore.append('evolution.run.started', {
      evolutionRunId,
      adapter,
      checkpointId: checkpoint.id,
      maxTurns,
      maxActions,
      evidencePath
    }, runContext);

    const conversation = messages;
    const seenToolCallIds = new Set();
    let currentTurnId = null;
    let currentActionId = null;
    let previousAction = null;
    try {
      for (let turnSequence = 1; turnSequence <= maxTurns; turnSequence += 1) {
        this.#throwIfCancelled(controller.signal);
        currentTurnId = null;
        currentActionId = null;
        const timeoutPolicy = selectEvolutionTurnTimeout({
          explicitTimeoutMs: payload.timeoutMs,
          policy: this.timeoutPolicyMs,
          previousAction,
          turnSequence
        });
        this.eventStore.append('evolution.turn.timeout.selected', {
          evolutionRunId,
          turnSequence,
          previousAction,
          ...timeoutPolicy
        }, runContext);
        const turn = await this.modelTurnManager.turn({
          adapter,
          messages: conversation,
          options: payload.options || {},
          timeoutMs: timeoutPolicy.timeoutMs
        }, runContext, {
          signal: controller.signal,
          tools: this.dispatcher.getToolDefinitions(allowedTools)
        });
        currentTurnId = turn.turnId ?? null;
        evidence.metrics.turns += 1;
        evidence.transcript.push({
          sequence: turnSequence,
          turnId: turn.turnId,
          status: turn.status,
          timeoutPolicy,
          contextHash: turn.contextHash,
          inputHash: turn.inputHash,
          messages: turn.messages,
          contextPackage: turn.contextPackage,
          output: turn.output,
          error: turn.error
        });
        this.#persist(evidencePath, evidence);
        if (turn.status !== 'ok') {
          throw createProtocolError(
            turn.error?.code || errorCodes.modelAdapterFailed,
            turn.error?.message || 'Model turn failed.',
            turn.error?.details || {},
            Boolean(turn.error?.retryable)
          );
        }

        const rawRequests = Array.isArray(turn.output?.toolRequests) ? turn.output.toolRequests : [];
        const normalizedRequests = rawRequests.map((request) => ({
          id: typeof request?.id === 'string' && request.id ? request.id.slice(0, 120) : `call_${crypto.randomUUID()}`,
          type: 'function',
          name: typeof request?.name === 'string' && request.name ? request.name.slice(0, 120) : 'invalid_action',
          arguments: typeof request?.arguments === 'string' && request.arguments.length <= 1_000_000 ? request.arguments : '{}',
          providerItemId: typeof request?.providerItemId === 'string' ? request.providerItemId.slice(0, 120) : null,
          invalidReason: !request?.id || !request?.name || typeof request?.arguments !== 'string' || request.arguments.length > 1_000_000
            ? 'Tool call id, name, or arguments are invalid.'
            : null
        }));
        conversation.push({
          role: 'assistant',
          content: typeof turn.output?.content === 'string' ? turn.output.content : '',
          toolRequests: normalizedRequests.map(({ invalidReason, ...request }) => request)
        });

        if (normalizedRequests.length === 0) {
          if (!turn.output?.content) throw protocolError('Model output contained neither content nor tool requests.');
          evidence.output = turn.output;
          return this.#finish(evidence, evidencePath, runContext, 'ok');
        }

        for (const request of normalizedRequests) {
          this.#throwIfCancelled(controller.signal);
          if (evidence.metrics.actions >= maxActions) {
            throw protocolError(`Evolution run exceeded ${maxActions} actions.`, { maxActions });
          }
          const actionId = `act_${crypto.randomUUID()}`;
          currentActionId = actionId;
          let actionResult;
          const duplicate = seenToolCallIds.has(request.id);
          seenToolCallIds.add(request.id);
          if (request.invalidReason || duplicate) {
            actionResult = await this.dispatcher.execute({
              actionId,
              toolCallId: request.id,
              name: duplicate ? 'invalid_action' : request.name,
              arguments: duplicate ? JSON.stringify({ duplicateToolCallId: request.id }) : null
            }, { ...runContext, checkpointId: checkpoint.id, turnId: turn.turnId, allowedTools });
          } else {
            actionResult = await this.dispatcher.execute({
              actionId,
              toolCallId: request.id,
              name: request.name,
              arguments: request.arguments
            }, { ...runContext, checkpointId: checkpoint.id, turnId: turn.turnId, allowedTools });
          }
          evidence.metrics.actions += 1;
          if (actionResult.status === 'error') evidence.metrics.failedActions += 1;
          previousAction = {
            actionKind: actionResult.actionKind,
            status: actionResult.status
          };
          evidence.actions.push({
            sequence: evidence.metrics.actions,
            turnId: turn.turnId,
            request: { actionId, toolCallId: request.id, name: request.name, arguments: request.arguments },
            result: actionResult
          });
          if (actionResult.status === 'ok' && actionResult.actionKind === 'target.navigate') {
            const nextTarget = actionResult.result || {};
            runContext.expectedTarget = {
              targetId: nextTarget.targetId,
              documentGeneration: nextTarget.documentGeneration
            };
          }
          conversation.push({
            role: 'tool',
            name: request.name,
            toolCallId: request.id,
            content: serializeToolResultForModel(actionResult, 12000, this.maxObservationChars)
          });
          this.#persist(evidencePath, evidence);
        }
      }
      throw protocolError(`Evolution run exceeded ${maxTurns} model turns.`, { maxTurns });
    } catch (error) {
      const status = controller.signal.aborted ? 'cancelled' : 'error';
      evidence.error = serializeEvolutionError(error, {
        checkpointId: checkpoint.id,
        turnId: currentTurnId,
        actionId: currentActionId
      }, controller.signal.aborted ? errorCodes.executionCancelled : 'INTERNAL_ERROR');
      this.eventStore.append('evolution.run.retry.decided', {
        evolutionRunId,
        decision: status === 'cancelled'
          ? 'cancelled'
          : (evidence.error.retryable ? 'checkpoint-recovery-eligible' : 'not-retryable'),
        automaticRetry: false,
        code: evidence.error.code,
        retryable: evidence.error.retryable,
        checkpointId: evidence.error.checkpointId,
        turnId: evidence.error.turnId,
        actionId: evidence.error.actionId,
        evidencePath
      }, { ...runContext, turnId: currentTurnId, actionId: currentActionId });
      return this.#finish(evidence, evidencePath, runContext, status);
    } finally {
      this.active.delete(evolutionRunId);
      runtime.signal?.removeEventListener('abort', cancelFromParent);
    }
  }

  cancel({ evolutionRunId } = {}, context = {}) {
    const records = evolutionRunId ? [[evolutionRunId, this.active.get(evolutionRunId)]] : [...this.active.entries()];
    const active = records.filter(([, record]) => record);
    this.eventStore.append('evolution.run.cancel.requested', {
      requestedRunId: evolutionRunId ?? null,
      activeRunIds: active.map(([runId]) => runId)
    }, context);
    for (const [, record] of active) record.controller.abort('cancel');
    this.eventStore.append('evolution.run.cancel.completed', {
      cancelled: active.length,
      boundary: 'Stops active model requests and prevents later action dispatch; use Stop All to also request broker/runtime termination.'
    }, context);
    return { cancelled: active.length };
  }

  getActiveCount() {
    return this.active.size;
  }

  #finish(evidence, evidencePath, context, status) {
    evidence.status = status;
    evidence.finishedAt = new Date().toISOString();
    let finalEvidence = evidence;
    try {
      this.#persist(evidencePath, evidence);
    } catch (limitError) {
      const safeEvidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
      safeEvidence.status = 'error';
      safeEvidence.finishedAt = evidence.finishedAt;
      safeEvidence.metrics = evidence.metrics;
      safeEvidence.output = null;
      safeEvidence.error = evidence.error || serializeError(limitError);
      safeEvidence.evidenceTruncated = {
        reason: serializeError(limitError),
        attemptedHash: sha256(JSON.stringify(evidence))
      };
      writeJsonAtomic(evidencePath, safeEvidence);
      finalEvidence = safeEvidence;
      status = 'error';
    }
    const result = {
      protocol: PROTOCOL,
      kind: 'evolution.run.result',
      evolutionRunId: finalEvidence.evolutionRunId,
      sessionId: finalEvidence.sessionId,
      requestId: finalEvidence.requestId,
      status,
      startedAt: finalEvidence.startedAt,
      finishedAt: finalEvidence.finishedAt,
      durationMs: Date.parse(finalEvidence.finishedAt) - Date.parse(finalEvidence.startedAt),
      checkpointId: finalEvidence.checkpoint.id,
      evidencePath,
      metrics: finalEvidence.metrics,
      output: finalEvidence.output,
      error: finalEvidence.error
    };
    const eventType = status === 'ok'
      ? 'evolution.run.completed'
      : (status === 'cancelled' ? 'evolution.run.cancelled' : 'evolution.run.failed');
    this.eventStore.append(eventType, {
      evolutionRunId: finalEvidence.evolutionRunId,
      status,
      checkpointId: finalEvidence.checkpoint.id,
      evidencePath,
      metrics: finalEvidence.metrics,
      outputHash: finalEvidence.output ? sha256(JSON.stringify(finalEvidence.output)) : null,
      error: finalEvidence.error
    }, context);
    return result;
  }

  #throwIfCancelled(signal) {
    if (signal.aborted) {
      throw createProtocolError(errorCodes.executionCancelled, 'Evolution run was cancelled.', {}, true);
    }
  }

  #persist(evidencePath, evidence) {
    const bytes = measureJsonBytes(evidence);
    if (bytes > this.maxEvidenceBytes) {
      throw protocolError('Evolution run evidence exceeded the configured byte budget.', {
        bytes,
        maxBytes: this.maxEvidenceBytes
      });
    }
    writeJsonAtomic(evidencePath, evidence);
  }
}

module.exports = {
  DEFAULT_AGENT_TOOLS,
  EvolutionRunManager,
  RawCapabilityDispatcher,
  RUN_SCHEMA,
  TOOL_DEFINITIONS,
  serializeToolResultForModel
};
