import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ModelTurnManager,
  assertNoSecrets,
  normalizeMessages,
  packageContext
} = require('../src/main/model-adapter.cjs');

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

function createManager() {
  const eventStore = new MemoryEventStore();
  const manager = new ModelTurnManager({
    eventStore,
    getStatus: () => ({
      appVersion: '0.1.0',
      sessionId: 'ses_12345678',
      target: {
        url: 'https://example.com/',
        title: 'Example Domain',
        targetId: 2,
        documentGeneration: 1
      },
      config: {
        researchProfile: 'workspace-research',
        generatedNodeRuntimeEnabled: true,
        pageWorldId: 1001
      }
    }),
    getEvents: () => [
      { sequence: 1, type: 'module.activated', timestamp: '2026-07-13T00:00:00.000Z', requestId: 'req_12345678', executionId: null, data: { moduleId: 'generated.example', version: '0.1.0' } }
    ],
    getModules: () => ({ active: { 'generated.example': '0.1.0' }, modules: [{}], candidates: [] }),
    defaultTimeoutMs: 50
  });
  return { eventStore, manager };
}

test('packageContext redacts to operational summaries and stable hash', () => {
  const context = packageContext({
    status: {
      appVersion: '0.1.0',
      sessionId: 'ses_12345678',
      target: { url: 'https://example.com/', title: 'Example Domain', targetId: 2, documentGeneration: 1 },
      config: { researchProfile: 'workspace-research', generatedNodeRuntimeEnabled: true, pageWorldId: 1001 }
    },
    events: [{ sequence: 7, type: 'node.execution.failed', timestamp: '2026-07-13T00:00:00.000Z', data: { error: { code: 'TEST', message: 'redacted' } } }],
    modules: { active: {}, modules: [], candidates: [] }
  });

  assert.match(context.contextHash, /^sha256:/);
  assert.equal(context.target.url, 'https://example.com/');
  assert.deepEqual(context.events[0].dataSummary, { errorCode: 'TEST', message: 'redacted' });
});

test('model adapter validation rejects secret-shaped payloads and bad messages', () => {
  assert.throws(() => assertNoSecrets({ apiKey: 'sk-test' }), /must not include secrets/);
  assert.throws(() => normalizeMessages([{ role: 'user', content: '' }]), /invalid/);
});

test('ModelTurnManager returns deterministic local adapter result and events', async () => {
  const { eventStore, manager } = createManager();
  const result = await manager.turn({
    messages: [{ role: 'user', content: 'What can you see?' }]
  }, {
    sessionId: 'ses_12345678',
    requestId: 'req_model_turn'
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.adapter, 'local.manual');
  assert.match(result.contextHash, /^sha256:/);
  assert.match(result.output.content, /What can you see/);
  assert.deepEqual(eventStore.events.map((event) => event.type), [
    'model.context.packaged',
    'model.turn.started',
    'model.turn.completed'
  ]);
});

test('ModelTurnManager supports cancellation', async () => {
  const { eventStore, manager } = createManager();
  const pending = manager.turn({
    messages: [{ role: 'user', content: 'wait' }],
    options: { delayMs: 1000 }
  }, {
    sessionId: 'ses_12345678',
    requestId: 'req_model_slow'
  });

  const cancel = manager.cancel({ sessionId: 'ses_12345678', requestId: 'req_model_cancel' });
  const result = await pending;

  assert.equal(cancel.cancelled, 1);
  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'EXECUTION_CANCELLED');
  assert.ok(eventStore.events.some((event) => event.type === 'model.turn.cancel.completed'));
  assert.ok(eventStore.events.some((event) => event.type === 'model.turn.failed'));
});
