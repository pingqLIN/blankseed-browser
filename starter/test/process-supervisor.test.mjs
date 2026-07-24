import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ProcessSupervisor, buildUtilityProcessEnvironment } = require('../src/main/process-supervisor.cjs');

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

class FakeUtilityChild extends EventEmitter {
  constructor({ pid, behavior }) {
    super();
    this.pid = pid;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.behavior = behavior;
    this.messages = [];
  }

  postMessage(message) {
    this.messages.push(message);
    this.behavior?.(this, message);
  }

  kill() {
    setImmediate(() => this.emit('exit', 1));
    return true;
  }
}

class FakeUtilityProcess {
  constructor(behavior) {
    this.behavior = behavior;
    this.children = [];
    this.forkCalls = [];
  }

  fork(entry, args, options) {
    this.forkCalls.push({ entry, args, options });
    const child = new FakeUtilityChild({
      pid: 4400 + this.children.length,
      behavior: this.behavior
    });
    this.children.push(child);
    setImmediate(() => child.emit('spawn'));
    return child;
  }
}

function withSupervisor(behavior, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'blankseed-supervisor-'));
  const eventStore = new MemoryEventStore();
  const utilityProcessApi = new FakeUtilityProcess(behavior);
  const killCalls = [];
  const supervisor = new ProcessSupervisor({
    eventStore,
    workspaceRoot: join(root, 'workspace'),
    utilityProcessApi,
    defaultTimeoutMs: 20,
    killGraceMs: 20,
    killProcessTree: async (record) => {
      killCalls.push({ executionId: record.executionId, pid: record.childPid });
      setImmediate(() => record.child.emit('exit', 1));
      return { method: 'fake-kill-tree', ok: true, code: 0, stdout: '', stderr: '' };
    },
    ...options
  });
  return {
    eventStore,
    killCalls,
    root,
    supervisor,
    utilityProcessApi,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

test('ProcessSupervisor returns node.execute envelope and records streams', async () => {
  const harness = withSupervisor((child) => {
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('hello\n'));
      child.emit('message', {
        type: 'result',
        status: 'ok',
        result: { ok: true }
      });
      child.emit('exit', 0);
    });
  });

  try {
    const result = await harness.supervisor.execute({
      source: 'return { ok: true };',
      timeoutMs: 50
    }, {
      sessionId: 'ses_12345678',
      requestId: 'req_node_success'
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.requestKind, 'node.execute');
    assert.deepEqual(result.result, { ok: true });
    assert.deepEqual(harness.eventStore.events.map((event) => event.type), [
      'node.execution.started',
      'node.runtime.spawned',
      'node.runtime.stdout',
      'node.runtime.exited',
      'node.execution.completed'
    ]);
    assert.equal(harness.utilityProcessApi.children[0].messages[0].source, 'return { ok: true };');
  } finally {
    harness.cleanup();
  }
});

test('ProcessSupervisor preserves live results while de-identifying persisted experiment artifacts', async () => {
  const harness = withSupervisor((child) => {
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('https://private-site.example/landing Sensitive stream body\n'));
      child.emit('message', {
        type: 'result',
        status: 'ok',
        result: {
          url: 'https://private-site.example/landing',
          title: 'Sensitive page title',
          text: 'Sensitive page body',
          elements: [{ tag: 'button', name: 'Sensitive control label' }]
        }
      });
      child.emit('exit', 0);
    });
  });

  try {
    const result = await harness.supervisor.execute({
      source: 'return { target: "https://private-site.example/landing" };',
      timeoutMs: 50
    });
    const executionDirectory = harness.eventStore.events
      .find((event) => event.type === 'node.execution.started')
      .data.executionDirectory;
    const persisted = ['source.cjs', 'result.json', 'stdout.log', 'redaction.json']
      .map((fileName) => readFileSync(join(executionDirectory, fileName), 'utf8'))
      .join('\n');
    const receipt = JSON.parse(readFileSync(join(executionDirectory, 'redaction.json'), 'utf8'));

    assert.equal(result.status, 'ok');
    assert.equal(result.result.url, 'https://private-site.example/landing');
    assert.equal(result.result.title, 'Sensitive page title');
    assert.equal(existsSync(join(executionDirectory, 'redaction.json')), true);
    assert.equal(persisted.includes('private-site.example'), false);
    assert.equal(persisted.includes('Sensitive page'), false);
    assert.equal(persisted.includes('Sensitive control'), false);
    assert.equal(receipt.artifacts['source.cjs'].status, 'redacted');
    assert.equal(receipt.artifacts['result.json'].pageContentFields, 3);
    assert.equal(receipt.artifacts['stdout.log'].externalTextFields, 1);
  } finally {
    harness.cleanup();
  }
});

test('ProcessSupervisor gives generated runtimes an explicit secret-free environment allowlist', async () => {
  const environment = buildUtilityProcessEnvironment({
    PATH: 'C:\\fixture-bin',
    TEMP: 'C:\\fixture-temp',
    OPENAI_API_KEY: 'must-not-cross-boundary',
    BLANKSEED_PRIVATE_SENTINEL: 'must-not-cross-boundary'
  });
  const harness = withSupervisor((child) => {
    setImmediate(() => {
      child.emit('message', { type: 'result', status: 'ok', result: { ok: true } });
      child.emit('exit', 0);
    });
  }, { runtimeEnvironment: environment });
  try {
    const result = await harness.supervisor.execute({ source: 'return { ok: true };' });
    assert.equal(result.status, 'ok');
    const forkEnvironment = harness.utilityProcessApi.forkCalls[0].options.env;
    assert.equal(forkEnvironment.PATH, 'C:\\fixture-bin');
    assert.equal(forkEnvironment.BLANKSEED_GENERATED_RUNTIME, '1');
    assert.equal(forkEnvironment.OPENAI_API_KEY, undefined);
    assert.equal(forkEnvironment.BLANKSEED_PRIVATE_SENTINEL, undefined);
    assert.equal(JSON.stringify(harness.eventStore.events).includes('must-not-cross-boundary'), false);
  } finally {
    harness.cleanup();
  }
});

test('ProcessSupervisor times out hung runtime and requests process-tree kill', async () => {
  const harness = withSupervisor(() => {});

  try {
    const result = await harness.supervisor.execute({
      source: 'while (true) {}',
      timeoutMs: 5
    }, {
      sessionId: 'ses_12345678',
      requestId: 'req_node_timeout'
    });

    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'EXECUTION_TIMEOUT');
    assert.equal(harness.killCalls.length, 1);
    assert.ok(harness.eventStore.events.some((event) => event.type === 'node.execution.timeout'));
    assert.ok(harness.eventStore.events.some((event) => event.type === 'node.runtime.kill.requested'));
  } finally {
    harness.cleanup();
  }
});

test('ProcessSupervisor reports runtime exit without a result as PROCESS_EXITED', async () => {
  const harness = withSupervisor((child) => {
    setImmediate(() => child.emit('exit', 23));
  });

  try {
    const result = await harness.supervisor.execute({
      source: 'process.exit(23);',
      timeoutMs: 50
    }, {
      sessionId: 'ses_12345678',
      requestId: 'req_node_crash'
    });

    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'PROCESS_EXITED');
    assert.equal(result.error.details.code, 23);
    assert.ok(harness.eventStore.events.some((event) => event.type === 'node.runtime.exited'));
  } finally {
    harness.cleanup();
  }
});
