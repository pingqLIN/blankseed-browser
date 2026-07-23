import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const starterRoot = resolve(import.meta.dirname, '..');
const electronPath = resolve(starterRoot, 'node_modules/electron/dist/electron.exe');
const reportRoot = resolve(starterRoot, 'reports/ui-v2');
const evidencePath = resolve(reportRoot, 'workspace-resizer-smoke.json');
const screenshotPath = resolve(reportRoot, 'qa-workspace-resizer.png');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'blankseed-resizer-'));
const cdpPort = await allocateLoopbackPort();
const smokeNonce = randomUUID();
let electron = null;
let browserCdp = null;
let pageCdp = null;

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function allocateLoopbackPort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function waitForJson(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Electron may still be starting.
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveSend, reject) => {
        pending.set(id, { resolve: resolveSend, reject });
      });
    },
    sendAndForget(method, params = {}) {
      socket.send(JSON.stringify({ id: nextId++, method, params }));
    },
    close() {
      socket.close();
    }
  };
}

async function evaluate(expression) {
  const response = await pageCdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}

async function closeOwnedElectron() {
  if (!electron?.pid || electron.exitCode !== null) return;
  const exit = new Promise((resolveExit) => electron.once('exit', resolveExit));
  browserCdp?.sendAndForget('Browser.close');
  await Promise.race([exit, sleep(8000)]);
  if (electron.exitCode === null) electron.kill();
}

try {
  electron = spawn(electronPath, [
    '--disable-gpu',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${resolve(temporaryRoot, 'user-data')}`,
    '.'
  ], {
    cwd: starterRoot,
    env: {
      ...process.env,
      BLANKSEED_DATA_ROOT: resolve(temporaryRoot, 'data'),
      BLANKSEED_WORKSPACE_ROOT: resolve(temporaryRoot, 'workspace'),
      BLANKSEED_SMOKE_NONCE: smokeNonce
    },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });

  const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const control = targets.find((target) => (
    target.url.includes('/src/renderer/index.html')
    && target.url.includes(`blankseedSmokeNonce=${encodeURIComponent(smokeNonce)}`)
  ));
  assert(control, `Control page target not found: ${JSON.stringify(targets)}`);
  pageCdp = await connect(control.webSocketDebuggerUrl);
  const browser = await waitForJson(`http://127.0.0.1:${cdpPort}/json/version`);
  browserCdp = await connect(browser.webSocketDebuggerUrl);
  await pageCdp.send('Runtime.enable');
  await pageCdp.send('Page.enable');
  await pageCdp.send('Page.bringToFront');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate('window.blankseedConsoleReady === true')) break;
    await sleep(100);
  }
  assert.equal(await evaluate('window.blankseedConsoleReady === true'), true);

  const before = await evaluate(`(() => {
    const separator = document.getElementById('workspace-resizer');
    const rect = separator.getBoundingClientRect();
    return {
      separator: { left: rect.left, right: rect.right, width: rect.width },
      mainWidth: document.querySelector('main').getBoundingClientRect().width,
      ariaValue: Number(separator.getAttribute('aria-valuenow'))
    };
  })()`);
  const pointerX = before.separator.right - 5;
  const pointerY = 240;
  const hitTarget = await evaluate(`document.elementFromPoint(${pointerX}, ${pointerY})?.id || null`);
  assert.equal(hitTarget, 'workspace-resizer');
  await pageCdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pointerX, y: pointerY, button: 'none', buttons: 0 });
  await sleep(100);
  await pageCdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pointerX, y: pointerY, button: 'left', buttons: 1, clickCount: 1 });
  for (const deltaX of [35, 70, 105, 140]) {
    await pageCdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pointerX + deltaX, y: pointerY, button: 'left', buttons: 1 });
    await sleep(50);
  }
  await pageCdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pointerX + 140, y: pointerY, button: 'left', buttons: 0, clickCount: 1 });

  let after = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    after = await evaluate(`(async () => {
      const status = await window.blankseed.status.get();
      const separator = document.getElementById('workspace-resizer');
      return {
        statusWidth: status.target.layout.controlPanelWidth,
        targetWidth: status.target.layout.targetPanelWidth,
        mainWidth: document.querySelector('main').getBoundingClientRect().width,
        ariaValue: Number(separator.getAttribute('aria-valuenow')),
        ariaText: separator.getAttribute('aria-valuetext'),
        role: separator.getAttribute('role')
      };
    })()`);
    if (after.statusWidth === before.mainWidth + 140) break;
    await sleep(100);
  }

  assert.equal(after.statusWidth, before.mainWidth + 140);
  assert.equal(after.mainWidth, after.statusWidth);
  assert.equal(after.ariaValue, after.statusWidth);
  assert.equal(after.role, 'separator');
  assert(after.targetWidth >= 320);

  const screenshot = await pageCdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  await mkdir(reportRoot, { recursive: true });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  const evidence = {
    schema: 'blankseed-workspace-resizer-smoke/1',
    command: 'node scripts/runtime-workspace-resizer-smoke.mjs',
    status: 'PASS',
    input: { kind: 'cdp-pointer-drag', deltaX: 140 },
    before,
    after,
    assertions: {
      pointerDragUpdatedRuntimeLayout: true,
      rendererAndNativeBoundsAgree: true,
      targetMinimumWidthPreserved: true,
      separatorAccessibilityStateUpdated: true
    },
    screenshot: 'reports/ui-v2/qa-workspace-resizer.png'
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await closeOwnedElectron();
  pageCdp?.close();
  browserCdp?.close();
  await rm(temporaryRoot, { recursive: true, force: true });
}
