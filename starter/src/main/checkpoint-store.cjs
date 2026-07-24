'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  assertIdentifier,
  createProtocolError,
  errorCodes,
  serializeError,
  sha256
} = require('../shared/contracts.cjs');
const { activeMappingHash } = require('./module-store.cjs');
const { attachPersistenceRedaction, redactTextForPersistence } = require('../shared/persistence-redaction.cjs');

const CHECKPOINT_SCHEMA = 'blankseed-checkpoint/0.3';
const LEGACY_CHECKPOINT_SCHEMAS = Object.freeze(['blankseed-checkpoint/0.2']);
const RESTORE_TRANSITION_SCHEMA = 'blankseed-checkpoint-restore/0.1';

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function projectRestorableState(status) {
  const active = status?.modules?.active;
  if (!isPlainRecord(active)) {
    throw createProtocolError(errorCodes.checkpointFailed, 'Checkpoint source state does not contain a Module active mapping.');
  }
  return { modules: { active: { ...active } } };
}

function isMinimalRestorableState(state) {
  return isPlainRecord(state)
    && Object.keys(state).length === 1
    && isPlainRecord(state.modules)
    && Object.keys(state.modules).length === 1
    && isPlainRecord(state.modules.active);
}

function isSupportedCheckpointSchema(schema) {
  return schema === CHECKPOINT_SCHEMA || LEGACY_CHECKPOINT_SCHEMAS.includes(schema);
}

class CheckpointStore {
  constructor(baseDirectory, { appVersion, getState, eventStore, moduleStore }) {
    this.directory = path.join(baseDirectory, 'checkpoints');
    this.transitionsDirectory = path.join(baseDirectory, 'checkpoint-transitions');
    this.appVersion = appVersion;
    this.getState = getState;
    this.eventStore = eventStore;
    this.moduleStore = moduleStore;
    fs.mkdirSync(this.directory, { recursive: true });
    fs.mkdirSync(this.transitionsDirectory, { recursive: true });
  }

  create(label = 'manual checkpoint', context = {}) {
    const id = `chk_${crypto.randomUUID()}`;
    const state = projectRestorableState(this.getState());
    const persistedLabel = redactTextForPersistence(String(label).slice(0, 200), { wholeString: true });
    const checkpoint = attachPersistenceRedaction({
      schema: CHECKPOINT_SCHEMA,
      id,
      label: persistedLabel.value,
      createdAt: new Date().toISOString(),
      appVersion: this.appVersion,
      restoreScope: ['modules.active'],
      excludedState: [
        'target',
        'target.navigation',
        'browser.userData',
        'browser.storage',
        'config',
        'credentials',
        'events',
        'module.files',
        'git',
        'externalEffects'
      ],
      state,
      stateHash: sha256(JSON.stringify(state))
    }, persistedLabel.metadata);
    const filePath = path.join(this.directory, `${id}.json`);
    writeJsonAtomic(filePath, checkpoint);
    this.eventStore.append('checkpoint.created', { id, label: checkpoint.label, filePath }, context);
    return { ...checkpoint, filePath };
  }

  list() {
    return fs.readdirSync(this.directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^chk_[A-Za-z0-9_-]+\.json$/.test(entry.name))
      .map((entry) => {
        try {
          const checkpoint = this.#readFile(path.join(this.directory, entry.name));
          return {
            id: checkpoint.id,
            label: checkpoint.label,
            createdAt: checkpoint.createdAt,
            appVersion: checkpoint.appVersion,
            schema: checkpoint.schema,
            restorable: isSupportedCheckpointSchema(checkpoint.schema)
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  read(id) {
    const checkpointId = assertIdentifier(id, 'checkpointId', 'chk');
    const filePath = path.join(this.directory, `${checkpointId}.json`);
    if (!fs.existsSync(filePath)) {
      throw createProtocolError(errorCodes.checkpointFailed, 'Checkpoint does not exist.', { checkpointId });
    }
    return { ...this.#readFile(filePath), filePath };
  }

  restore(id, { confirmed = false } = {}, context = {}) {
    const checkpointId = assertIdentifier(id, 'checkpointId', 'chk');
    let checkpoint;
    let plan;
    let transition = null;
    let transitionPath = null;
    let restoreAttempted = false;
    try {
      if (!confirmed) {
        throw createProtocolError(errorCodes.invalidRequest, 'Checkpoint restore requires explicit operator confirmation.', {
          checkpointId
        });
      }
      checkpoint = this.read(checkpointId);
      this.#validateRestorable(checkpoint);
      const active = checkpoint.state?.modules?.active;
      plan = this.moduleStore.planActiveRestore(active);
      this.eventStore.append('checkpoint.restore.planned', {
        checkpointId,
        checkpointStateHash: checkpoint.stateHash,
        currentActiveHash: plan.currentActiveHash,
        targetActiveHash: plan.targetActiveHash,
        moduleCount: plan.modules.length,
        restoreScope: checkpoint.restoreScope,
        excludedState: checkpoint.excludedState
      }, context);
      const safetyCheckpoint = this.create(`before restore ${checkpointId}`, context);
      const transitionId = `rst_${crypto.randomUUID()}`;
      transitionPath = path.join(this.transitionsDirectory, `${transitionId}.json`);
      transition = {
        schema: RESTORE_TRANSITION_SCHEMA,
        transitionId,
        checkpointId,
        status: 'applying',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        safetyCheckpointId: safetyCheckpoint.id,
        previousActiveHash: plan.currentActiveHash,
        targetActiveHash: plan.targetActiveHash,
        observedActiveHash: plan.currentActiveHash,
        error: null
      };
      writeJsonAtomic(transitionPath, transition);
      restoreAttempted = true;
      const restored = this.moduleStore.restoreActive({
        active: plan.targetActive,
        expectedActive: plan.currentActive
      }, { ...context, checkpointId, restoreTransitionId: transitionId, kind: 'checkpoint.restore' });
      const result = {
        checkpointId,
        safetyCheckpointId: safetyCheckpoint.id,
        restoreScope: checkpoint.restoreScope,
        excludedState: checkpoint.excludedState,
        ...restored
      };
      transition = {
        ...transition,
        status: 'completed',
        finishedAt: new Date().toISOString(),
        observedActiveHash: restored.activeHash
      };
      writeJsonAtomic(transitionPath, transition);
      this.eventStore.append('checkpoint.restore.completed', {
        checkpointId,
        safetyCheckpointId: safetyCheckpoint.id,
        previousActiveHash: restored.previousActiveHash,
        activeHash: restored.activeHash,
        moduleCount: restored.modules.length,
        transitionId
      }, { ...context, restoreTransitionId: transitionId });
      return { ...result, transitionId, transitionPath };
    } catch (error) {
      const currentActiveHash = activeMappingHash(this.moduleStore.list().active);
      const appliedUnknown = restoreAttempted && currentActiveHash === plan?.targetActiveHash;
      if (transition && transitionPath) {
        transition = {
          ...transition,
          status: appliedUnknown ? 'applied_unknown' : 'failed',
          finishedAt: new Date().toISOString(),
          observedActiveHash: currentActiveHash,
          error: serializeError(error, errorCodes.checkpointFailed)
        };
        writeJsonAtomic(transitionPath, transition);
      }
      try {
        this.eventStore.append(appliedUnknown ? 'checkpoint.restore.applied_unknown' : 'checkpoint.restore.failed', {
          checkpointId,
          transitionId: transition?.transitionId ?? null,
          checkpointStateHash: checkpoint?.stateHash ?? null,
          targetActiveHash: plan?.targetActiveHash ?? null,
          observedActiveHash: currentActiveHash,
          restoreAttempted,
          error: serializeError(error, errorCodes.checkpointFailed)
        }, { ...context, restoreTransitionId: transition?.transitionId ?? null });
      } catch {
        // The durable transition journal remains the recovery source if Event Store append fails.
      }
      throw error;
    }
  }

  #readFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  #validateRestorable(checkpoint) {
    if (!isSupportedCheckpointSchema(checkpoint.schema)) {
      throw createProtocolError(errorCodes.checkpointFailed, 'Checkpoint schema is not restorable.', {
        schema: checkpoint.schema,
        expected: [CHECKPOINT_SCHEMA, ...LEGACY_CHECKPOINT_SCHEMAS]
      });
    }
    if (checkpoint.appVersion !== this.appVersion) {
      throw createProtocolError(errorCodes.checkpointFailed, 'Checkpoint app version does not match the running application.', {
        checkpointAppVersion: checkpoint.appVersion,
        appVersion: this.appVersion
      });
    }
    const actualStateHash = sha256(JSON.stringify(checkpoint.state));
    if (actualStateHash !== checkpoint.stateHash) {
      throw createProtocolError(errorCodes.checkpointFailed, 'Checkpoint state hash does not match.', {
        checkpointId: checkpoint.id,
        expected: checkpoint.stateHash,
        actual: actualStateHash
      });
    }
    if (checkpoint.schema === CHECKPOINT_SCHEMA && !isMinimalRestorableState(checkpoint.state)) {
      throw createProtocolError(errorCodes.checkpointFailed, 'Checkpoint state contains data outside the declared restore scope.', {
        checkpointId: checkpoint.id,
        restoreScope: checkpoint.restoreScope
      });
    }
    if (JSON.stringify(checkpoint.restoreScope) !== JSON.stringify(['modules.active'])) {
      throw createProtocolError(errorCodes.checkpointFailed, 'Checkpoint restore scope is not supported.', {
        restoreScope: checkpoint.restoreScope
      });
    }
  }
}

module.exports = {
  CHECKPOINT_SCHEMA,
  LEGACY_CHECKPOINT_SCHEMAS,
  RESTORE_TRANSITION_SCHEMA,
  CheckpointStore,
  isMinimalRestorableState,
  projectRestorableState
};
