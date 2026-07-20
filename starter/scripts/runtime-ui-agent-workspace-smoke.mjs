import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const cwd = resolve(import.meta.dirname, '..');
const electronPath = resolve(cwd, 'node_modules/electron/dist/electron.exe');
const screenshotRoot = resolve(cwd, 'workspace/state');
const desktopScreenshot = resolve(screenshotRoot, 'qa-agent-workspace-430.png');
const narrowScreenshot = resolve(screenshotRoot, 'qa-agent-workspace-390.png');
const cdpPort = await allocateLoopbackPort();
const smokeNonce = randomUUID();
const temporaryRoot = await mkdtemp(join(tmpdir(), 'blankseed-agent-ui-'));
const userDataDirectory = resolve(temporaryRoot, 'user-data');
const workspaceRoot = resolve(temporaryRoot, 'workspace');

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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
    await sleep(200);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const notifications = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) {
      notifications.push(message);
      return;
    }
    if (!pending.has(message.id)) return;
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
    notifications,
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveSend, reject) => pending.set(id, { resolve: resolveSend, reject }));
    },
    sendAndForget(method, params = {}) {
      ws.send(JSON.stringify({ id: nextId++, method, params }));
    },
    close() {
      ws.close();
    }
  };
}

function assertScreenshotPath(filePath) {
  const scoped = relative(screenshotRoot, filePath);
  assert(!isAbsolute(scoped) && scoped !== '..' && !scoped.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

async function saveScreenshot(cdp, filePath) {
  assertScreenshotPath(filePath);
  await mkdir(screenshotRoot, { recursive: true });
  const capture = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  await writeFile(filePath, Buffer.from(capture.data, 'base64'));
}

async function closeOwnedElectron(electron) {
  const exitPromise = electron.exitCode === null
    ? new Promise((resolveExit) => electron.once('exit', (code, signal) => resolveExit({ code, signal })))
    : Promise.resolve({ code: electron.exitCode, signal: electron.signalCode });
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
    // The scoped child-process fallback below still applies.
  }
  let exit = await Promise.race([exitPromise, sleep(8000).then(() => null)]);
  if (!exit && electron.exitCode === null) {
    electron.kill();
    exit = await Promise.race([exitPromise, sleep(5000).then(() => null)]);
  }
  assert(exit, 'Owned Electron did not exit after Browser.close and scoped fallback.');
}

const server = createServer(async (request, response) => {
  if (request.url === '/v1/chat/completions' && request.method === 'POST') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          content: '已完成模擬：Agent 訊息與使用者指令已分區顯示，快捷執行可正常回傳。'
        }
      }]
    }));
    return;
  }
  response.writeHead(404);
  response.end();
});

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});
const serverOrigin = `http://127.0.0.1:${server.address().port}`;
const electron = spawn(electronPath, [
  '--disable-gpu',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userDataDirectory}`,
  '.'
], {
  cwd,
  env: {
    ...process.env,
    BLANKSEED_LOCAL_MODEL_ENDPOINT: `${serverOrigin}/v1/chat/completions`,
    BLANKSEED_LOCAL_MODEL_NAME: 'agent-ui-fixture',
    BLANKSEED_SMOKE_NONCE: smokeNonce,
    BLANKSEED_WORKSPACE_ROOT: workspaceRoot
  },
  stdio: ['ignore', 'ignore', 'pipe']
});

let stderr = '';
electron.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

let evidence = null;
try {
  const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const control = targets.find((target) => (
    target.url.startsWith('file:///')
    && target.url.includes('/src/renderer/index.html')
    && target.url.includes(`blankseedSmokeNonce=${encodeURIComponent(smokeNonce)}`)
  ));
  assert(control, `Control page target not found: ${JSON.stringify(targets)}`);
  const cdp = await connect(control.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  const railResult = await cdp.send('Runtime.evaluate', {
    expression: `
      (async () => {
        const deadline = Date.now() + 15000;
        while (!window.blankseedConsoleReady && Date.now() < deadline) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 100));
        }
        if (!window.blankseedConsoleReady) throw new Error('Timed out waiting for console readiness');
        const main = document.querySelector('main');
        const initialRect = main.getBoundingClientRect();
        const initial = {
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          width: initialRect.width,
          right: initialRect.right,
          clientHeight: main.clientHeight,
          scrollHeight: main.scrollHeight,
          overflowY: getComputedStyle(main).overflowY
        };
        for (let attempt = 0; attempt < 3; attempt += 1) {
          main.scrollTop = main.scrollHeight;
          await new Promise((resolveWait) => setTimeout(resolveWait, 150));
        }
        await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
        const finalPanel = main.lastElementChild.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        const scrolled = {
          scrollTop: main.scrollTop,
          maxScroll: main.scrollHeight - main.clientHeight,
          finalPanelVisible: finalPanel.bottom <= mainRect.bottom + 1,
          mainTop: mainRect.top,
          mainBottom: mainRect.bottom,
          finalPanelTop: finalPanel.top,
          finalPanelBottom: finalPanel.bottom
        };
        main.scrollTop = 0;
        return { initial, scrolled };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  if (railResult.exceptionDetails) throw new Error(JSON.stringify(railResult.exceptionDetails));
  const rail = railResult.result.value;
  assert(rail.initial.viewportWidth > 430);
  assert(rail.initial.width <= 430);
  assert(rail.initial.right <= 430);
  assert.equal(rail.initial.clientHeight, rail.initial.viewportHeight);
  assert.equal(rail.initial.overflowY, 'auto');
  assert(rail.initial.scrollHeight > rail.initial.clientHeight);
  assert(rail.scrolled.maxScroll > 0);
  assert(rail.scrolled.scrollTop > 0);
  assert(rail.scrolled.scrollTop <= rail.scrolled.maxScroll);
  assert.equal(rail.scrolled.finalPanelVisible, true, JSON.stringify(rail));
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 430,
    height: 920,
    deviceScaleFactor: 1,
    mobile: false
  });

  const expression = `
    (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitUntil = async (predicate, label, timeoutMs = 15000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const value = await predicate();
          if (value) return value;
          await sleep(100);
        }
        throw new Error('Timed out waiting for ' + label);
      };
      await waitUntil(() => window.blankseedConsoleReady, 'console readiness');
      document.getElementById('tab-button-agent').click();
      const syntheticCredential = 'fixture-openai-key-never-log';
      const openAIKey = document.getElementById('model-openai-key');
      openAIKey.value = syntheticCredential;
      document.getElementById('model-openai-apply').click();
      await waitUntil(async () => {
        const status = await window.blankseed.status.get();
        return status.modelConfiguration.openAI.credentialSource === 'session';
      }, 'session OpenAI credential configuration');
      if (openAIKey.value !== '') throw new Error('OpenAI credential input was not cleared.');
      await waitUntil(() => !document.getElementById('model-openai-clear').disabled, 'OpenAI clear control');
      document.getElementById('model-openai-clear').click();
      await waitUntil(async () => {
        const status = await window.blankseed.status.get();
        return status.modelConfiguration.openAI.credentialSource !== 'session';
      }, 'session OpenAI credential clearing');
      const localModel = document.getElementById('model-local-name');
      localModel.value = 'agent-ui-panel-fixture';
      localModel.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('model-local-apply').click();
      await waitUntil(async () => {
        const status = await window.blankseed.status.get();
        return status.modelConfiguration.local.model === 'agent-ui-panel-fixture';
      }, 'local model panel configuration');
      const redactionProbe = JSON.stringify({
        status: await window.blankseed.status.get(),
        events: await window.blankseed.events.tail(),
        result: document.getElementById('result').textContent
      });
      if (redactionProbe.includes(syntheticCredential)) {
        throw new Error('Synthetic OpenAI credential escaped the Main Process boundary.');
      }
      const adapter = document.getElementById('agent-adapter');
      adapter.value = 'local.openai-compatible';
      const task = document.getElementById('agent-task');
      task.value = '請驗證 Agent 訊息與使用者指令是否為獨立區塊。';
      task.dispatchEvent(new Event('input', { bubbles: true }));
      task.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      await waitUntil(
        () => document.querySelectorAll('#agent-messages .agent-message').length === 2,
        'USER and AGENT transcript rows'
      );
      await waitUntil(
        () => document.getElementById('agent-run-status').textContent.includes('已完成'),
        'Agent completion status'
      );
      document.getElementById('tab-button-module').click();
      const automationButton = document.getElementById('module-auto-run');
      const confirmationDialog = document.getElementById('confirmation-dialog');
      automationButton.click();
      await waitUntil(() => confirmationDialog.open, 'Module Commit confirmation');
      const automationControlsLocked = [
        'module-id',
        'module-version',
        'module-description',
        'module-source',
        'module-auto-enabled',
        'module-candidate',
        'module-env',
        'module-create',
        'module-test',
        'module-commit',
        'module-activate',
        'module-invoke',
        'module-rollback'
      ].every((id) => document.getElementById(id).disabled);
      confirmationDialog.querySelector('button[value="no"]').click();
      await waitUntil(
        () => document.getElementById('module-auto-status').textContent.includes('流程停在已測試候選'),
        'Module automation NO stop'
      );
      const noStatus = document.getElementById('module-auto-status').textContent.trim();
      const stoppedModules = await window.blankseed.modules.list();
      const stoppedAtTestedCandidate = stoppedModules.candidates.some((candidate) => (
        candidate.id === 'generated.example'
        && candidate.version === '0.1.0'
        && candidate.status === 'tested'
      )) && !stoppedModules.modules.some((module) => (
        module.id === 'generated.example' && module.version === '0.1.0'
      ));
      automationButton.click();
      await waitUntil(() => confirmationDialog.open, 'second Module Commit confirmation');
      confirmationDialog.querySelector('button[value="yes"]').click();
      await waitUntil(
        () => confirmationDialog.open && document.getElementById('confirmation-title').textContent === '啟用版本？',
        'Module Activate confirmation'
      );
      confirmationDialog.querySelector('button[value="yes"]').click();
      await waitUntil(
        () => document.getElementById('module-auto-status').textContent.includes('自動化流程已完成'),
        'Module automation completion'
      );
      const completedStatus = document.getElementById('module-auto-status').textContent.trim();
      const completedModules = await window.blankseed.modules.list();
      const completedEvents = await window.blankseed.events.tail();
      const committed = completedModules.modules.some((module) => (
        module.id === 'generated.example'
        && module.version === '0.1.0'
        && module.status === 'committed'
      ));
      const active = completedModules.active['generated.example'] === '0.1.0';
      const invoked = completedEvents.some((event) => event.type === 'module.invocation.completed');
      document.getElementById('tab-button-agent').click();
      const transcript = document.querySelector('.agent-transcript');
      const composer = document.querySelector('.agent-composer');
      const transcriptRect = transcript.getBoundingClientRect();
      const composerRect = composer.getBoundingClientRect();
      const overflow = [...document.querySelectorAll('button,input,select,textarea,summary')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < 0 || rect.right > innerWidth;
        })
        .map((element) => element.id || element.textContent.trim().slice(0, 40));
      return {
        title: document.title,
        url: location.href,
        viewport: { width: innerWidth, height: innerHeight },
        agentMode: document.body.classList.contains('agent-mode'),
        hiddenGlobalRegions: {
          status: getComputedStyle(document.querySelector('.status-grid')).display,
          target: getComputedStyle(document.getElementById('target-panel')).display
        },
        transcriptRole: document.getElementById('agent-messages').getAttribute('role'),
        messageLabels: [...document.querySelectorAll('.message-role strong')].map((element) => element.textContent),
        messageText: document.getElementById('agent-messages').textContent,
        taskCount: document.getElementById('agent-task-count').textContent,
        runStatus: document.getElementById('agent-run-status').textContent.trim(),
        regionsSeparated: transcriptRect.bottom <= composerRect.top,
        disclosureLabels: [...document.querySelectorAll('.agent-disclosure summary > span:first-child')]
          .map((element) => element.textContent),
        modelConnection: {
          localEndpoint: document.getElementById('model-local-endpoint').value,
          localModel: document.getElementById('model-local-name').value,
          openAIKeyType: document.getElementById('model-openai-key').type,
          openAIStatus: document.getElementById('model-openai-badge').textContent,
          configurationRoundTrip: true
        },
        moduleAutomation: {
          automationControlsLocked,
          stoppedAtTestedCandidate,
          noStatus,
          completedStatus,
          committed,
          active,
          invoked
        },
        horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth,
        overflowingControls: overflow
      };
    })()
  `;
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 30000
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  evidence = result.result.value;
  evidence.leftRail = rail;
  assert.equal(evidence.title, 'BlankSeed Browser 控制台');
  assert.equal(evidence.agentMode, true);
  assert.deepEqual(evidence.hiddenGlobalRegions, { status: 'none', target: 'none' });
  assert.equal(evidence.transcriptRole, 'log');
  assert.deepEqual(evidence.messageLabels, ['USER', 'AGENT']);
  assert.match(evidence.messageText, /快捷執行可正常回傳/);
  assert.match(evidence.runStatus, /已完成/);
  assert.equal(evidence.regionsSeparated, true);
  assert.deepEqual(evidence.disclosureLabels, ['執行設定', 'AI 模型接入', 'Governance 治理']);
  assert.equal(evidence.modelConnection.localEndpoint, `${serverOrigin}/v1/chat/completions`);
  assert.equal(evidence.modelConnection.localModel, 'agent-ui-panel-fixture');
  assert.equal(evidence.modelConnection.openAIKeyType, 'password');
  assert.match(evidence.modelConnection.openAIStatus, /尚未接入|環境變數已接入/);
  assert.equal(evidence.modelConnection.configurationRoundTrip, true);
  assert.equal(evidence.moduleAutomation.automationControlsLocked, true);
  assert.equal(evidence.moduleAutomation.stoppedAtTestedCandidate, true);
  assert.match(evidence.moduleAutomation.noStatus, /流程停在已測試候選/);
  assert.match(evidence.moduleAutomation.completedStatus, /自動化流程已完成/);
  assert.equal(evidence.moduleAutomation.committed, true);
  assert.equal(evidence.moduleAutomation.active, true);
  assert.equal(evidence.moduleAutomation.invoked, true);
  assert.equal(evidence.horizontalOverflow, false);
  assert.deepEqual(evidence.overflowingControls, []);
  await saveScreenshot(cdp, desktopScreenshot);

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false
  });
  const narrowResult = await cdp.send('Runtime.evaluate', {
    expression: `({
      width: innerWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth
    })`,
    returnByValue: true
  });
  assert.equal(narrowResult.result.value.width, 390);
  assert.equal(narrowResult.result.value.overflow, false);
  assert(narrowResult.result.value.scrollWidth <= narrowResult.result.value.width);
  await saveScreenshot(cdp, narrowScreenshot);

  const relevantErrors = cdp.notifications.filter((notification) => (
    notification.method === 'Runtime.exceptionThrown'
    || (notification.method === 'Log.entryAdded' && ['error', 'warning'].includes(notification.params?.entry?.level))
  ));
  assert.deepEqual(relevantErrors, []);
  cdp.close();
} finally {
  await closeOwnedElectron(electron);
  server.closeAllConnections();
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(temporaryRoot, { recursive: true, force: true });
  if (stderr.trim()) console.error(stderr.trim());
}

console.log(JSON.stringify({
  ...evidence,
  screenshots: { desktop: desktopScreenshot, narrow: narrowScreenshot },
  cleanup: {
    ownershipNonceVerified: true,
    temporaryRuntimeRemoved: true,
    cdpPort
  }
}, null, 2));
