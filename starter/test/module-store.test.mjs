import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ModuleStore } = require('../src/main/module-store.cjs');
const { createExecutionResult, sha256 } = require('../src/shared/contracts.cjs');

class MemoryEventStore {
  constructor() {
    this.events = [];
  }

  append(type, data = {}, context = {}) {
    const event = {
      sequence: this.events.length + 1,
      type,
      sessionId: context.sessionId ?? null,
      requestId: context.requestId ?? null,
      executionId: context.executionId ?? null,
      data
    };
    this.events.push(event);
    return event;
  }
}

class FakeSupervisor {
  constructor() {
    this.calls = [];
  }

  async execute({ source, environment }, context = {}) {
    this.calls.push({ source, environment, context });
    const executionId = `exe_module_${String(this.calls.length).padStart(8, '0')}`;
    return createExecutionResult({
      sessionId: context.sessionId,
      requestId: context.requestId,
      executionId,
      kind: context.kind,
      startedAt: '2026-07-13T00:00:00.000Z',
      finishedAt: '2026-07-13T00:00:00.010Z',
      sourceHash: sha256(source),
      result: { ok: true, call: this.calls.length }
    });
  }
}

function createHarness() {
  const root = mkdtempSync(join(tmpdir(), 'blankseed-modules-'));
  const eventStore = new MemoryEventStore();
  const processSupervisor = new FakeSupervisor();
  const store = new ModuleStore({
    workspaceRoot: join(root, 'workspace'),
    eventStore,
    processSupervisor,
    defaultTimeoutMs: 50
  });
  return {
    eventStore,
    processSupervisor,
    root,
    store,
    recreateStore: () => new ModuleStore({
      workspaceRoot: join(root, 'workspace'),
      eventStore,
      processSupervisor,
      defaultTimeoutMs: 50
    }),
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

function manifest(version) {
  return {
    id: 'generated.wp05',
    version,
    description: `WP05 ${version}`,
    entry: 'index.cjs',
    runtime: 'node',
    provenance: {
      sessionId: 'ses_12345678',
      executionIds: ['exe_source_12345678'],
      checkpointId: null,
      model: null
    },
    dependencies: {},
    tests: []
  };
}

test('ModuleStore commits immutable tested versions and invokes active module', async () => {
  const harness = createHarness();
  try {
    const candidate = harness.store.createCandidate({
      manifest: manifest('0.1.0'),
      source: 'return { value: environment.value + 1 };'
    }, {
      sessionId: 'ses_12345678',
      requestId: 'req_candidate_12345678'
    });
    assert.equal(candidate.manifest.status, 'candidate');
    assert.match(candidate.manifest.sourceHash, /^sha256:/);

    const testResult = await harness.store.testCandidate(candidate.candidateId, {
      sessionId: 'ses_12345678',
      requestId: 'req_test_12345678'
    });
    assert.equal(testResult.passed, true);
    assert.equal(testResult.manifest.status, 'tested');

    const committed = harness.store.commitCandidate(candidate.candidateId, {
      sessionId: 'ses_12345678',
      requestId: 'req_commit_12345678'
    });
    assert.equal(committed.manifest.status, 'committed');

    assert.throws(
      () => harness.store.commitCandidate(candidate.candidateId),
      /Module version already exists/
    );

    const activation = harness.store.activate({ id: 'generated.wp05', version: '0.1.0' }, {
      sessionId: 'ses_12345678',
      requestId: 'req_activate_12345678'
    });
    assert.equal(activation.active['generated.wp05'], '0.1.0');

    const invoked = await harness.store.invoke({
      id: 'generated.wp05',
      environment: { value: 41 }
    }, {
      sessionId: 'ses_12345678',
      requestId: 'req_invoke_12345678'
    });
    assert.equal(invoked.requestKind, 'module.invoke');
    assert.equal(invoked.status, 'ok');
    assert.equal(harness.processSupervisor.calls.at(-1).source, 'return { value: environment.value + 1 };');

    const reloaded = harness.recreateStore();
    assert.equal(reloaded.getState().active['generated.wp05'], '0.1.0');
  } finally {
    harness.cleanup();
  }
});

test('ModuleStore activates a newer version and rolls back to an older version', async () => {
  const harness = createHarness();
  try {
    for (const version of ['0.1.0', '0.2.0']) {
      const candidate = harness.store.createCandidate({
        manifest: manifest(version),
        source: `return { version: ${JSON.stringify(version)} };`
      });
      await harness.store.testCandidate(candidate.candidateId);
      harness.store.commitCandidate(candidate.candidateId);
    }

    harness.store.activate({ id: 'generated.wp05', version: '0.1.0' });
    harness.store.activate({ id: 'generated.wp05', version: '0.2.0' });
    const rollback = harness.store.rollback({ id: 'generated.wp05', version: '0.1.0' });

    assert.equal(rollback.fromVersion, '0.2.0');
    assert.equal(rollback.toVersion, '0.1.0');
    assert.equal(harness.store.getState().active['generated.wp05'], '0.1.0');
    assert.ok(harness.eventStore.events.some((event) => event.type === 'module.rollback.completed'));
  } finally {
    harness.cleanup();
  }
});

test('ModuleStore restores a fully validated active mapping with compare-and-swap', async () => {
  const harness = createHarness();
  try {
    for (const version of ['0.1.0', '0.2.0']) {
      const candidate = harness.store.createCandidate({
        manifest: manifest(version),
        source: `return { version: ${JSON.stringify(version)} };`
      });
      await harness.store.testCandidate(candidate.candidateId);
      harness.store.commitCandidate(candidate.candidateId);
    }
    harness.store.activate({ id: 'generated.wp05', version: '0.2.0' });
    const expectedActive = harness.store.getState().active;
    const restored = harness.store.restoreActive({
      active: { 'generated.wp05': '0.1.0' },
      expectedActive
    });
    assert.deepEqual(restored.active, { 'generated.wp05': '0.1.0' });
    assert.equal(harness.recreateStore().getState().active['generated.wp05'], '0.1.0');

    const staleExpected = { ...restored.active };
    harness.store.activate({ id: 'generated.wp05', version: '0.2.0' });
    assert.throws(() => harness.store.restoreActive({
      active: { 'generated.wp05': '0.1.0' },
      expectedActive: staleExpected
    }), /changed before restore/);
    assert.equal(harness.store.getState().active['generated.wp05'], '0.2.0');
  } finally {
    harness.cleanup();
  }
});
