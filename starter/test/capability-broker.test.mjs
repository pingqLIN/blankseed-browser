import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CapabilityBroker } = require('../src/main/capability-broker.cjs');

class MemoryEventStore {
  constructor() {
    this.events = [];
  }

  append(type, data = {}, context = {}) {
    const event = {
      sequence: this.events.length + 1,
      type,
      requestId: context.requestId ?? null,
      executionId: context.executionId ?? null,
      data
    };
    this.events.push(event);
    return event;
  }
}

class FakeDebugger extends EventEmitter {
  constructor({ sendCommand = async () => ({ ok: true }), attach = () => {} } = {}) {
    super();
    this.attached = false;
    this.sendCommandImpl = sendCommand;
    this.attachImpl = attach;
    this.attachCalls = 0;
    this.detachCalls = 0;
    this.sendCalls = [];
  }

  isAttached() {
    return this.attached;
  }

  attach() {
    this.attachCalls += 1;
    this.attachImpl();
    this.attached = true;
  }

  detach() {
    this.detachCalls += 1;
    this.attached = false;
    this.emit('detach', {}, 'broker detach');
  }

  sendCommand(method, params) {
    this.sendCalls.push({ method, params });
    return this.sendCommandImpl(method, params, this.sendCalls.length);
  }
}

function createHarness(options = {}) {
  const eventStore = new MemoryEventStore();
  const target = {
    targetId: 2,
    documentGeneration: 1
  };
  const debuggerApi = options.debuggerApi ?? new FakeDebugger(options.debuggerOptions);
  const webContents = {
    debugger: debuggerApi,
    lastWorldId: null,
    lastScripts: null,
    lastUserGesture: null,
    executeJavaScriptInIsolatedWorld: async (worldId, scripts, userGesture) => {
      webContents.lastWorldId = worldId;
      webContents.lastScripts = scripts;
      webContents.lastUserGesture = userGesture;
      return options.executeJavaScript ? options.executeJavaScript(worldId, scripts, userGesture) : { ok: true };
    }
  };
  const broker = new CapabilityBroker({
    webContents,
    worldId: 1001,
    eventStore,
    defaultTimeoutMs: 25,
    getTargetIdentity: () => ({ ...target })
  });
  return { broker, debuggerApi, eventStore, target, webContents };
}

test('CapabilityBroker wraps page source and returns execution envelope', async () => {
  const { broker, eventStore, webContents } = createHarness({
    executeJavaScript: async () => ({ title: 'Fixture' })
  });

  const result = await broker.executePage('return { title: document.title };', {
    sessionId: 'ses_12345678',
    requestId: 'req_12345678'
  });

  assert.equal(result.protocol, 'blankseed/0.1');
  assert.equal(result.status, 'ok');
  assert.equal(result.requestKind, 'page.execute');
  assert.equal(result.requestId, 'req_12345678');
  assert.equal(result.result.title, 'Fixture');
  assert.equal(webContents.lastWorldId, 1001);
  assert.match(webContents.lastScripts[0].code, /^\(async \(\) =>/);
  assert.deepEqual(eventStore.events.map((event) => event.type), [
    'page.execution.started',
    'page.execution.completed'
  ]);
});

test('CapabilityBroker reports page execution timeout', async () => {
  const { broker, eventStore } = createHarness({
    executeJavaScript: () => new Promise(() => {})
  });

  const result = await broker.executePage('return 1;', {
    sessionId: 'ses_12345678',
    requestId: 'req_timeout_12345678',
    timeoutMs: 5
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'EXECUTION_TIMEOUT');
  assert.equal(result.error.retryable, true);
  assert.equal(eventStore.events.at(-1).type, 'page.execution.failed');
});

test('CapabilityBroker cancels active page execution with an inspectable event chain', async () => {
  const { broker, eventStore } = createHarness({
    executeJavaScript: () => new Promise(() => {})
  });

  const pending = broker.executePage('await new Promise(() => {});', {
    sessionId: 'ses_12345678',
    requestId: 'req_cancel_page_12345678',
    timeoutMs: 1000
  });
  await Promise.resolve();
  const cancelled = broker.cancel({}, {
    sessionId: 'ses_12345678',
    requestId: 'req_cancel_request_12345678'
  });
  const result = await pending;

  assert.equal(cancelled.cancelled, 1);
  assert.equal(cancelled.remaining, 0);
  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'EXECUTION_CANCELLED');
  assert.ok(eventStore.events.some((event) => event.type === 'broker.execution.cancel.requested'));
  assert.ok(eventStore.events.some((event) => event.type === 'broker.execution.cancel.completed'));
  assert.equal(eventStore.events.at(-1).type, 'page.execution.failed');
});

test('CapabilityBroker rejects stale expected target before execution', async () => {
  let called = false;
  const { broker } = createHarness({
    executeJavaScript: async () => {
      called = true;
      return 'should not run';
    }
  });

  const result = await broker.executePage('return 1;', {
    sessionId: 'ses_12345678',
    requestId: 'req_stale_12345678',
    expectedTarget: { targetId: 2, documentGeneration: 0 }
  });

  assert.equal(called, false);
  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'TARGET_NAVIGATED');
});

test('CapabilityBroker reports non-JSON-serializable execution results', async () => {
  const { broker } = createHarness({
    executeJavaScript: async () => 1n
  });

  const result = await broker.executePage('return 1n;', {
    sessionId: 'ses_12345678',
    requestId: 'req_serial_12345678'
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'SERIALIZATION_FAILED');
});

test('CapabilityBroker attaches CDP debugger and records command lifecycle', async () => {
  const { broker, eventStore, debuggerApi } = createHarness({
    debuggerOptions: {
      sendCommand: async (method, params) => ({ method, params, answer: 42 })
    }
  });

  const result = await broker.sendCdp('Runtime.evaluate', { expression: '1 + 1' }, {
    sessionId: 'ses_12345678',
    requestId: 'req_cdp_12345678'
  });

  assert.equal(debuggerApi.isAttached(), false);
  assert.equal(result.status, 'ok');
  assert.equal(result.result.answer, 42);
  assert.deepEqual(eventStore.events.map((event) => event.type), [
    'cdp.command.started',
    'cdp.attach.started',
    'cdp.attach.completed',
    'cdp.command.completed',
    'cdp.detach.started',
    'cdp.detached',
    'cdp.detach.completed'
  ]);
  assert.ok(eventStore.events.every((event) => event.requestId === 'req_cdp_12345678' || event.type === 'cdp.detached'));
  assert.ok(eventStore.events.every((event) => event.executionId === result.executionId || event.type === 'cdp.detached'));
});

test('CapabilityBroker wraps CDP attach failures', async () => {
  const { broker, eventStore } = createHarness({
    debuggerOptions: {
      attach: () => {
        throw new Error('attach unavailable');
      }
    }
  });

  const result = await broker.sendCdp('Page.getNavigationHistory', {}, {
    sessionId: 'ses_12345678',
    requestId: 'req_cdp_fail_12345678'
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'CDP_ATTACH_FAILED');
  assert.equal(eventStore.events.at(-2).type, 'cdp.attach.failed');
  assert.equal(eventStore.events.at(-1).type, 'cdp.command.failed');
});

test('CapabilityBroker records unexpected CDP detach and recovers on the next command', async () => {
  const { broker, debuggerApi, eventStore } = createHarness();
  debuggerApi.attached = true;
  debuggerApi.attached = false;
  debuggerApi.emit('detach', {}, 'target closed');

  const result = await broker.sendCdp('Page.getNavigationHistory', {}, {
    sessionId: 'ses_12345678',
    requestId: 'req_cdp_recover_12345678'
  });

  assert.equal(result.status, 'ok');
  assert.ok(eventStore.events.some((event) => event.type === 'cdp.detached.unexpected'));
  assert.ok(eventStore.events.some((event) => event.type === 'cdp.recovery.started'));
  assert.ok(eventStore.events.some((event) => event.type === 'cdp.recovery.completed'));
});

test('CapabilityBroker reattaches and retries once after an invalid CDP session', async () => {
  const { broker, debuggerApi, eventStore } = createHarness({
    debuggerOptions: {
      sendCommand: async (_method, _params, attempt) => {
        if (attempt === 1) throw new Error('No session with given id');
        return { recovered: true };
      }
    }
  });

  const result = await broker.sendCdp('Runtime.evaluate', { expression: '2 + 2' }, {
    sessionId: 'ses_12345678',
    requestId: 'req_cdp_session_recover_12345678'
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.result.recovered, true);
  assert.equal(debuggerApi.sendCalls.length, 2);
  assert.equal(debuggerApi.attachCalls, 2);
  assert.equal(debuggerApi.isAttached(), false);
  const invalid = eventStore.events.find((event) => event.type === 'cdp.session.invalid');
  assert.equal(invalid.data.status, 'SESSION_INVALID');
  assert.equal(invalid.data.attempt, 1);
  const recovered = eventStore.events.find((event) => event.type === 'cdp.recovery.completed' && event.data.policy === 'retry-session-invalid-once');
  assert.equal(recovered.data.status, 'RECOVERED');
  assert.equal(recovered.data.attempts, 2);
});

test('CapabilityBroker fails cleanly after one unsuccessful invalid-session retry', async () => {
  const { broker, debuggerApi, eventStore } = createHarness({
    debuggerOptions: {
      sendCommand: async () => {
        throw new Error('No session with given id: stale fixture');
      }
    }
  });

  const result = await broker.sendCdp('Page.getNavigationHistory', {}, {
    sessionId: 'ses_12345678',
    requestId: 'req_cdp_session_fail_12345678'
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'CDP_SESSION_INVALID');
  assert.equal(result.error.retryable, true);
  assert.equal(result.error.details.attempts, 2);
  assert.equal(debuggerApi.sendCalls.length, 2);
  assert.equal(debuggerApi.isAttached(), false);
  const failed = eventStore.events.find((event) => event.type === 'cdp.recovery.failed');
  assert.equal(failed.data.status, 'FAILED');
  assert.equal(failed.data.attempts, 2);
});

test('CapabilityBroker does not detach or replay an invalid externally attached CDP session', async () => {
  const { broker, debuggerApi, eventStore } = createHarness({
    debuggerOptions: {
      sendCommand: async () => {
        throw new Error('No session with given id: external fixture');
      }
    }
  });
  debuggerApi.attached = true;

  const result = await broker.sendCdp('Runtime.evaluate', { expression: '1' }, {
    sessionId: 'ses_12345678',
    requestId: 'req_cdp_external_session_12345678'
  });

  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'CDP_SESSION_INVALID');
  assert.equal(result.error.retryable, true);
  assert.equal(result.error.details.recoverySkipped, true);
  assert.equal(result.error.details.reason, 'attachment-not-owned');
  assert.equal(debuggerApi.sendCalls.length, 1);
  assert.equal(debuggerApi.detachCalls, 0);
  assert.equal(debuggerApi.isAttached(), true);
  assert.equal(eventStore.events.some((event) => event.type === 'cdp.recovery.started'), false);
  const failed = eventStore.events.find((event) => event.type === 'cdp.recovery.failed');
  assert.equal(failed.data.recoverySkipped, true);
  assert.equal(failed.data.attempts, 1);
});

test('CapabilityBroker does not replay unrelated CDP command failures', async () => {
  const { broker, debuggerApi, eventStore } = createHarness({
    debuggerOptions: {
      sendCommand: async () => {
        throw new Error('CDP method failed for an unrelated reason');
      }
    }
  });

  const result = await broker.sendCdp('Runtime.evaluate', { expression: 'throw 1' }, {
    sessionId: 'ses_12345678',
    requestId: 'req_cdp_no_replay_12345678'
  });

  assert.equal(result.status, 'error');
  assert.equal(debuggerApi.sendCalls.length, 1);
  assert.equal(eventStore.events.some((event) => event.type === 'cdp.session.invalid'), false);
  assert.equal(eventStore.events.some((event) => event.type === 'cdp.recovery.started'), false);
});
