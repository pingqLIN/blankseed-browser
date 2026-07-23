import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DEFAULT_AGENT_TOOLS, EvolutionRunManager, RawCapabilityDispatcher, TOOL_DEFINITIONS, serializeToolResultForModel } = require('../src/main/evolution-loop.cjs');
const { ModelTurnManager } = require('../src/main/model-adapter.cjs');
const { ModuleStore } = require('../src/main/module-store.cjs');
const { createExecutionFailure, createExecutionResult, createProtocolError, errorCodes, sha256 } = require('../src/shared/contracts.cjs');

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
      evolutionRunId: context.evolutionRunId ?? null,
      turnId: context.turnId ?? null,
      actionId: context.actionId ?? null,
      data
    };
    this.events.push(event);
    return event;
  }
}

class FixtureSupervisor {
  constructor() {
    this.calls = [];
    this.held = null;
    this.releaseHeld = null;
  }

  async execute({ source, environment }, context = {}) {
    this.calls.push({ source, environment, context });
    if (source.includes('WAIT_FOR_CANCEL')) {
      this.held = new Promise((resolveHeld) => { this.releaseHeld = resolveHeld; });
      await this.held;
    }
    const executionId = `exe_fixture_${String(this.calls.length).padStart(8, '0')}`;
    const input = {
      sessionId: context.sessionId,
      requestId: context.requestId,
      executionId,
      kind: context.kind,
      startedAt: '2026-07-17T00:00:00.000Z',
      finishedAt: '2026-07-17T00:00:00.010Z',
      sourceHash: sha256(source)
    };
    if (source.includes('BigInt')) {
      return createExecutionFailure({
        ...input,
        error: Object.assign(new Error('Result is not JSON serializable.'), { code: errorCodes.serializationFailed })
      });
    }
    if (source.includes('LARGE_OBSERVATION')) {
      return createExecutionResult({
        ...input,
        result: {
          status: 'success',
          metrics: { records: 3, skipped: 3 },
          output: 'x'.repeat(50000)
        }
      });
    }
    if (source.includes('PAGE_TEST_PLAN')) {
      return createExecutionResult({
        ...input,
        result: {
          pageTest: {
            installSource: 'return { ok: true, phase: "install" };',
            verifySource: 'return { ok: true, phase: "verify" };',
            uninstallSource: 'return { ok: true, phase: "uninstall" };',
            rollbackVerifySource: 'return { ok: true, phase: "rollbackVerify" };'
          }
        }
      });
    }
    return createExecutionResult({
      ...input,
      result: {
        title: environment.title || 'Fixture title',
        wordCount: String(environment.text || 'fixture text').trim().split(/\s+/).length
      }
    });
  }
}

class ScriptedEvolutionAdapter {
  constructor() {
    this.id = 'fixture.evolution';
    this.calls = [];
  }

  async run({ messages, tools }) {
    this.calls.push(structuredClone(messages));
    assert.ok(tools.some((entry) => entry.function.name === 'module_candidate_create'));
    const call = this.calls.length;
    const latest = latestToolResult(messages);
    const manifest = (version, description) => ({
      id: 'generated.wp11.fixture',
      version,
      description,
      entry: 'index.cjs',
      runtime: 'node',
      dependencies: {},
      tests: []
    });
    if (call === 1) return request('call_snapshot', 'page_snapshot', {});
    if (call === 2) {
      assert.equal(latest.status, 'ok');
      return request('call_candidate_fail', 'module_candidate_create', {
        manifest: manifest('0.1.0-fail', 'Intentional non-serializable attempt.'),
        source: 'return { wordCount: BigInt(1) };'
      });
    }
    if (call === 3) {
      return request('call_test_fail', 'module_candidate_test', {
        candidateId: latest.result.candidateId
      });
    }
    if (call === 4) {
      assert.equal(latest.status, 'error');
      assert.equal(latest.result.passed, false);
      assert.equal(latest.result.result.error.code, errorCodes.serializationFailed);
      return request('call_candidate_fix', 'module_candidate_create', {
        manifest: manifest('0.1.0', 'Serializable correction after observed failure.'),
        source: 'const text = String(environment.text || "fixture text"); return { title: environment.title || "untitled", wordCount: text.trim().split(/\\s+/).length };'
      });
    }
    if (call === 5) return request('call_test_fix', 'module_candidate_test', { candidateId: latest.result.candidateId });
    if (call === 6) {
      assert.equal(latest.result.passed, true);
      return request('call_commit', 'module_candidate_commit', { candidateId: latest.result.candidateId });
    }
    if (call === 7) return request('call_activate', 'module_activate', { id: latest.result.moduleId, version: latest.result.version });
    if (call === 8) return request('call_invoke', 'module_invoke', {
      id: latest.result.moduleId,
      environment: { title: 'Automated fixture', text: 'BlankSeed learns from observable failure evidence.' }
    });
    assert.equal(latest.status, 'ok');
    assert.equal(latest.result.result.wordCount, 6);
    return { role: 'assistant', content: 'Automated evolution completed with verified reuse evidence.', toolRequests: [] };
  }
}

function request(id, name, argumentsValue) {
  return {
    role: 'assistant',
    content: '',
    toolRequests: [{ id, type: 'function', name, arguments: JSON.stringify(argumentsValue) }]
  };
}

function latestToolResult(messages) {
  const message = [...messages].reverse().find((entry) => entry.role === 'tool');
  return message ? JSON.parse(message.content) : null;
}

function createHarness(adapter = new ScriptedEvolutionAdapter(), managerOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), 'blankseed-evolution-'));
  const workspaceRoot = join(root, 'workspace');
  const eventStore = new MemoryEventStore();
  const processSupervisor = new FixtureSupervisor();
  const moduleStore = new ModuleStore({ workspaceRoot, eventStore, processSupervisor, defaultTimeoutMs: 100 });
  const targetState = { url: 'https://example.com/', title: 'Example Domain', targetId: 1, documentGeneration: 1 };
  const target = {
    getState: () => ({ ...targetState }),
    navigate: async (url) => {
      targetState.url = new URL(url).toString();
      targetState.title = 'Navigated Fixture';
      targetState.documentGeneration += 1;
    },
    snapshot: async (_options, context) => {
      if (context.expectedTarget) {
        assert.deepEqual(context.expectedTarget, {
          targetId: targetState.targetId,
          documentGeneration: targetState.documentGeneration
        });
      }
      return createExecutionResult({
      sessionId: context.sessionId,
      requestId: context.requestId,
      executionId: 'exe_snapshot_12345678',
      kind: context.kind,
      startedAt: '2026-07-17T00:00:00.000Z',
      finishedAt: '2026-07-17T00:00:00.010Z',
      result: { title: targetState.title, text: 'Example Domain has one paragraph.' }
    });
    },
    execute: async () => { throw new Error('not used'); },
    sendCdp: async () => { throw new Error('not used'); }
  };
  let checkpointSequence = 0;
  const checkpointStore = {
    create(label) {
      checkpointSequence += 1;
      return { id: `chk_fixture_${String(checkpointSequence).padStart(8, '0')}`, label };
    }
  };
  const config = {
    generatedNodeRuntimeEnabled: true,
    generatedNodeRuntimeTimeoutMs: 100,
    ipcPayloadLimitBytes: 1_048_576,
    snapshotMaxTextChars: 12000,
    snapshotMaxElements: 200,
    evolutionActionResultLimitBytes: 1_048_576
  };
  const modelTurnManager = new ModelTurnManager({
    eventStore,
    getStatus: () => ({
      appVersion: '0.1.0',
      sessionId: 'ses_fixture_12345678',
      target: { ...targetState },
      config: { researchProfile: 'workspace-research', generatedNodeRuntimeEnabled: true, pageWorldId: 1001 }
    }),
    getEvents: (limit) => eventStore.events.slice(-limit),
    getModules: () => moduleStore.list(),
    adapters: { [adapter.id]: adapter },
    defaultTimeoutMs: 1000
  });
  const dispatcher = new RawCapabilityDispatcher({
    target, checkpointStore, eventStore, processSupervisor, moduleStore, config
  });
  const manager = new EvolutionRunManager({
    eventStore,
    modelTurnManager,
    dispatcher,
    checkpointStore,
    workspaceRoot,
    defaultMaxTurns: 12,
    defaultMaxActions: 32,
    maxObservationChars: 4000,
    ...managerOptions
  });
  return { adapter, dispatcher, eventStore, manager, moduleStore, processSupervisor, root, target, targetState, workspaceRoot };
}

test('default Agent catalog navigates the target while high-risk rollback requires an explicit profile', async () => {
  let calls = 0;
  const adapter = {
    id: 'fixture.navigate',
    async run({ messages, tools }) {
      calls += 1;
      assert.ok(tools.some((entry) => entry.function.name === 'target_navigate'));
      assert.ok(!tools.some((entry) => entry.function.name === 'module_rollback'));
      if (calls === 1) return request('call_navigate_12345678', 'target_navigate', { url: 'https://example.org/next' });
      if (calls === 2) {
        assert.equal(latestToolResult(messages).result.documentGeneration, 2);
        return request('call_snapshot_after_nav', 'page_snapshot', {});
      }
      assert.equal(latestToolResult(messages).status, 'ok');
      return { role: 'assistant', content: 'Navigation identity was refreshed.', toolRequests: [] };
    }
  };
  const harness = createHarness(adapter);
  try {
    const result = await harness.manager.run({
      adapter: adapter.id,
      messages: [{ role: 'user', content: 'Navigate, then inspect the new document.' }]
    }, {
      sessionId: 'ses_fixture_12345678',
      requestId: 'req_navigate_12345678',
      expectedTarget: { targetId: 1, documentGeneration: 1 }
    });
    assert.equal(result.status, 'ok');
    assert.equal(harness.targetState.url, 'https://example.org/next');

    let rollbackPayload = null;
    harness.dispatcher.moduleStore = {
      rollback: async (payload) => {
        rollbackPayload = payload;
        return { moduleId: payload.id, version: payload.version, active: { [payload.id]: payload.version } };
      }
    };
    const rollback = await harness.dispatcher.execute({
      actionId: 'act_rollback_12345678',
      toolCallId: 'call_rollback_12345678',
      name: 'module_rollback',
      arguments: JSON.stringify({ id: 'generated.example', version: '0.1.0' })
    }, { sessionId: 'ses_fixture_12345678', requestId: 'req_rollback_12345678' });
    assert.equal(rollback.status, 'ok');
    assert.deepEqual(rollbackPayload, { id: 'generated.example', version: '0.1.0' });
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('RawCapabilityDispatcher runs a tested candidate page plan through the target broker and verifies rollback', async () => {
  const harness = createHarness();
  try {
    const candidate = harness.moduleStore.createCandidate({
      manifest: {
        id: 'generated.page-overlay', version: '1.0.0', description: 'Fixture page test', entry: 'index.cjs', runtime: 'hybrid', dependencies: {}, tests: []
      },
      source: 'PAGE_TEST_PLAN'
    });
    await harness.moduleStore.testCandidate(candidate.candidateId);
    const calls = [];
    harness.target.execute = async (source, context) => {
      calls.push({ source, context });
      return createExecutionResult({
        sessionId: context.sessionId,
        requestId: context.requestId,
        executionId: `exe_page_${String(calls.length).padStart(8, '0')}`,
        kind: context.kind,
        startedAt: '2026-07-21T00:00:00.000Z',
        finishedAt: '2026-07-21T00:00:00.001Z',
        result: { ok: true, phase: context.phase }
      });
    };
    const result = await harness.dispatcher.execute({
      actionId: 'act_page_test_12345678',
      toolCallId: 'call_page_test_12345678',
      name: 'module_candidate_page_test',
      arguments: JSON.stringify({ candidateId: candidate.candidateId })
    }, {
      sessionId: 'ses_fixture_12345678',
      requestId: 'req_page_test_12345678',
      expectedTarget: { targetId: 1, documentGeneration: 1 }
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.result.passed, true);
    assert.deepEqual(calls.map((entry) => entry.context.phase), ['install', 'verify', 'uninstall', 'rollbackVerify']);
    assert.ok(calls.every((entry) => entry.context.expectedTarget.documentGeneration === 1));
    assert.ok(DEFAULT_AGENT_TOOLS.includes('module_candidate_page_test'));
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('EvolutionRunManager feeds observable failure evidence back to the model and commits the correction', async () => {
  const harness = createHarness();
  try {
    const result = await harness.manager.run({
      adapter: 'fixture.evolution',
      allowedTools: TOOL_DEFINITIONS.map((entry) => entry.function.name),
      messages: [{ role: 'user', content: 'Create and verify a reusable capability from raw primitives.' }]
    }, {
      sessionId: 'ses_fixture_12345678',
      requestId: 'req_evolution_12345678'
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.metrics.turns, 9);
    assert.equal(result.metrics.actions, 8);
    assert.equal(result.metrics.failedActions, 1);
    assert.equal(harness.moduleStore.list().active['generated.wp11.fixture'], '0.1.0');
    assert.equal(harness.adapter.calls.length, 9);
    assert.ok(existsSync(result.evidencePath));

    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8'));
    assert.equal(evidence.schema, 'blankseed-evolution-run/0.1');
    assert.equal(evidence.actions[2].result.error.code, errorCodes.serializationFailed);
    assert.equal(evidence.status, 'ok');
    const committed = harness.moduleStore.list().modules.find((entry) => entry.id === 'generated.wp11.fixture' && entry.version === '0.1.0');
    assert.equal(committed.provenance.model.evolutionRunId, result.evolutionRunId);
    assert.match(committed.provenance.model.turnId, /^turn_/);
    assert.match(committed.provenance.model.actionId, /^act_/);

    const reloaded = new ModuleStore({
      workspaceRoot: harness.workspaceRoot,
      eventStore: harness.eventStore,
      processSupervisor: harness.processSupervisor,
      defaultTimeoutMs: 100
    });
    assert.equal(reloaded.getState().active['generated.wp11.fixture'], '0.1.0');
    const reused = await reloaded.invoke({
      id: 'generated.wp11.fixture',
      environment: { title: 'Restart reuse', text: 'same capability survives restart' }
    }, { sessionId: 'ses_fixture_restart', requestId: 'req_reuse_12345678' });
    assert.equal(reused.status, 'ok');
    assert.equal(reused.result.title, 'Restart reuse');

    const runEvents = harness.eventStore.events.filter((event) => event.evolutionRunId === result.evolutionRunId);
    assert.ok(runEvents.some((event) => event.type === 'evolution.run.completed'));
    assert.equal(runEvents.filter((event) => event.type === 'evolution.action.started').length, 8);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('default Agent profile excludes Module Commit, Activate, and Rollback', () => {
  assert.ok(DEFAULT_AGENT_TOOLS.includes('module_candidate_create'));
  assert.ok(DEFAULT_AGENT_TOOLS.includes('module_candidate_test'));
  assert.ok(!DEFAULT_AGENT_TOOLS.includes('module_candidate_commit'));
  assert.ok(!DEFAULT_AGENT_TOOLS.includes('module_activate'));
  assert.ok(!DEFAULT_AGENT_TOOLS.includes('module_rollback'));
});

test('EvolutionRunManager serializes an unknown tool error and allows the model to recover', async () => {
  let calls = 0;
  const adapter = {
    id: 'fixture.unknown',
    async run({ messages }) {
      calls += 1;
      if (calls === 1) return request('call_unknown', 'summarize_business_task', {});
      const failure = latestToolResult(messages);
      assert.equal(failure.status, 'error');
      assert.equal(failure.error.code, errorCodes.invalidRequest);
      return { role: 'assistant', content: 'Recovered after structured unknown-tool evidence.', toolRequests: [] };
    }
  };
  const harness = createHarness(adapter);
  try {
    const result = await harness.manager.run({
      adapter: 'fixture.unknown',
      messages: [{ role: 'user', content: 'Use only raw capabilities.' }]
    }, { sessionId: 'ses_fixture_12345678', requestId: 'req_unknown_12345678' });
    assert.equal(result.status, 'ok');
    assert.equal(result.metrics.failedActions, 1);
    assert.equal(calls, 2);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('RawCapabilityDispatcher preserves checkpoint provenance on returned and thrown action errors', async () => {
  const harness = createHarness();
  const context = {
    sessionId: 'ses_fixture_12345678',
    requestId: 'req_action_error_12345678',
    checkpointId: 'chk_action_error_12345678',
    turnId: 'turn_action_error_12345678'
  };
  try {
    const returnedFailure = await harness.dispatcher.execute({
      actionId: 'act_returned_error_12345678',
      toolCallId: 'call_returned_error_12345678',
      name: 'node_execute',
      arguments: JSON.stringify({ source: 'return { value: BigInt(1) };' })
    }, context);
    assert.equal(returnedFailure.status, 'error');
    assert.equal(returnedFailure.error.checkpointId, context.checkpointId);
    assert.equal(returnedFailure.error.turnId, context.turnId);
    assert.equal(returnedFailure.error.actionId, 'act_returned_error_12345678');

    harness.target.sendCdp = async () => {
      throw createProtocolError(errorCodes.executionTimeout, 'Retryable broker timeout.', { timeoutMs: 10000 }, true);
    };
    const thrownFailure = await harness.dispatcher.execute({
      actionId: 'act_thrown_error_12345678',
      toolCallId: 'call_thrown_error_12345678',
      name: 'cdp_send',
      arguments: JSON.stringify({ method: 'Runtime.evaluate', params: {} })
    }, context);
    assert.equal(thrownFailure.status, 'error');
    assert.equal(thrownFailure.error.code, errorCodes.executionTimeout);
    assert.equal(thrownFailure.error.retryable, true);
    assert.equal(thrownFailure.error.checkpointId, context.checkpointId);
    assert.equal(thrownFailure.error.turnId, context.turnId);
    assert.equal(thrownFailure.error.actionId, 'act_thrown_error_12345678');
    const modelFeedback = JSON.parse(serializeToolResultForModel(thrownFailure));
    assert.equal(modelFeedback.error.checkpointId, context.checkpointId);
    const failedEvent = harness.eventStore.events
      .filter((event) => event.type === 'evolution.action.failed')
      .at(-1);
    assert.equal(failedEvent.data.error.checkpointId, context.checkpointId);
    assert.equal(failedEvent.data.error.actionId, 'act_thrown_error_12345678');
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('EvolutionRunManager enforces an Agent profile tool allowlist at dispatch', async () => {
  let calls = 0;
  const adapter = {
    id: 'fixture.governed-tools',
    async run({ messages, tools }) {
      calls += 1;
      assert.deepEqual(tools.map((entry) => entry.function.name), ['module_list']);
      if (calls === 1) return request('call_disallowed_activate', 'module_activate', { id: 'generated.example', version: '1.0.0' });
      const failure = latestToolResult(messages);
      assert.equal(failure.status, 'error');
      assert.match(failure.error.message, /outside the Agent profile allowlist/);
      return { role: 'assistant', content: 'Disallowed mutation remained contained.', toolRequests: [] };
    }
  };
  const harness = createHarness(adapter);
  try {
    const result = await harness.manager.run({
      adapter: adapter.id,
      allowedTools: ['module_list'],
      messages: [{ role: 'user', content: 'Attempt a disallowed action.' }]
    }, { sessionId: 'ses_fixture_12345678', requestId: 'req_governed_tools_12345678' });
    assert.equal(result.status, 'ok');
    assert.equal(result.metrics.failedActions, 1);
    assert.deepEqual(harness.moduleStore.list().active, {});
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('EvolutionRunManager rejects malformed and duplicate tool calls without dispatching arbitrary work', async () => {
  let calls = 0;
  const adapter = {
    id: 'fixture.invalid-calls',
    async run({ messages }) {
      calls += 1;
      if (calls === 1) {
        return {
          role: 'assistant',
          content: '',
          toolRequests: [
            { id: 'call_duplicate_12345678', type: 'function', name: 'module_list', arguments: '{}' },
            { id: 'call_duplicate_12345678', type: 'function', name: 'module_list', arguments: '{}' },
            { id: 'call_malformed_12345678', type: 'function', name: 'module_list', arguments: '{' },
            { id: null, type: 'function', name: null, arguments: null }
          ]
        };
      }
      const failures = messages.filter((entry) => entry.role === 'tool').map((entry) => JSON.parse(entry.content));
      assert.equal(failures.length, 4);
      assert.equal(failures[0].status, 'ok');
      assert.ok(failures.slice(1).every((entry) => entry.status === 'error' && entry.error.code === errorCodes.invalidRequest));
      return { role: 'assistant', content: 'Invalid calls were contained.', toolRequests: [] };
    }
  };
  const harness = createHarness(adapter);
  try {
    const result = await harness.manager.run({
      adapter: adapter.id,
      messages: [{ role: 'user', content: 'Exercise malformed action containment.' }]
    }, { sessionId: 'ses_fixture_12345678', requestId: 'req_invalid_calls_12345678' });
    assert.equal(result.status, 'ok');
    assert.equal(result.metrics.actions, 4);
    assert.equal(result.metrics.failedActions, 3);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('EvolutionRunManager cancellation stops an active model turn before any action dispatch', async () => {
  const adapter = {
    id: 'fixture.slow',
    async run({ signal }) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(createProtocolError(errorCodes.executionCancelled, 'Fixture model turn cancelled.', {}, true));
        }, { once: true });
      });
    }
  };
  const harness = createHarness(adapter);
  try {
    const pending = harness.manager.run({
      adapter: adapter.id,
      messages: [{ role: 'user', content: 'Wait for cancellation.' }]
    }, { sessionId: 'ses_fixture_12345678', requestId: 'req_cancel_run_12345678' });
    await new Promise((resolveImmediate) => setImmediate(resolveImmediate));
    const cancelled = harness.manager.cancel({}, {
      sessionId: 'ses_fixture_12345678',
      requestId: 'req_cancel_request_12345678'
    });
    const result = await pending;
    assert.equal(cancelled.cancelled, 1);
    assert.equal(result.status, 'cancelled');
    assert.equal(result.error.code, errorCodes.executionCancelled);
    assert.equal(result.metrics.actions, 0);
    assert.ok(harness.eventStore.events.some((event) => event.type === 'evolution.run.cancel.completed'));
    assert.ok(harness.eventStore.events.some((event) => event.type === 'evolution.run.cancelled'));
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('EvolutionRunManager preserves retryable model errors with checkpoint provenance and a retry decision event', async () => {
  const adapter = {
    id: 'fixture.retryable-timeout',
    async run() {
      throw createProtocolError(
        errorCodes.executionTimeout,
        'Fixture model turn timed out.',
        { providerRequestId: 'provider_fixture_12345678' },
        true
      );
    }
  };
  const harness = createHarness(adapter);
  try {
    const result = await harness.manager.run({
      adapter: adapter.id,
      maxTurns: 1,
      messages: [{ role: 'user', content: 'Preserve this retryable timeout.' }]
    }, { sessionId: 'ses_fixture_12345678', requestId: 'req_retryable_timeout_12345678' });

    assert.equal(result.status, 'error');
    assert.equal(result.error.code, errorCodes.executionTimeout);
    assert.equal(result.error.retryable, true);
    assert.equal(result.error.checkpointId, result.checkpointId);
    assert.match(result.error.turnId, /^turn_/);
    assert.equal(result.error.actionId, null);
    assert.equal(result.error.details.checkpointId, result.checkpointId);
    assert.equal(result.error.details.cause.code, errorCodes.executionTimeout);
    assert.equal(result.error.details.cause.retryable, true);

    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8'));
    assert.equal(evidence.error.code, errorCodes.executionTimeout);
    assert.equal(evidence.error.retryable, true);
    assert.equal(evidence.error.checkpointId, result.checkpointId);
    assert.equal(evidence.transcript.at(-1).error.retryable, true);

    const retryEvents = harness.eventStore.events.filter((event) => event.type === 'evolution.run.retry.decided');
    assert.equal(retryEvents.length, 1);
    assert.equal(retryEvents[0].data.decision, 'checkpoint-recovery-eligible');
    assert.equal(retryEvents[0].data.automaticRetry, false);
    assert.equal(retryEvents[0].data.retryable, true);
    assert.equal(retryEvents[0].data.checkpointId, result.checkpointId);
    assert.equal(retryEvents[0].data.turnId, result.error.turnId);
    const failedEvent = harness.eventStore.events.find((event) => event.type === 'evolution.run.failed');
    assert.equal(failedEvent.data.error.retryable, true);
    assert.equal(failedEvent.data.error.checkpointId, result.checkpointId);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('EvolutionRunManager cancellation during an action prevents later model turns after the action settles', async () => {
  let calls = 0;
  const adapter = {
    id: 'fixture.action-cancel',
    async run() {
      calls += 1;
      if (calls === 1) return request('call_waiting_action_12345678', 'node_execute', { source: '/* WAIT_FOR_CANCEL */ return { ok: true };' });
      return { role: 'assistant', content: 'This turn must not run after cancellation.', toolRequests: [] };
    }
  };
  const harness = createHarness(adapter);
  try {
    const pending = harness.manager.run({
      adapter: adapter.id,
      messages: [{ role: 'user', content: 'Cancel while an action is active.' }]
    }, { sessionId: 'ses_fixture_12345678', requestId: 'req_action_cancel_12345678' });
    while (harness.processSupervisor.calls.length === 0) await new Promise((resolveImmediate) => setImmediate(resolveImmediate));
    const cancelled = harness.manager.cancel({}, { sessionId: 'ses_fixture_12345678', requestId: 'req_action_cancel_signal' });
    harness.processSupervisor.releaseHeld();
    const result = await pending;
    assert.equal(cancelled.cancelled, 1);
    assert.equal(result.status, 'cancelled');
    assert.equal(result.error.code, errorCodes.executionCancelled);
    assert.equal(result.metrics.actions, 1);
    assert.equal(calls, 1);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('tool-result and run-evidence budgets remain structured and bounded', async () => {
  const oversized = {
    protocol: 'blankseed/0.1',
    kind: 'model.action.result',
    actionId: 'act_fixture_12345678',
    toolCallId: 'call_fixture_12345678',
    name: 'page_snapshot',
    actionKind: 'page.snapshot',
    status: 'ok',
    result: { text: 'x'.repeat(50000) },
    error: null,
    sourceHash: null
  };
  const serialized = serializeToolResultForModel(oversized);
  assert.ok(serialized.length <= 4000);
  assert.equal(JSON.parse(serialized).result.compressed, true);
  assert.equal(JSON.parse(serialized).result.originalHash, sha256(JSON.stringify(oversized)));

  for (const actionKind of ['node.execute', 'cdp.send', 'page.snapshot']) {
    const observation = {
      ...oversized,
      name: actionKind.replace('.', '_'),
      actionKind,
      result: {
        protocol: 'blankseed/0.1',
        executionId: 'exe_observation_12345678',
        requestKind: actionKind,
        status: 'ok',
        durationMs: 25,
        result: {
          status: 'success',
          metrics: { records: 3, skipped: 3 },
          output: 'z'.repeat(50000)
        }
      }
    };
    const compressed = serializeToolResultForModel(observation);
    const parsed = JSON.parse(compressed);
    assert.ok(compressed.length <= 4000);
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.actionKind, actionKind);
    assert.equal(parsed.result.compressed, true);
    assert.match(compressed, /metrics/);
    assert.match(compressed, /records/);
  }

  const smallObservation = { ...oversized, result: { status: 'success', metrics: { records: 1 } } };
  assert.equal(serializeToolResultForModel(smallObservation), JSON.stringify(smallObservation));

  const largeFailure = {
    ...oversized,
    status: 'error',
    result: null,
    error: {
      code: errorCodes.executionTimeout,
      name: 'Error',
      message: `timeout ${'m'.repeat(10000)}`,
      retryable: true,
      details: { timeoutMs: 90000, diagnostic: 'd'.repeat(10000) }
    }
  };
  const compressedFailure = JSON.parse(serializeToolResultForModel(largeFailure));
  assert.equal(compressedFailure.error.code, errorCodes.executionTimeout);
  assert.equal(compressedFailure.error.retryable, true);

  const adversarialCode = 'E'.repeat(5000);
  const adversarial = {
    ...largeFailure,
    actionId: `act_${'a'.repeat(5000)}`,
    toolCallId: `call_${'b'.repeat(5000)}`,
    name: 'n'.repeat(5000),
    sourceHash: 's'.repeat(5000),
    error: {
      ...largeFailure.error,
      code: adversarialCode,
      name: 'N'.repeat(5000)
    }
  };
  const adversarialOutput = serializeToolResultForModel(adversarial);
  const adversarialParsed = JSON.parse(adversarialOutput);
  assert.ok(adversarialOutput.length <= 4000);
  assert.equal(adversarialParsed.result.compressed, true);
  assert.equal(adversarialParsed.error.code, adversarialCode.slice(0, 120));
  assert.equal(adversarialParsed.error.codeHash, sha256(adversarialCode));
  assert.equal(adversarialParsed.error.retryable, true);
  const minimumBudgetOutput = serializeToolResultForModel(adversarial, 12000, 1024);
  assert.ok(minimumBudgetOutput.length <= 1024);

  const resultLimitHarness = createHarness();
  try {
    resultLimitHarness.dispatcher.config.evolutionActionResultLimitBytes = 200;
    const limited = await resultLimitHarness.dispatcher.execute({
      actionId: 'act_result_limit_12345678',
      toolCallId: 'call_result_limit_12345678',
      name: 'page_snapshot',
      arguments: '{}'
    }, { sessionId: 'ses_fixture_12345678', requestId: 'req_result_limit_12345678' });
    assert.equal(limited.status, 'error');
    assert.equal(limited.error.code, errorCodes.invalidRequest);
    assert.equal(limited.result, null);
  } finally {
    rmSync(resultLimitHarness.root, { recursive: true, force: true });
  }

  const adapter = {
    id: 'fixture.evidence-budget',
    async run() {
      return { role: 'assistant', content: 'y'.repeat(10000), toolRequests: [] };
    }
  };
  const harness = createHarness(adapter, { maxEvidenceBytes: 2000 });
  try {
    const result = await harness.manager.run({
      adapter: adapter.id,
      messages: [{ role: 'user', content: 'Exercise the evidence budget.' }]
    }, { sessionId: 'ses_fixture_12345678', requestId: 'req_evidence_budget_12345678' });
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, errorCodes.invalidRequest);
    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8'));
    assert.equal(evidence.status, 'error');
    assert.ok(evidence.evidenceTruncated);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('EvolutionRunManager compresses model-facing Node observations while retaining full run evidence', async () => {
  let calls = 0;
  let modelObservation = null;
  const adapter = {
    id: 'fixture.large-observation',
    async run({ messages }) {
      calls += 1;
      if (calls === 1) {
        return request('call_large_observation_12345678', 'node_execute', {
          source: '/* LARGE_OBSERVATION */ return { ok: true };'
        });
      }
      const message = [...messages].reverse().find((entry) => entry.role === 'tool');
      modelObservation = message.content;
      const parsed = JSON.parse(message.content);
      assert.equal(parsed.result.compressed, true);
      assert.match(message.content, /metrics/);
      return { role: 'assistant', content: 'Observed bounded Node evidence.', toolRequests: [] };
    }
  };
  const harness = createHarness(adapter);
  try {
    const result = await harness.manager.run({
      adapter: adapter.id,
      messages: [{ role: 'user', content: 'Exercise bounded model observations.' }]
    }, { sessionId: 'ses_fixture_12345678', requestId: 'req_large_observation_12345678' });

    assert.equal(result.status, 'ok');
    assert.ok(modelObservation.length <= 4000);
    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8'));
    assert.equal(evidence.actions[0].result.result.result.output.length, 50000);
    assert.deepEqual(evidence.actions[0].result.result.result.metrics, { records: 3, skipped: 3 });
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('EvolutionRunManager applies analysis, code-generation, and verification model timeout budgets', async () => {
  let calls = 0;
  const adapter = {
    id: 'fixture.adaptive-timeouts',
    async run() {
      calls += 1;
      if (calls === 1) return request('call_timeout_snapshot_12345678', 'page_snapshot', {});
      if (calls === 2) {
        return request('call_timeout_node_12345678', 'node_execute', {
          source: 'return { verified: true };'
        });
      }
      return { role: 'assistant', content: 'Adaptive timeout sequence completed.', toolRequests: [] };
    }
  };
  const harness = createHarness(adapter);
  try {
    const result = await harness.manager.run({
      adapter: adapter.id,
      messages: [{ role: 'user', content: 'Analyze, generate, and verify.' }]
    }, { sessionId: 'ses_fixture_12345678', requestId: 'req_adaptive_timeout_12345678' });

    assert.equal(result.status, 'ok');
    const selected = harness.eventStore.events
      .filter((event) => event.type === 'evolution.turn.timeout.selected')
      .map((event) => ({ timeoutClass: event.data.timeoutClass, timeoutMs: event.data.timeoutMs }));
    assert.deepEqual(selected, [
      { timeoutClass: 'analysis', timeoutMs: 90000 },
      { timeoutClass: 'codeGeneration', timeoutMs: 120000 },
      { timeoutClass: 'verification', timeoutMs: 180000 }
    ]);
    const modelTimeouts = harness.eventStore.events
      .filter((event) => event.type === 'model.turn.started')
      .map((event) => event.data.timeoutMs);
    assert.deepEqual(modelTimeouts, [90000, 120000, 180000]);
    const evidence = JSON.parse(readFileSync(result.evidencePath, 'utf8'));
    assert.deepEqual(evidence.transcript.map((turn) => turn.timeoutPolicy.timeoutMs), [90000, 120000, 180000]);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});
