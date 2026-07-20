import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ModelTurnManager } = require('../src/main/model-adapter.cjs');
const { ModelConfigurationController } = require('../src/main/model-configuration.cjs');

class MemoryEventStore {
  constructor() {
    this.events = [];
  }

  append(type, data = {}, context = {}) {
    const event = { type, data, requestId: context.requestId ?? null };
    this.events.push(event);
    return event;
  }
}

function createController(environmentOpenAIApiKey = '') {
  const eventStore = new MemoryEventStore();
  const manager = new ModelTurnManager({
    eventStore,
    getStatus: () => ({ appVersion: '0.1.0', target: {}, config: {} }),
    getEvents: () => [],
    getModules: () => ({ active: {}, modules: [], candidates: [] }),
    adapters: {}
  });
  const controller = new ModelConfigurationController({
    eventStore,
    modelTurnManager: manager,
    localEndpoint: 'http://127.0.0.1:1234/v1/chat/completions',
    localModel: 'fixture-local',
    environmentOpenAIApiKey
  });
  return { controller, eventStore, manager };
}

test('model configuration exposes defaults without credential material', () => {
  const fakeKey = 'fixture-key-never-return';
  const { controller, manager } = createController(fakeKey);
  const state = controller.getPublicState();

  assert.equal(state.local.model, 'fixture-local');
  assert.equal(state.openAI.credentialConfigured, true);
  assert.equal(state.openAI.credentialSource, 'environment');
  assert.equal(JSON.stringify({ state, catalog: manager.getCatalog() }).includes(fakeKey), false);
  assert.equal(manager.getCatalog().find((adapter) => adapter.id === 'openai.gpt-5.6-terra').available, true);
});

test('session OpenAI credential is memory-only, redacted from events, and clearable', () => {
  const fakeKey = 'fixture-session-key-never-log';
  const { controller, eventStore, manager } = createController();

  const configured = controller.setSessionOpenAICredential({ apiKey: fakeKey }, {
    requestId: 'req_model_configuration_fixture'
  });
  assert.equal(configured.openAI.credentialSource, 'session');
  assert.equal(manager.getCatalog().find((adapter) => adapter.id === 'openai.gpt-5.6-sol').available, true);
  assert.equal(JSON.stringify({ configured, events: eventStore.events }).includes(fakeKey), false);

  const cleared = controller.clearSessionOpenAICredential({ requestId: 'req_model_configuration_clear' });
  assert.equal(cleared.openAI.credentialConfigured, false);
  assert.equal(manager.getCatalog().find((adapter) => adapter.id === 'openai.gpt-5.6-sol').available, false);
});

test('local model panel updates remain loopback-only and reject secret-bearing URLs', () => {
  const { controller } = createController();
  const updated = controller.updateLocal({
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model: 'llama-fixture'
  });
  assert.equal(updated.local.endpoint, 'http://localhost:11434/v1/chat/completions');
  assert.equal(updated.local.model, 'llama-fixture');
  assert.throws(() => controller.updateLocal({
    endpoint: 'https://example.com/v1/chat/completions',
    model: 'blocked'
  }), /loopback/);
  assert.throws(() => controller.updateLocal({
    endpoint: 'http://127.0.0.1:1234/v1/chat/completions?token=blocked',
    model: 'blocked'
  }), /query parameters/);
});
