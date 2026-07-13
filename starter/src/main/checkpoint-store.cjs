'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class CheckpointStore {
  constructor(baseDirectory, { appVersion, getState, eventStore }) {
    this.directory = path.join(baseDirectory, 'checkpoints');
    this.appVersion = appVersion;
    this.getState = getState;
    this.eventStore = eventStore;
    fs.mkdirSync(this.directory, { recursive: true });
  }

  create(label = 'manual checkpoint', context = {}) {
    const id = `chk_${crypto.randomUUID()}`;
    const checkpoint = {
      schema: 'blankseed-checkpoint/0.1',
      id,
      label: String(label).slice(0, 200),
      createdAt: new Date().toISOString(),
      appVersion: this.appVersion,
      state: this.getState()
    };
    const filePath = path.join(this.directory, `${id}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
    this.eventStore.append('checkpoint.created', { id, label: checkpoint.label, filePath }, context);
    return { ...checkpoint, filePath };
  }
}

module.exports = { CheckpointStore };
