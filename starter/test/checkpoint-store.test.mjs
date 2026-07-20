import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CHECKPOINT_SCHEMA, CheckpointStore } = require('../src/main/checkpoint-store.cjs');
const { ModuleStore } = require('../src/main/module-store.cjs');
const { createExecutionResult, sha256 } = require('../src/shared/contracts.cjs');

class MemoryEventStore {
  constructor() { this.events = []; }
  append(type, data = {}, context = {}) {
    const event = { type, data, requestId: context.requestId ?? null };
    this.events.push(event);
    return event;
  }
}

class FakeSupervisor {
  async execute({ source }, context = {}) {
    return createExecutionResult({
      sessionId: context.sessionId,
      requestId: context.requestId,
      executionId: 'exe_checkpoint_12345678',
      kind: context.kind,
      startedAt: '2026-07-20T00:00:00.000Z',
      finishedAt: '2026-07-20T00:00:00.010Z',
      sourceHash: sha256(source),
      result: { ok: true }
    });
  }
}

function manifest(version) {
  return {
    id: 'generated.restore',
    version,
    description: `Restore fixture ${version}`,
    entry: 'index.cjs',
    runtime: 'node',
    provenance: { sessionId: 'ses_restore_12345678', executionIds: [], checkpointId: null, model: null },
    dependencies: {},
    tests: []
  };
}

async function createHarness() {
  const root = mkdtempSync(join(tmpdir(), 'blankseed-checkpoint-'));
  const eventStore = new MemoryEventStore();
  const moduleStore = new ModuleStore({
    workspaceRoot: join(root, 'workspace'),
    eventStore,
    processSupervisor: new FakeSupervisor()
  });
  for (const version of ['0.1.0', '0.2.0']) {
    const candidate = moduleStore.createCandidate({
      manifest: manifest(version),
      source: `return { version: ${JSON.stringify(version)} };`
    });
    await moduleStore.testCandidate(candidate.candidateId);
    moduleStore.commitCandidate(candidate.candidateId);
  }
  const store = new CheckpointStore(join(root, 'data'), {
    appVersion: '0.1.0',
    eventStore,
    moduleStore,
    getState: () => ({
      appVersion: '0.1.0',
      modules: moduleStore.getState(),
      target: { url: 'https://example.com/', documentGeneration: 1 },
      config: { researchProfile: 'fixture' }
    })
  });
  return { root, eventStore, moduleStore, store };
}

test('CheckpointStore restores only the committed Module active mapping with a safety checkpoint', async () => {
  const harness = await createHarness();
  try {
    harness.moduleStore.activate({ id: 'generated.restore', version: '0.1.0' });
    const checkpoint = harness.store.create('restore v1');
    assert.equal(checkpoint.schema, CHECKPOINT_SCHEMA);
    assert.deepEqual(checkpoint.restoreScope, ['modules.active']);
    assert.ok(checkpoint.excludedState.includes('target.navigation'));
    harness.moduleStore.activate({ id: 'generated.restore', version: '0.2.0' });

    const restored = harness.store.restore(checkpoint.id, { confirmed: true }, {
      sessionId: 'ses_restore_12345678', requestId: 'req_restore_12345678'
    });
    assert.deepEqual(restored.active, { 'generated.restore': '0.1.0' });
    assert.match(restored.safetyCheckpointId, /^chk_/);
    assert.equal(harness.store.list().length, 2);
    assert.deepEqual(harness.eventStore.events.filter((event) => event.type.startsWith('checkpoint.restore')).map((event) => event.type), [
      'checkpoint.restore.planned',
      'checkpoint.restore.completed'
    ]);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('CheckpointStore rejects unconfirmed, tampered, and unavailable restore state before mutation', async () => {
  const harness = await createHarness();
  try {
    harness.moduleStore.activate({ id: 'generated.restore', version: '0.1.0' });
    const checkpoint = harness.store.create('protected checkpoint');
    harness.moduleStore.activate({ id: 'generated.restore', version: '0.2.0' });
    assert.throws(() => harness.store.restore(checkpoint.id), /explicit operator confirmation/);

    const saved = JSON.parse(readFileSync(checkpoint.filePath, 'utf8'));
    saved.state.modules.active['generated.restore'] = '9.9.9';
    writeFileSync(checkpoint.filePath, `${JSON.stringify(saved, null, 2)}\n`, 'utf8');
    assert.throws(() => harness.store.restore(checkpoint.id, { confirmed: true }), /state hash/);
    assert.equal(harness.moduleStore.getState().active['generated.restore'], '0.2.0');

    saved.stateHash = sha256(JSON.stringify(saved.state));
    writeFileSync(checkpoint.filePath, `${JSON.stringify(saved, null, 2)}\n`, 'utf8');
    assert.throws(() => harness.store.restore(checkpoint.id, { confirmed: true }), /does not exist/);
    assert.equal(harness.moduleStore.getState().active['generated.restore'], '0.2.0');
    assert.ok(harness.eventStore.events.some((event) => event.type === 'checkpoint.restore.failed'));
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});
