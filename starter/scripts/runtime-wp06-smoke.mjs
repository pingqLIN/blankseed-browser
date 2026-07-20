import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const cwd = resolve(import.meta.dirname, '..');
const electronPath = resolve(cwd, 'node_modules/electron/dist/electron.exe');
const cdpPort = Number(process.env.BLANKSEED_CDP_PORT || 9333);
const screenshotPath = resolve(cwd, 'reports/wp-06-console.png');

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
  await cdp.send('Page.enable');

  const expression = `
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate, label = 'condition', timeoutMs = 30000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await sleep(100);
    }
    throw new Error('waitFor timed out: ' + label + ' result=' + document.getElementById('result').textContent);
  };
  const readResult = () => JSON.parse(document.getElementById('result').textContent);
  const moduleId = 'generated.wp06.console.' + Date.now();

  await waitFor(() => window.blankseedConsoleReady && document.querySelectorAll('.tab').length === 5, 'console ready');
  document.querySelector('[data-tab="module"]').click();
  document.getElementById('module-id').value = moduleId;
  document.getElementById('module-version').value = '0.1.0';
  document.getElementById('module-description').value = 'WP06 console smoke';
  document.getElementById('module-source').value = "return { module: environment.name || 'wp06', value: Number(environment.value || 0) + 6 };";
  document.getElementById('module-env').value = '{"value":36,"name":"wp06"}';

  document.getElementById('module-create').click();
  await waitFor(() => document.getElementById('module-candidate').value.startsWith('cand_'), 'candidate create');
  const candidateId = document.getElementById('module-candidate').value;
  document.getElementById('module-test').click();
  await waitFor(() => readResult().passed === true, 'candidate test');
  document.getElementById('module-commit').click();
  await waitFor(() => readResult().manifest?.status === 'committed', 'candidate commit');
  document.getElementById('module-activate').click();
  await waitFor(() => readResult().active?.[moduleId] === '0.1.0', 'module activate');
  document.getElementById('module-invoke').click();
  await waitFor(() => readResult().status === 'ok' && readResult().result?.value === 42, 'module invoke');
  const invokeResult = readResult();

  document.getElementById('checkpoint-label').value = 'wp06 console smoke';
  document.getElementById('checkpoint').click();
  await waitFor(() => readResult().schema === 'blankseed-checkpoint/0.2', 'checkpoint create');
  const checkpointResult = readResult();

  await window.blankseed.modules.deactivate(moduleId, { requestId: 'req_wp06_deactivate' });
  document.getElementById('checkpoint-id').value = checkpointResult.id;
  window.confirm = () => true;
  document.getElementById('checkpoint-restore').click();
  await waitFor(() => readResult().active?.[moduleId] === '0.1.0', 'checkpoint restore');
  const restoreResult = readResult();

  document.getElementById('stop-all').click();
  await waitFor(() => document.getElementById('stop-state').classList.contains('confirmed'), 'stop all');

  await window.blankseedConsole.refreshAll();
  await sleep(500);
  return {
    moduleId,
    candidateId,
    activeTab: document.querySelector('.tab.active')?.dataset.tab,
    statusText: document.getElementById('stat-runtime').textContent,
    targetSummary: document.getElementById('target-summary').textContent,
    invokeResult,
    checkpointId: checkpointResult.id,
    restoreResult,
    stopText: document.getElementById('stop-state').textContent.trim(),
    moduleRows: document.querySelectorAll('#module-browser .browser-row').length,
    checkpointRows: document.querySelectorAll('#checkpoint-browser .browser-row').length,
    timelineRows: document.querySelectorAll('#timeline .timeline-row').length,
    hasModuleTimeline: [...document.querySelectorAll('#timeline .timeline-row strong')].some((node) => node.textContent.startsWith('module.'))
  };
})()
`;

  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 90000
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const value = result.result.value;
  assert(value.activeTab === 'module', 'module tab was not active');
  assert(value.invokeResult.status === 'ok' && value.invokeResult.result.value === 42, 'module invoke did not complete through console UI');
  assert(value.checkpointId?.startsWith('chk_'), 'checkpoint browser workflow did not create a checkpoint');
  assert(value.restoreResult.active?.[value.moduleId] === '0.1.0', 'checkpoint restore did not restore the active Module mapping');
  assert(value.restoreResult.restoreScope?.[0] === 'modules.active', 'checkpoint restore scope was not explicit');
  assert(value.stopText.includes('已確認'), 'stop-all state was not confirmed');
  assert(value.moduleRows >= 1, 'module browser did not render module rows');
  assert(value.checkpointRows >= 1, 'checkpoint browser did not render checkpoint rows');
  assert(value.timelineRows >= 8 && value.hasModuleTimeline, 'timeline did not render module events');

  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 430, height: 920, scale: 1 }
  });
  await mkdir(resolve(cwd, 'reports'), { recursive: true });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  cdp.close();
  console.log(JSON.stringify({ ...value, screenshotPath }, null, 2));
} finally {
  await closeElectron(electron, stderr);
}
