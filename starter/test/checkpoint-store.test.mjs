import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CHECKPOINT_SCHEMA, LEGACY_CHECKPOINT_SCHEMAS, CheckpointStore } = require('../src/main/checkpoint-store.cjs');
const { ModuleStore } = require('../src/main/module-store.cjs');
const { createExecutionResult, sha256 } = require('../src/shared/contracts.cjs');

class MemoryEventStore {
  constructor() { this.events = []; this.failOn = null; }
  append(type, data = {}, context = {}) {
    if (this.failOn === type) throw new Error(`Injected event failure: ${type}`);
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
      target: {
        url: 'https://private-site.example/checkpoint',
        title: 'Sensitive checkpoint page title',
        snapshot: { text: 'Sensitive checkpoint page body' },
        documentGeneration: 1
      },
      config: { researchProfile: 'fixture', operatorNotes: 'Sensitive checkpoint configuration' }
    })
  });
  return { root, eventStore, moduleStore, store };
}

test('CheckpointStore persists only its declared restore state and de-identifies labels', async () => {
  const harness = await createHarness();
  try {
    harness.moduleStore.activate({ id: 'generated.restore', version: '0.1.0' });
    const checkpoint = harness.store.create('https://private-site.example/checkpoint Sensitive label');
    const persisted = JSON.parse(readFileSync(checkpoint.filePath, 'utf8'));
    const raw = readFileSync(checkpoint.filePath, 'utf8');

    assert.equal(persisted.schema, CHECKPOINT_SCHEMA);
    assert.deepEqual(persisted.state, {
      modules: { active: { 'generated.restore': '0.1.0' } }
    });
    assert.deepEqual(persisted.restoreScope, ['modules.active']);
    assert.ok(persisted.excludedState.includes('target'));
    assert.equal(persisted.label, '[redacted:external-page-content]');
    assert.equal(persisted.persistenceRedaction.status, 'redacted');
    assert.equal(raw.includes('private-site.example'), false);
    assert.equal(raw.includes('Sensitive checkpoint'), false);
    assert.equal(raw.includes('researchProfile'), false);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

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

test('CheckpointStore rejects a v0.3 checkpoint that contains state outside its restore scope', async () => {
  const harness = await createHarness();
  try {
    harness.moduleStore.activate({ id: 'generated.restore', version: '0.1.0' });
    const checkpoint = harness.store.create('minimal state guard');
    const saved = JSON.parse(readFileSync(checkpoint.filePath, 'utf8'));
    saved.state.target = { url: 'https://private-site.example/tampered' };
    saved.stateHash = sha256(JSON.stringify(saved.state));
    writeFileSync(checkpoint.filePath, `${JSON.stringify(saved, null, 2)}\n`, 'utf8');

    assert.throws(
      () => harness.store.restore(checkpoint.id, { confirmed: true }),
      /outside the declared restore scope/
    );
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('CheckpointStore restores legacy v0.2 checkpoints while new checkpoints use v0.3', async () => {
  const harness = await createHarness();
  try {
    harness.moduleStore.activate({ id: 'generated.restore', version: '0.1.0' });
    const legacyId = 'chk_legacy_12345678';
    const legacyState = {
      modules: { active: { 'generated.restore': '0.1.0' } },
      target: { url: 'https://private-site.example/legacy' }
    };
    const legacyCheckpoint = {
      schema: LEGACY_CHECKPOINT_SCHEMAS[0],
      id: legacyId,
      label: 'legacy checkpoint',
      createdAt: '2026-07-24T00:00:00.000Z',
      appVersion: '0.1.0',
      restoreScope: ['modules.active'],
      excludedState: ['target'],
      state: legacyState,
      stateHash: sha256(JSON.stringify(legacyState))
    };
    const legacyPath = join(harness.root, 'data', 'checkpoints', `${legacyId}.json`);
    writeFileSync(legacyPath, `${JSON.stringify(legacyCheckpoint, null, 2)}\n`, 'utf8');
    harness.moduleStore.activate({ id: 'generated.restore', version: '0.2.0' });

    const restored = harness.store.restore(legacyId, { confirmed: true });
    assert.deepEqual(restored.active, { 'generated.restore': '0.1.0' });
    assert.equal(harness.store.list().find((item) => item.id === legacyId).restorable, true);
    assert.equal(harness.store.read(restored.safetyCheckpointId).schema, CHECKPOINT_SCHEMA);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('CheckpointStore journals applied_unknown when completion evidence fails after mapping restore', async () => {
  const harness = await createHarness();
  try {
    harness.moduleStore.activate({ id: 'generated.restore', version: '0.1.0' });
    const checkpoint = harness.store.create('restore journal fixture');
    harness.moduleStore.activate({ id: 'generated.restore', version: '0.2.0' });
    harness.eventStore.failOn = 'checkpoint.restore.completed';

    assert.throws(() => harness.store.restore(checkpoint.id, { confirmed: true }), /Injected event failure/);
    assert.equal(harness.moduleStore.getState().active['generated.restore'], '0.1.0');
    const transitionDirectory = join(harness.root, 'data', 'checkpoint-transitions');
    const files = readdirSync(transitionDirectory);
    assert.equal(files.length, 1);
    const transition = JSON.parse(readFileSync(join(transitionDirectory, files[0]), 'utf8'));
    assert.equal(transition.status, 'applied_unknown');
    assert.equal(transition.observedActiveHash, transition.targetActiveHash);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});
