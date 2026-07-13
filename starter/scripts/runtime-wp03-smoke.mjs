import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const cwd = resolve(import.meta.dirname, '..');
const fixturePath = resolve(cwd, 'test/fixtures/basic-page.html');
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
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
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

const server = createServer(async (_request, response) => {
  const html = await readFile(fixturePath);
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const fixtureUrl = `http://127.0.0.1:${server.address().port}/basic-page.html`;

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
  await window.blankseed.target.navigate(${JSON.stringify(fixtureUrl)}, { requestId: 'req_wp03_nav_fixture' });
  await sleep(800);
  const status = await window.blankseed.status.get({ requestId: 'req_wp03_status_fixture' });
  const expected = {
    targetId: status.target.targetId,
    documentGeneration: status.target.documentGeneration
  };
  const pageResult = await window.blankseed.page.execute(\`
    document.getElementById('action').click();
    return {
      title: document.title,
      heading: document.querySelector('h1')?.textContent,
      state: window.fixtureState,
      nodeType: typeof process,
      requireType: typeof require
    };
  \`, { requestId: 'req_wp03_page_fixture', ...expected });
  const cdpResult = await window.blankseed.cdp.send('Runtime.evaluate', {
    expression: '({ title: document.title, clicked: window.fixtureState.clicks })',
    returnByValue: true
  }, { requestId: 'req_wp03_cdp_fixture', ...expected });
  const events = await window.blankseed.events.tail();
  return {
    sessionId: status.sessionId,
    fixtureUrl: status.target.url,
    expected,
    pageResult,
    cdpResult,
    brokerEvents: events
      .filter((event) => event.sessionId === status.sessionId)
      .filter((event) => String(event.requestId || '').startsWith('req_wp03_') || event.type.startsWith('cdp.attach') || event.type.startsWith('cdp.detach'))
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
    timeout: 45000
  });
  cdp.close();
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  console.log(JSON.stringify(result.result.value, null, 2));
} finally {
  await closeElectron();
  await sleep(3000);
  if (electron.exitCode === null) electron.kill();
  server.close();
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
}
