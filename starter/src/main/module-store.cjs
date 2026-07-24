'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertPlainObject,
  assertString,
  createProtocolError,
  errorCodes,
  sha256
} = require('../shared/contracts.cjs');

const MODULE_SCHEMA = 'blankseed-module/0.1';
const MODULE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;
const RUNTIMES = new Set(['node', 'page', 'hybrid', 'ui']);

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

function activeMappingHash(value) {
  const normalized = Object.fromEntries(Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right)));
  return sha256(JSON.stringify(normalized));
}

function assertPattern(value, name, pattern) {
  if (!pattern.test(value)) {
    throw createProtocolError(errorCodes.invalidRequest, `${name} has an invalid format.`, { [name]: value });
  }
  return value;
}

function assertEntry(value) {
  const entry = assertString(value || 'index.cjs', 'entry', { min: 1, max: 200 });
  if (path.isAbsolute(entry) || entry.includes('..') || !/\.(cjs|mjs|js)$/.test(entry)) {
    throw createProtocolError(errorCodes.invalidRequest, 'entry must be a relative JavaScript file path.', { entry });
  }
  return entry.replaceAll('\\', '/');
}

function asObject(value, name) {
  return value === undefined ? {} : assertPlainObject(value, name);
}

function normalizePageTestPlan(value) {
  const result = asObject(value, 'module result');
  const pageTest = asObject(result.pageTest, 'module result.pageTest');
  return {
    installSource: assertString(pageTest.installSource, 'module result.pageTest.installSource', { min: 1, max: 1_000_000 }),
    verifySource: assertString(pageTest.verifySource, 'module result.pageTest.verifySource', { min: 1, max: 1_000_000 }),
    uninstallSource: assertString(pageTest.uninstallSource, 'module result.pageTest.uninstallSource', { min: 1, max: 1_000_000 }),
    rollbackVerifySource: assertString(pageTest.rollbackVerifySource, 'module result.pageTest.rollbackVerifySource', { min: 1, max: 1_000_000 })
  };
}

class ModuleStore {
  constructor({ workspaceRoot, eventStore, processSupervisor, defaultTimeoutMs = 10000 }) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.modulesRoot = path.join(this.workspaceRoot, 'modules');
    this.candidatesRoot = path.join(this.modulesRoot, '.candidates');
    this.stateRoot = path.join(this.workspaceRoot, 'state');
    this.activeFile = path.join(this.stateRoot, 'active-modules.json');
    this.eventStore = eventStore;
    this.processSupervisor = processSupervisor;
    this.defaultTimeoutMs = defaultTimeoutMs;
    fs.mkdirSync(this.candidatesRoot, { recursive: true });
    fs.mkdirSync(this.stateRoot, { recursive: true });
    this.active = readJson(this.activeFile, {});
  }

  getState() {
    return {
      modulesRoot: this.modulesRoot,
      active: { ...this.active }
    };
  }

  list() {
    return {
      active: { ...this.active },
      modules: this.#listCommittedModules(),
      candidates: this.#listCandidates()
    };
  }

  createCandidate({ manifest = {}, source }, context = {}) {
    const candidateId = `cand_${crypto.randomUUID()}`;
    const sourceText = assertString(source, 'source', { min: 1, max: 1_000_000 });
    const normalized = this.#normalizeManifest(manifest, sourceText, {
      candidateId,
      context,
      status: 'candidate'
    });
    const directory = this.#candidateDirectory(candidateId);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, normalized.entry), sourceText, 'utf8');
    writeJson(path.join(directory, 'manifest.json'), normalized);
    this.eventStore.append('module.candidate.created', {
      candidateId,
      moduleId: normalized.id,
      version: normalized.version,
      sourceHash: normalized.sourceHash,
      directory
    }, context);
    return { candidateId, directory, manifest: normalized };
  }

  async testCandidate(candidateId, context = {}) {
    const candidate = this.#readCandidate(candidateId);
    const result = await this.processSupervisor.execute({
      source: candidate.source,
      timeoutMs: this.defaultTimeoutMs,
      environment: {
        BLANKSEED_MODULE_TEST: '1',
        BLANKSEED_MODULE_ID: candidate.manifest.id,
        BLANKSEED_MODULE_VERSION: candidate.manifest.version
      }
    }, { ...context, kind: 'module.test' });
    const passed = result.status === 'ok';
    const manifest = {
      ...candidate.manifest,
      provenance: {
        ...candidate.manifest.provenance,
        executionIds: [...new Set([
          ...(candidate.manifest.provenance?.executionIds ?? []),
          result.executionId
        ])]
      },
      status: passed ? 'tested' : 'candidate',
      testedAt: new Date().toISOString(),
      testExecutionId: result.executionId
    };
    writeJson(path.join(candidate.directory, 'manifest.json'), manifest);
    writeJson(path.join(candidate.directory, 'test-result.json'), result);
    this.eventStore.append('module.candidate.tested', {
      candidateId,
      moduleId: manifest.id,
      version: manifest.version,
      passed,
      executionId: result.executionId
    }, context);
    return { candidateId, passed, result, manifest };
  }

  async prepareCandidatePageTest(candidateId, context = {}) {
    const candidate = this.#readCandidate(candidateId);
    this.#assertSourceHash(candidate.manifest, candidate.source);
    if (candidate.manifest.status !== 'tested') {
      throw createProtocolError(errorCodes.invalidRequest, 'Candidate must pass supervised module testing before page verification.', {
        candidateId,
        status: candidate.manifest.status
      });
    }
    this.eventStore.append('module.candidate.page-test.plan.started', {
      candidateId,
      moduleId: candidate.manifest.id,
      version: candidate.manifest.version,
      sourceHash: candidate.manifest.sourceHash
    }, context);
    const execution = await this.processSupervisor.execute({
      source: candidate.source,
      timeoutMs: this.defaultTimeoutMs,
      environment: {
        BLANKSEED_MODULE_PAGE_TEST: '1',
        BLANKSEED_MODULE_ID: candidate.manifest.id,
        BLANKSEED_MODULE_VERSION: candidate.manifest.version
      }
    }, { ...context, kind: 'module.candidate.page-test.plan' });
    if (execution.status !== 'ok') {
      this.eventStore.append('module.candidate.page-test.plan.failed', {
        candidateId,
        moduleId: candidate.manifest.id,
        version: candidate.manifest.version,
        sourceHash: candidate.manifest.sourceHash,
        executionId: execution.executionId,
        error: execution.error
      }, context);
      return {
        status: 'error',
        candidateId,
        moduleId: candidate.manifest.id,
        version: candidate.manifest.version,
        sourceHash: candidate.manifest.sourceHash,
        execution,
        error: execution.error
      };
    }
    const pageTest = normalizePageTestPlan(execution.result);
    this.eventStore.append('module.candidate.page-test.plan.completed', {
      candidateId,
      moduleId: candidate.manifest.id,
      version: candidate.manifest.version,
      sourceHash: candidate.manifest.sourceHash,
      executionId: execution.executionId,
      phases: ['install', 'verify', 'uninstall', 'rollbackVerify']
    }, context);
    return {
      status: 'ok',
      candidateId,
      moduleId: candidate.manifest.id,
      version: candidate.manifest.version,
      sourceHash: candidate.manifest.sourceHash,
      execution,
      pageTest
    };
  }

  commitCandidate(candidateId, context = {}) {
    const candidate = this.#readCandidate(candidateId);
    this.#assertSourceHash(candidate.manifest, candidate.source);
    if (candidate.manifest.status !== 'tested') {
      throw createProtocolError(errorCodes.invalidRequest, 'Candidate must pass testing before commit.', {
        candidateId,
        status: candidate.manifest.status
      });
    }
    const versionDirectory = this.#versionDirectory(candidate.manifest.id, candidate.manifest.version);
    if (fs.existsSync(versionDirectory)) {
      throw createProtocolError(errorCodes.moduleVersionConflict, 'Module version already exists.', {
        moduleId: candidate.manifest.id,
        version: candidate.manifest.version
      });
    }
    fs.mkdirSync(versionDirectory, { recursive: true });
    const manifest = {
      ...candidate.manifest,
      status: 'committed',
      committedAt: new Date().toISOString(),
      candidateId
    };
    fs.copyFileSync(path.join(candidate.directory, candidate.manifest.entry), path.join(versionDirectory, manifest.entry));
    writeJson(path.join(versionDirectory, 'manifest.json'), manifest);
    this.eventStore.append('module.version.committed', {
      candidateId,
      moduleId: manifest.id,
      version: manifest.version,
      directory: versionDirectory,
      sourceHash: manifest.sourceHash
    }, context);
    return { moduleId: manifest.id, version: manifest.version, directory: versionDirectory, manifest };
  }

  activate(input, context = {}) {
    const { id, version, expectedActiveVersion } = input;
    const moduleId = this.#assertModuleId(id);
    const targetVersion = this.#assertVersion(version);
    const manifest = this.#readCommittedManifest(moduleId, targetVersion);
    const previousVersion = this.active[moduleId] ?? null;
    if (Object.hasOwn(input, 'expectedActiveVersion') && previousVersion !== expectedActiveVersion) {
      throw createProtocolError(errorCodes.moduleVersionConflict, 'Active Module version changed before activation.', {
        moduleId,
        expectedActiveVersion,
        currentActiveVersion: previousVersion
      }, true);
    }
    this.active[moduleId] = targetVersion;
    this.#writeActive();
    this.eventStore.append('module.activated', {
      moduleId,
      version: targetVersion,
      previousVersion,
      sourceHash: manifest.sourceHash
    }, context);
    return { moduleId, version: targetVersion, previousVersion, active: { ...this.active } };
  }

  deactivate({ id }, context = {}) {
    const moduleId = this.#assertModuleId(id);
    const previousVersion = this.active[moduleId] ?? null;
    delete this.active[moduleId];
    this.#writeActive();
    this.eventStore.append('module.deactivated', { moduleId, previousVersion }, context);
    return { moduleId, previousVersion, active: { ...this.active } };
  }

  rollback({ id, version }, context = {}) {
    const moduleId = this.#assertModuleId(id);
    const targetVersion = this.#assertVersion(version);
    const manifest = this.#readCommittedManifest(moduleId, targetVersion);
    const previousVersion = this.active[moduleId] ?? null;
    this.active[moduleId] = targetVersion;
    this.#writeActive();
    this.eventStore.append('module.rollback.completed', {
      moduleId,
      fromVersion: previousVersion,
      toVersion: targetVersion,
      sourceHash: manifest.sourceHash
    }, context);
    return { moduleId, fromVersion: previousVersion, toVersion: targetVersion, active: { ...this.active } };
  }

  planActiveRestore(activeInput) {
    const requested = asObject(activeInput, 'active');
    const targetActive = {};
    const modules = [];
    for (const [id, version] of Object.entries(requested)) {
      const moduleId = this.#assertModuleId(id);
      const targetVersion = this.#assertVersion(version);
      const committed = this.#readCommitted(moduleId, targetVersion);
      this.#assertSourceHash(committed.manifest, committed.source);
      targetActive[moduleId] = targetVersion;
      modules.push({ moduleId, version: targetVersion, sourceHash: committed.manifest.sourceHash });
    }
    return {
      currentActive: { ...this.active },
      currentActiveHash: activeMappingHash(this.active),
      targetActive,
      targetActiveHash: activeMappingHash(targetActive),
      modules
    };
  }

  restoreActive({ active, expectedActive }, context = {}) {
    const plan = this.planActiveRestore(active);
    const expected = asObject(expectedActive, 'expectedActive');
    const expectedHash = activeMappingHash(expected);
    const currentHash = activeMappingHash(this.active);
    const persisted = readJson(this.activeFile, {});
    const persistedHash = activeMappingHash(persisted);
    if (currentHash !== expectedHash || persistedHash !== expectedHash) {
      throw createProtocolError(errorCodes.moduleVersionConflict, 'Active Module mapping changed before restore.', {
        expectedHash,
        currentHash,
        persistedHash
      }, true);
    }
    writeJsonAtomic(this.activeFile, plan.targetActive);
    this.active = { ...plan.targetActive };
    this.eventStore.append('module.active.restore.completed', {
      previousActiveHash: expectedHash,
      activeHash: plan.targetActiveHash,
      moduleCount: plan.modules.length,
      modules: plan.modules
    }, context);
    return {
      previousActive: { ...expected },
      active: { ...this.active },
      previousActiveHash: expectedHash,
      activeHash: plan.targetActiveHash,
      modules: plan.modules
    };
  }

  async invoke({ id, environment = {}, timeoutMs = this.defaultTimeoutMs }, context = {}) {
    const moduleId = this.#assertModuleId(id);
    const version = this.active[moduleId];
    if (!version) {
      throw createProtocolError(errorCodes.invalidRequest, 'Module is not active.', { moduleId });
    }
    const committed = this.#readCommitted(moduleId, version);
    this.#assertSourceHash(committed.manifest, committed.source);
    this.eventStore.append('module.invocation.started', {
      moduleId,
      version,
      sourceHash: committed.manifest.sourceHash
    }, context);
    const result = await this.processSupervisor.execute({
      source: committed.source,
      timeoutMs,
      environment: asObject(environment, 'environment')
    }, { ...context, kind: 'module.invoke' });
    this.eventStore.append(result.status === 'ok' ? 'module.invocation.completed' : 'module.invocation.failed', {
      moduleId,
      version,
      executionId: result.executionId,
      status: result.status,
      error: result.error
    }, context);
    return result;
  }

  #normalizeManifest(manifestInput, source, { candidateId, context, status }) {
    const manifest = asObject(manifestInput, 'manifest');
    const id = this.#assertModuleId(manifest.id);
    const version = this.#assertVersion(manifest.version);
    const runtime = assertString(manifest.runtime || 'node', 'runtime', { min: 1, max: 40 });
    if (!RUNTIMES.has(runtime)) {
      throw createProtocolError(errorCodes.invalidRequest, 'runtime is not supported by the module manifest.', { runtime });
    }
    const entry = assertEntry(manifest.entry);
    const sourceHash = sha256(source);
    return {
      schema: MODULE_SCHEMA,
      id,
      version,
      ...(manifest.parentVersion === undefined ? {} : {
        parentVersion: this.#assertVersion(manifest.parentVersion)
      }),
      ...(manifest.migrationReason === undefined ? {} : {
        migrationReason: assertString(manifest.migrationReason, 'migrationReason', { min: 1, max: 500 })
      }),
      description: assertString(manifest.description || 'Generated capability', 'description', { min: 1, max: 500 }),
      entry,
      runtime,
      createdAt: manifest.createdAt || new Date().toISOString(),
      sourceHash,
      provenance: this.#normalizeProvenance(manifest.provenance, context),
      dependencies: asObject(manifest.dependencies, 'dependencies'),
      tests: Array.isArray(manifest.tests) ? manifest.tests : [],
      status,
      candidateId
    };
  }

  #normalizeProvenance(value, context) {
    const provenance = asObject(value, 'provenance');
    return {
      sessionId: provenance.sessionId ?? context.sessionId ?? null,
      executionIds: Array.isArray(provenance.executionIds) ? provenance.executionIds : [],
      checkpointId: provenance.checkpointId ?? null,
      model: provenance.model ?? null
    };
  }

  #readCandidate(candidateId) {
    const id = assertString(candidateId, 'candidateId', { min: 8, max: 120 });
    if (!id.startsWith('cand_')) {
      throw createProtocolError(errorCodes.invalidRequest, 'candidateId is invalid.', { candidateId });
    }
    const directory = this.#candidateDirectory(id);
    const manifest = readJson(path.join(directory, 'manifest.json'), null);
    if (!manifest) {
      throw createProtocolError(errorCodes.invalidRequest, 'Candidate does not exist.', { candidateId });
    }
    const sourcePath = path.join(directory, manifest.entry);
    return {
      directory,
      manifest,
      source: fs.readFileSync(sourcePath, 'utf8')
    };
  }

  #readCommitted(moduleId, version) {
    const manifest = this.#readCommittedManifest(moduleId, version);
    const directory = this.#versionDirectory(moduleId, version);
    return {
      directory,
      manifest,
      source: fs.readFileSync(path.join(directory, manifest.entry), 'utf8')
    };
  }

  #readCommittedManifest(moduleId, version) {
    const manifest = readJson(path.join(this.#versionDirectory(moduleId, version), 'manifest.json'), null);
    if (!manifest) {
      throw createProtocolError(errorCodes.invalidRequest, 'Committed module version does not exist.', {
        moduleId,
        version
      });
    }
    return manifest;
  }

  #assertSourceHash(manifest, source) {
    const actual = sha256(source);
    if (manifest.sourceHash !== actual) {
      throw createProtocolError(errorCodes.invalidRequest, 'Module source hash does not match manifest.', {
        moduleId: manifest.id,
        version: manifest.version,
        expected: manifest.sourceHash,
        actual
      });
    }
  }

  #candidateDirectory(candidateId) {
    return path.join(this.candidatesRoot, candidateId);
  }

  #versionDirectory(moduleId, version) {
    return path.join(this.modulesRoot, moduleId, 'versions', version);
  }

  #writeActive() {
    writeJsonAtomic(this.activeFile, this.active);
  }

  #listCandidates() {
    if (!fs.existsSync(this.candidatesRoot)) return [];
    return fs.readdirSync(this.candidatesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readJson(path.join(this.candidatesRoot, entry.name, 'manifest.json'), null))
      .filter(Boolean);
  }

  #listCommittedModules() {
    if (!fs.existsSync(this.modulesRoot)) return [];
    return fs.readdirSync(this.modulesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .flatMap((entry) => {
        const versionsRoot = path.join(this.modulesRoot, entry.name, 'versions');
        if (!fs.existsSync(versionsRoot)) return [];
        return fs.readdirSync(versionsRoot, { withFileTypes: true })
          .filter((versionEntry) => versionEntry.isDirectory())
          .map((versionEntry) => readJson(path.join(versionsRoot, versionEntry.name, 'manifest.json'), null))
          .filter(Boolean);
      });
  }

  #assertModuleId(value) {
    return assertPattern(assertString(value, 'module id', { min: 3, max: 120 }), 'moduleId', MODULE_ID_PATTERN);
  }

  #assertVersion(value) {
    return assertPattern(assertString(value, 'version', { min: 5, max: 80 }), 'version', VERSION_PATTERN);
  }
}

module.exports = {
  activeMappingHash,
  MODULE_SCHEMA,
  ModuleStore
};
