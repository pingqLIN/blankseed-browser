import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const cwd = resolve(import.meta.dirname, '..');
const electronPath = resolve(cwd, 'node_modules/electron/dist/electron.exe');
const cdpPort = Number(process.env.BLANKSEED_CDP_PORT || 9333);

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForJson(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: resolveSend, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolveSend(message.result);
    }
  });
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveSend, reject) => pending.set(id, { resolve: resolveSend, reject }));
    },
    close() {
      ws.close();
    },
    sendAndForget(method, params = {}) {
      ws.send(JSON.stringify({ id: nextId++, method, params }));
    }
  };
}

async function closeElectron() {
  try {
    const browser = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((response) => response.json());
    if (!browser?.webSocketDebuggerUrl) return;
    const cdp = await connect(browser.webSocketDebuggerUrl);
    cdp.sendAndForget('Browser.close');
    cdp.close();
  } catch {
    // Best effort cleanup; the caller also kills the child process if needed.
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pidExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

const electron = spawn(electronPath, [`--remote-debugging-port=${cdpPort}`, '.'], {
  cwd,
  stdio: ['ignore', 'ignore', 'pipe']
});

let stderr = '';
electron.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const control = targets.find((target) => target.url.startsWith('file:///') && target.url.includes('/src/renderer/index.html'));
  if (!control) throw new Error(`Control page target not found. Targets: ${JSON.stringify(targets)}`);

  const cdp = await connect(control.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  const expression = `
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const success = await window.blankseed.utility.execute(\`
    console.log('wp04 success');
    return {
      platform: process.platform,
      cwd: process.cwd(),
      marker: environment.marker
    };
  \`, {
    requestId: 'req_wp04_success',
    timeoutMs: 5000,
    environment: { marker: 'success', nodePath: ${JSON.stringify(process.execPath)} }
  });
  const thrown = await window.blankseed.utility.execute(\`
    console.error('wp04 throw');
    throw new Error('wp04 thrown');
  \`, { requestId: 'req_wp04_throw', timeoutMs: 5000 });
  const timeout = await window.blankseed.utility.execute(\`
    const { spawn } = require('node:child_process');
    const { writeFileSync } = require('node:fs');
    const { join } = require('node:path');
    const child = spawn(environment.nodePath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    writeFileSync(join(process.cwd(), 'child-pid.txt'), String(child.pid));
    console.log('childPid=' + child.pid);
    while (true) {}
  \`, {
    requestId: 'req_wp04_timeout',
    timeoutMs: 1000,
    environment: { nodePath: ${JSON.stringify(process.execPath)} }
  });
  const stopPromise = window.blankseed.utility.execute(\`
    await new Promise(() => {});
  \`, { requestId: 'req_wp04_stop', timeoutMs: 30000 });
  await sleep(500);
  const stopResult = await window.blankseed.utility.stop({ requestId: 'req_wp04_stop_control' });
  const stopped = await stopPromise;
  const crash = await window.blankseed.utility.execute(\`
    process.exit(23);
  \`, { requestId: 'req_wp04_crash', timeoutMs: 5000 });
  const recovery = await window.blankseed.utility.execute(\`
    return { afterCrash: true };
  \`, { requestId: 'req_wp04_recovery', timeoutMs: 5000 });
  const status = await window.blankseed.status.get({ requestId: 'req_wp04_status_after' });
  const events = await window.blankseed.events.tail();
  return {
    sessionId: status.sessionId,
    statusAlive: Boolean(status.sessionId),
    success,
    thrown,
    timeout,
    stopResult,
    stopped,
    crash,
    recovery,
    events: events
      .filter((event) => event.sessionId === status.sessionId)
      .filter((event) => event.type.startsWith('node.') || String(event.requestId || '').startsWith('req_wp04_'))
      .map((event) => ({
        sequence: event.sequence,
        type: event.type,
        requestId: event.requestId,
        executionId: event.executionId,
        data: event.data
      }))
  };
})()
`;

  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 90000
  });
  cdp.close();
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const value = result.result.value;

  assert(value.success.status === 'ok', 'success execution did not complete');
  assert(value.success.result.marker === 'success', 'success execution did not receive environment value');
  assert(value.thrown.status === 'error' && value.thrown.error.message.includes('wp04 thrown'), 'throw execution did not return serialized error');
  assert(value.timeout.status === 'error' && value.timeout.error.code === 'EXECUTION_TIMEOUT', 'timeout execution did not return EXECUTION_TIMEOUT');
  assert(value.stopped.status === 'error' && value.stopped.error.code === 'EXECUTION_CANCELLED', 'operator stop did not cancel active execution');
  assert(value.stopResult.stopped >= 1, 'operator stop did not report a stopped execution');
  assert(value.crash.status === 'error' && value.crash.error.code === 'PROCESS_EXITED', 'process.exit did not return PROCESS_EXITED');
  assert(value.recovery.status === 'ok' && value.recovery.result.afterCrash === true, 'runtime did not recover after crash');
  assert(value.statusAlive, 'application status did not respond after crash');

  const timeoutStart = value.events.find((event) => event.type === 'node.execution.started' && event.requestId === 'req_wp04_timeout');
  assert(timeoutStart?.data?.executionDirectory, 'timeout execution directory was not recorded');
  const childPid = Number((await readFile(join(timeoutStart.data.executionDirectory, 'child-pid.txt'), 'utf8')).trim());
  await sleep(1000);
  assert(!pidExists(childPid), `timeout descendant process still exists: ${childPid}`);

  const eventTypes = value.events.map((event) => event.type);
  for (const requiredType of [
    'node.execution.started',
    'node.runtime.stdout',
    'node.execution.completed',
    'node.execution.timeout',
    'node.runtime.kill.requested',
    'node.runtime.stop.requested',
    'node.runtime.stop.confirmed',
    'node.runtime.exited'
  ]) {
    assert(eventTypes.includes(requiredType), `missing runtime event: ${requiredType}`);
  }

  console.log(JSON.stringify({
    ...value,
    timeoutDescendant: {
      childPid,
      aliveAfterKill: pidExists(childPid)
    }
  }, null, 2));
} finally {
  await closeElectron();
  await sleep(3000);
  if (electron.exitCode === null) electron.kill();
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
}
