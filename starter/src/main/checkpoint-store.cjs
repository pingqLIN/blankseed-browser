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

const CHECKPOINT_SCHEMA = 'blankseed-checkpoint/0.2';

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

class CheckpointStore {
  constructor(baseDirectory, { appVersion, getState, eventStore, moduleStore }) {
    this.directory = path.join(baseDirectory, 'checkpoints');
    this.appVersion = appVersion;
    this.getState = getState;
    this.eventStore = eventStore;
    this.moduleStore = moduleStore;
    fs.mkdirSync(this.directory, { recursive: true });
  }

  create(label = 'manual checkpoint', context = {}) {
    const id = `chk_${crypto.randomUUID()}`;
    const state = this.getState();
    const checkpoint = {
      schema: CHECKPOINT_SCHEMA,
      id,
      label: String(label).slice(0, 200),
      createdAt: new Date().toISOString(),
      appVersion: this.appVersion,
      restoreScope: ['modules.active'],
      excludedState: [
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
    };
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
            restorable: checkpoint.schema === CHECKPOINT_SCHEMA
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
      const restored = this.moduleStore.restoreActive({
        active: plan.targetActive,
        expectedActive: plan.currentActive
      }, { ...context, checkpointId, kind: 'checkpoint.restore' });
      const result = {
        checkpointId,
        safetyCheckpointId: safetyCheckpoint.id,
        restoreScope: checkpoint.restoreScope,
        excludedState: checkpoint.excludedState,
        ...restored
      };
      this.eventStore.append('checkpoint.restore.completed', {
        checkpointId,
        safetyCheckpointId: safetyCheckpoint.id,
        previousActiveHash: restored.previousActiveHash,
        activeHash: restored.activeHash,
        moduleCount: restored.modules.length
      }, context);
      return result;
    } catch (error) {
      this.eventStore.append('checkpoint.restore.failed', {
        checkpointId,
        checkpointStateHash: checkpoint?.stateHash ?? null,
        targetActiveHash: plan?.targetActiveHash ?? null,
        error: serializeError(error, errorCodes.checkpointFailed)
      }, context);
      throw error;
    }
  }

  #readFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  #validateRestorable(checkpoint) {
    if (checkpoint.schema !== CHECKPOINT_SCHEMA) {
      throw createProtocolError(errorCodes.checkpointFailed, 'Checkpoint schema is not restorable.', {
        schema: checkpoint.schema,
        expected: CHECKPOINT_SCHEMA
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
    if (JSON.stringify(checkpoint.restoreScope) !== JSON.stringify(['modules.active'])) {
      throw createProtocolError(errorCodes.checkpointFailed, 'Checkpoint restore scope is not supported.', {
        restoreScope: checkpoint.restoreScope
      });
    }
  }
}

module.exports = { CHECKPOINT_SCHEMA, CheckpointStore };
