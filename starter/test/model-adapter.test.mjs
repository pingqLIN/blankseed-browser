import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  HostedOpenAIResponsesAdapter,
  LocalOpenAICompatibleAdapter,
  ModelTurnManager,
  assertNoSecrets,
  encodeResponsesInput,
  normalizeHostedOpenAIEndpoint,
  normalizeLoopbackEndpoint,
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

function createManager(adapters = {}) {
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
    adapters,
    defaultTimeoutMs: 1000
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
  assert.throws(() => assertNoSecrets({ options: { accessToken: 'blocked' } }), /must not include secrets/);
  assert.doesNotThrow(() => assertNoSecrets({ options: { maxTokens: 64 } }));
  assert.throws(() => normalizeMessages([{ role: 'user', content: '' }]), /invalid/);
  assert.throws(() => normalizeLoopbackEndpoint('https://example.com/v1/chat/completions'), /loopback/);
});

test('LocalOpenAICompatibleAdapter performs a credential-free loopback model turn', async (context) => {
  let received = null;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
    };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'loopback adapter ok' } }]
    }));
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  context.after(() => server.close());
  const endpoint = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  const adapter = new LocalOpenAICompatibleAdapter({ endpoint, model: 'fixture-model' });
  const { manager } = createManager({ 'local.openai-compatible': adapter });

  const result = await manager.turn({
    adapter: 'local.openai-compatible',
    messages: [{ role: 'user', content: 'Use the local fixture.' }],
    options: { temperature: 0.2, maxTokens: 64 }
  }, {
    sessionId: 'ses_12345678',
    requestId: 'req_local_model_12345678'
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.adapter, 'local.openai-compatible');
  assert.equal(result.output.content, 'loopback adapter ok');
  assert.equal(received.authorization, undefined);
  assert.equal(received.body.model, 'fixture-model');
  assert.equal(received.body.temperature, 0.2);
  assert.equal(received.body.max_tokens, 64);
  assert.match(received.body.messages[0].content, /BlankSeed operational context JSON/);
  assert.match(received.body.messages[0].content, /contextHash/);
});

test('LocalOpenAICompatibleAdapter accepts tool-only output and preserves tool result correlation', async () => {
  let received = null;
  const adapter = new LocalOpenAICompatibleAdapter({
    endpoint: 'http://127.0.0.1:1234/v1/chat/completions',
    model: 'fixture-model',
    fetchImpl: async (_url, request) => {
      received = JSON.parse(request.body);
      return new Response(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_fixture_12345678',
              type: 'function',
              function: { name: 'page_snapshot', arguments: '{}' }
            }]
          }
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const output = await adapter.run({
    messages: [
      { role: 'assistant', content: '', toolRequests: [{ id: 'call_previous_12345678', name: 'page_snapshot', arguments: '{}' }] },
      { role: 'tool', content: '{"status":"ok"}', toolCallId: 'call_previous_12345678', name: 'page_snapshot' }
    ],
    contextPackage: { contextHash: 'sha256:fixture' },
    tools: [{ type: 'function', function: { name: 'page_snapshot', description: 'snapshot', parameters: { type: 'object' } } }]
  });

  assert.equal(output.content, '');
  assert.equal(output.toolRequests[0].name, 'page_snapshot');
  assert.equal(received.tool_choice, 'auto');
  assert.equal(received.messages.at(-1).tool_call_id, 'call_previous_12345678');
});

test('HostedOpenAIResponsesAdapter enforces fixed egress and converts Responses function calls', async () => {
  const fakeKey = 'fixture-provider-key-never-log';
  let request = null;
  const adapter = new HostedOpenAIResponsesAdapter({
    id: 'openai.gpt-5.6-sol',
    label: 'OpenAI GPT-5.6 Sol',
    model: 'gpt-5.6-sol',
    apiKey: fakeKey,
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        id: 'resp_fixture_12345678',
        model: 'gpt-5.6-sol-2026-07-01',
        output: [{
          id: 'fc_fixture_12345678',
          type: 'function_call',
          call_id: 'call_fixture_12345678',
          name: 'page_snapshot',
          arguments: '{}'
        }],
        usage: { input_tokens: 12, output_tokens: 7, total_tokens: 19 }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const output = await adapter.run({
    messages: [{ role: 'user', content: 'Inspect the fixture.' }],
    contextPackage: { contextHash: 'sha256:fixture' },
    options: { reasoningEffort: 'high', maxTokens: 128 },
    tools: [{ type: 'function', function: { name: 'page_snapshot', description: 'Snapshot', parameters: { type: 'object', additionalProperties: false, properties: {} } } }]
  });

  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.authorization, `Bearer ${fakeKey}`);
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.body.model, 'gpt-5.6-sol');
  assert.equal(request.body.store, false);
  assert.equal(request.body.parallel_tool_calls, false);
  assert.deepEqual(request.body.reasoning, { effort: 'high' });
  assert.equal(request.body.max_output_tokens, 128);
  assert.deepEqual(request.body.tools[0], {
    type: 'function',
    name: 'page_snapshot',
    description: 'Snapshot',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    strict: false
  });
  assert.equal(output.toolRequests[0].providerItemId, 'fc_fixture_12345678');
  assert.equal(output.toolRequests[0].id, 'call_fixture_12345678');
  assert.equal(output.provider.responseId, 'resp_fixture_12345678');
  assert.equal(JSON.stringify(output).includes(fakeKey), false);
});

test('Hosted Responses continuation preserves function-call correlation without credential material', () => {
  const input = encodeResponsesInput([
    {
      role: 'assistant',
      content: '',
      toolRequests: [{
        id: 'call_fixture_12345678',
        name: 'page_snapshot',
        arguments: '{}',
        providerItemId: 'fc_fixture_12345678'
      }]
    },
    { role: 'tool', name: 'page_snapshot', toolCallId: 'call_fixture_12345678', content: '{"status":"ok"}' }
  ], { contextHash: 'sha256:fixture' });
  assert.deepEqual(input.at(-2), {
    type: 'function_call',
    call_id: 'call_fixture_12345678',
    name: 'page_snapshot',
    arguments: '{}',
    id: 'fc_fixture_12345678'
  });
  assert.deepEqual(input.at(-1), {
    type: 'function_call_output',
    call_id: 'call_fixture_12345678',
    output: '{"status":"ok"}'
  });
  assert.throws(() => normalizeHostedOpenAIEndpoint('https://example.com/v1/responses'), /not allowlisted/);
  assert.throws(() => normalizeHostedOpenAIEndpoint('https://api.openai.com/v1/responses?redirect=1'), /not allowlisted/);
  assert.throws(() => normalizeHostedOpenAIEndpoint('https://user:pass@api.openai.com/v1/responses'), /not allowlisted/);
});

test('ModelTurnManager records redacted hosted egress metadata and never returns the provider key', async () => {
  const fakeKey = 'fixture-provider-key-never-return';
  const adapter = new HostedOpenAIResponsesAdapter({
    id: 'openai.gpt-5.6-terra',
    model: 'gpt-5.6-terra',
    apiKey: fakeKey,
    fetchImpl: async () => new Response(JSON.stringify({
      id: 'resp_fixture_hosted',
      model: 'gpt-5.6-terra',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'hosted fixture ok' }] }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  });
  const { eventStore, manager } = createManager({ [adapter.id]: adapter });
  const result = await manager.turn({
    adapter: adapter.id,
    messages: [{ role: 'user', content: 'Synthetic context only.' }]
  }, { sessionId: 'ses_12345678', requestId: 'req_hosted_fixture_12345678' });
  assert.equal(result.status, 'ok');
  assert.equal(result.output.content, 'hosted fixture ok');
  const serialized = JSON.stringify({ result, events: eventStore.events });
  assert.equal(serialized.includes(fakeKey), false);
  const egress = eventStore.events.find((event) => event.type === 'model.egress.allowed');
  assert.deepEqual(egress.data, {
    turnId: result.turnId,
    adapter: adapter.id,
    provider: 'openai',
    origin: 'https://api.openai.com',
    model: 'gpt-5.6-terra',
    redirectPolicy: 'error',
    credentialBoundary: 'main-process-only'
  });
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

test('ModelTurnManager exposes a credential-free renderer catalog', () => {
  const { manager } = createManager();
  const catalog = manager.getCatalog();
  assert.deepEqual(catalog, [{
    id: 'local.manual',
    label: 'Local Manual',
    provider: 'local',
    model: 'deterministic-manual',
    transport: 'in-process',
    available: true,
    hosted: false
  }]);
  assert.equal(JSON.stringify(catalog).includes('endpoint'), false);
  assert.equal(JSON.stringify(catalog).toLowerCase().includes('apikey'), false);
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
