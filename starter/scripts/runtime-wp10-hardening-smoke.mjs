import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const cwd = resolve(import.meta.dirname, '..');
const fixturePath = resolve(cwd, 'test/fixtures/basic-page.html');
const electronPath = resolve(cwd, 'node_modules/electron/dist/electron.exe');
const cdpPort = await allocateLoopbackPort();
const smokeNonce = randomUUID();

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

async function allocateLoopbackPort() {
  const reservation = createServer();
  await new Promise((resolveListen, rejectListen) => {
    reservation.once('error', rejectListen);
    reservation.listen(0, '127.0.0.1', resolveListen);
  });
  const port = reservation.address().port;
  await new Promise((resolveClose) => reservation.close(resolveClose));
  return port;
}

async function assertPortReusable(port) {
  const probe = createServer((_request, response) => response.end('ok'));
  await new Promise((resolveListen, rejectListen) => {
    probe.once('error', rejectListen);
    probe.listen(port, '127.0.0.1', resolveListen);
  });
  await new Promise((resolveClose) => probe.close(resolveClose));
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: resolveSend, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolveSend(message.result);
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
  const exitPromise = electron?.exitCode === null
    ? new Promise((resolveExit) => electron.once('exit', (code, signal) => resolveExit({ code, signal })))
    : Promise.resolve({ code: electron?.exitCode, signal: electron?.signalCode });
  try {
    const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
    const owned = targets.some((target) => target.url.includes(`blankseedSmokeNonce=${encodeURIComponent(smokeNonce)}`));
    const browser = owned
      ? await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((response) => response.json())
      : null;
    if (owned && browser?.webSocketDebuggerUrl) {
      const cdp = await connect(browser.webSocketDebuggerUrl);
      cdp.sendAndForget('Browser.close');
      cdp.close();
    }
  } catch {
    // The child-process fallback below still guarantees scoped cleanup.
  }
  let exit = await Promise.race([exitPromise, sleep(8000).then(() => null)]);
  if (!exit && electron?.exitCode === null) {
    electron.kill();
    exit = await Promise.race([exitPromise, sleep(5000).then(() => null)]);
  }
  assert(exit !== null, 'Electron did not exit after owned Browser.close and scoped kill fallback.');
  if (stderr.trim()) console.error(stderr.trim());
}

const server = createServer(async (request, response) => {
  if (request.url === '/basic-page.html') {
    const html = await readFile(fixturePath);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
    return;
  }
  if (request.url === '/v1/chat/completions' && request.method === 'POST') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'loopback runtime adapter ok' } }]
    }));
    return;
  }
  response.writeHead(404);
  response.end();
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const serverOrigin = `http://127.0.0.1:${server.address().port}`;
const fixtureUrl = `${serverOrigin}/basic-page.html`;
const electron = spawn(electronPath, [`--remote-debugging-port=${cdpPort}`, '.'], {
  cwd,
  env: {
    ...process.env,
    BLANKSEED_LOCAL_MODEL_ENDPOINT: `${serverOrigin}/v1/chat/completions`,
    BLANKSEED_LOCAL_MODEL_NAME: 'fixture-model',
    BLANKSEED_SMOKE_NONCE: smokeNonce
  },
  stdio: ['ignore', 'ignore', 'pipe']
});

let stderr = '';
electron.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

let output = null;
try {
  const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const control = targets.find((target) => (
    target.url.startsWith('file:///')
    && target.url.includes('/src/renderer/index.html')
    && target.url.includes(`blankseedSmokeNonce=${encodeURIComponent(smokeNonce)}`)
  ));
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
  await window.blankseed.target.navigate(${JSON.stringify(fixtureUrl)}, { requestId: 'req_wp10_nav_fixture' });
  await sleep(500);
  const pagePending = window.blankseed.page.execute(
    'await new Promise((resolve) => setTimeout(resolve, 30000)); return "late page";',
    { requestId: 'req_wp10_page_slow', timeoutMs: 30000 }
  );
  const cdpPending = window.blankseed.cdp.send('Runtime.evaluate', {
    expression: 'new Promise((resolve) => setTimeout(() => resolve(42), 30000))',
    awaitPromise: true,
    returnByValue: true
  }, { requestId: 'req_wp10_cdp_slow', timeoutMs: 30000 });
  await sleep(300);
  const cancel = await window.blankseed.execution.cancel(null, { requestId: 'req_wp10_cancel' });
  const [page, cdpResult] = await Promise.all([pagePending, cdpPending]);
  const model = await window.blankseed.model.turn([
    { role: 'user', content: 'Reply through the loopback model fixture.' }
  ], {
    requestId: 'req_wp10_model',
    adapter: 'local.openai-compatible',
    timeoutMs: 5000
  });
  const status = await window.blankseed.status.get({ requestId: 'req_wp10_status' });
  const events = await window.blankseed.events.tail();
  return {
    sessionId: status.sessionId,
    cancel,
    page,
    cdp: cdpResult,
    model,
    events: events
      .filter((event) => event.sessionId === status.sessionId)
      .filter((event) => event.type.startsWith('broker.') || event.type.startsWith('cdp.recovery') || event.type.startsWith('model.'))
      .map((event) => ({ type: event.type, requestId: event.requestId, data: event.data }))
  };
})()
`;
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 60000
  });
  cdp.close();
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const value = result.result.value;
  assert(value.cancel.cancelled === 2, 'page/CDP cancellation did not find both active executions');
  assert(value.page.status === 'error' && value.page.error.code === 'EXECUTION_CANCELLED', 'page execution was not cancelled');
  assert(value.cdp.status === 'error' && value.cdp.error.code === 'EXECUTION_CANCELLED', 'CDP execution was not cancelled');
  assert(value.model.status === 'ok', 'loopback local model turn failed');
  assert(value.model.output.content === 'loopback runtime adapter ok', 'loopback local model response was unexpected');
  assert(value.events.some((event) => event.type === 'broker.execution.cancel.completed'), 'broker cancellation evidence missing');
  assert(value.events.some((event) => event.type === 'model.turn.completed'), 'model completion evidence missing');
  output = value;
} finally {
  await closeElectron(electron, stderr);
  server.closeAllConnections();
  await new Promise((resolveClose) => server.close(resolveClose));
}

await assertPortReusable(cdpPort);
console.log(JSON.stringify({
  ...output,
  cleanup: { cdpPort, cdpPortReusable: true, ownershipNonceVerified: true }
}, null, 2));
