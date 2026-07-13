import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

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

async function closeElectron(electron, stderr = '') {
  try {
    const browser = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((response) => response.json());
    if (browser?.webSocketDebuggerUrl) {
      const cdp = await connect(browser.webSocketDebuggerUrl);
      cdp.sendAndForget('Browser.close');
      cdp.close();
    }
  } catch {
    // Best effort cleanup; the caller also kills the child process if needed.
  }
  await sleep(3000);
  if (electron?.exitCode === null) electron.kill();
  if (stderr.trim()) console.error(stderr.trim());
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  await new Promise((resolve) => {
    if (window.blankseedConsoleReady) resolve();
    else setTimeout(resolve, 1000);
  });
  const normal = await window.blankseed.model.turn([
    { role: 'system', content: 'Use evidence and do not invent capabilities.' },
    { role: 'user', content: 'Summarize current BlankSeed context.' }
  ], {
    requestId: 'req_wp08_model_turn',
    adapter: 'local.manual',
    options: { response: 'manual adapter ok' },
    timeoutMs: 5000
  });
  const slowPromise = window.blankseed.model.turn([
    { role: 'user', content: 'Wait until cancelled.' }
  ], {
    requestId: 'req_wp08_model_slow',
    adapter: 'local.manual',
    options: { delayMs: 30000 },
    timeoutMs: 30000
  });
  await sleep(300);
  const cancel = await window.blankseed.model.cancel({ requestId: 'req_wp08_model_cancel' });
  const cancelled = await slowPromise;
  let secretRejected = null;
  try {
    await window.blankseed.model.turn([
      { role: 'user', content: 'This should be rejected.' }
    ], {
      requestId: 'req_wp08_model_secret',
      adapter: 'local.manual',
      options: { apiKey: 'do-not-use' },
      timeoutMs: 5000
    });
  } catch (error) {
    secretRejected = { code: error.code, message: error.message, details: error.details };
  }
  const status = await window.blankseed.status.get({ requestId: 'req_wp08_status' });
  const events = await window.blankseed.events.tail();
  return {
    sessionId: status.sessionId,
    normal,
    cancel,
    cancelled,
    secretRejected,
    modelEvents: events
      .filter((event) => event.sessionId === status.sessionId)
      .filter((event) => event.type.startsWith('model.') || String(event.requestId || '').startsWith('req_wp08_'))
      .map((event) => ({
        sequence: event.sequence,
        type: event.type,
        requestId: event.requestId,
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
  assert(value.normal.status === 'ok', 'normal local model turn failed');
  assert(value.normal.adapter === 'local.manual', 'normal model turn used wrong adapter');
  assert(value.normal.contextHash?.startsWith('sha256:'), 'context hash missing');
  assert(value.cancel.cancelled === 1, 'model cancel did not cancel active turn');
  assert(value.cancelled.status === 'error' && value.cancelled.error.code === 'EXECUTION_CANCELLED', 'cancelled turn did not return EXECUTION_CANCELLED');
  assert(value.secretRejected?.code === 'INVALID_REQUEST', 'secret-shaped options were not rejected');
  assert(value.modelEvents.some((event) => event.type === 'model.context.packaged'), 'context packaged event missing');
  assert(value.modelEvents.some((event) => event.type === 'model.turn.cancel.completed'), 'cancel completed event missing');
  console.log(JSON.stringify(value, null, 2));
} finally {
  await closeElectron(electron, stderr);
}
