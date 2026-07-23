import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import { AsyncResourceScope, throwWithCleanupFailures } from './async-resource-scope.mjs';

const cwd = resolve(import.meta.dirname, '..');
const electronPath = resolve(cwd, 'node_modules/electron/dist/electron.exe');
const screenshotRoot = resolve(cwd, 'reports/ui-v2');
const desktopScreenshot = resolve(screenshotRoot, 'qa-workflow-desktop-500.png');
const narrowScreenshot = resolve(screenshotRoot, 'qa-agent-workspace-390.png');
const shortScreenshot = resolve(screenshotRoot, 'qa-workflow-short-430x600.png');
const runtimeSmokeEvidence = resolve(screenshotRoot, 'runtime-smoke.json');
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
    clearTimeout(resolveSend.timeoutId);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolveSend(message.result);
  });
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return {
    notifications,
    send(method, params = {}, timeoutMs = 30000) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveSend, reject) => {
        const timeoutId = setTimeout(() => {
          pending.delete(id);
          const expressionPreview = typeof params.expression === 'string'
            ? ` expression=${JSON.stringify(params.expression.trim().slice(0, 120))}`
            : '';
          reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms.${expressionPreview}`));
        }, timeoutMs);
        resolveSend.timeoutId = timeoutId;
        pending.set(id, { resolve: resolveSend, reject });
      });
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

function redactLocalPaths(value) {
  if (Array.isArray(value)) return value.map(redactLocalPaths);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactLocalPaths(entry)]));
  }
  if (typeof value !== 'string') return value;
  const pathReplacements = [
    [pathToFileURL(cwd).href, 'file:///<starter>'],
    [cwd, '<starter>'],
    [JSON.stringify(cwd).slice(1, -1), '<starter>'],
    [temporaryRoot, '<temporary-runtime>'],
    [JSON.stringify(temporaryRoot).slice(1, -1), '<temporary-runtime>']
  ];
  return pathReplacements.reduce(
    (redacted, [localPath, replacement]) => redacted.replaceAll(localPath, replacement),
    value
  );
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
  if (!electron?.pid) return;
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

const resources = new AsyncResourceScope();
let server = null;
let electron = null;
let cdp = null;
let stderr = '';
let evidence = null;
let primaryError = null;
let cleanupFailures = [];
let browserNonceObserved = false;

resources.defer('temporary Runtime root', () => rm(temporaryRoot, { recursive: true, force: true }));

try {
server = createServer(async (request, response) => {
  if (request.url === '/target' && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>BlankSeed Capability Fixture</title></head><body><h1>Capability fixture ready</h1></body></html>');
    return;
  }
  if (request.url === '/v1/chat/completions' && request.method === 'POST') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const combinedMessages = (requestBody.messages || []).map((message) => String(message.content || '')).join('\n');
    if (combinedMessages.includes('請等待取消測試')) await sleep(2000);
    let content = '已完成模擬：Agent 訊息與使用者指令已分區顯示，快捷執行可正常回傳。';
    if (combinedMessages.includes('You are the Proposer in a governed sequential Multi-Agent review.')) {
      content = '保留唯讀能力邊界，並由獨立 Reviewer 驗證 handoff identity。';
    }
    if (combinedMessages.includes('You are the Reviewer in a governed sequential Multi-Agent review.')) {
      const proposalHash = /"proposalHash":"([^"]+)"/.exec(combinedMessages)?.[1];
      if (!proposalHash) throw new Error('Reviewer fixture did not receive a proposalHash.');
      content = JSON.stringify({
        verdict: 'approve',
        proposalHash,
        reason: 'Proposal hash and bounded read-only scope are consistent.'
      });
    }
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          content
        }
      }]
    }));
    return;
  }
  response.writeHead(404);
  response.end();
});
resources.defer('loopback fixture server', async () => {
  server.closeAllConnections();
  if (server.listening) await new Promise((resolveClose) => server.close(resolveClose));
});

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});
const serverOrigin = `http://127.0.0.1:${server.address().port}`;
electron = spawn(electronPath, [
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
resources.defer('owned Electron', () => closeOwnedElectron(electron));

electron.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const spawnFailure = new Promise((resolveSpawn, rejectSpawn) => {
    electron.once('error', rejectSpawn);
  });
  const targets = await Promise.race([
    waitForJson(`http://127.0.0.1:${cdpPort}/json/list`),
    spawnFailure
  ]);
  const control = targets.find((target) => (
    target.url.startsWith('file:///')
    && target.url.includes('/src/renderer/index.html')
    && target.url.includes(`blankseedSmokeNonce=${encodeURIComponent(smokeNonce)}`)
  ));
  assert(control, `Control page target not found: ${JSON.stringify(targets)}`);
  browserNonceObserved = true;
  cdp = await connect(control.webSocketDebuggerUrl);
  resources.defer('CDP connection', async () => cdp.close());
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  let consoleReady = false;
  for (let attempt = 0; attempt < 100 && !consoleReady; attempt += 1) {
    const readiness = await cdp.send('Runtime.evaluate', {
      expression: 'window.blankseedConsoleReady === true',
      returnByValue: true
    });
    consoleReady = readiness.result.value === true;
    if (!consoleReady) await sleep(100);
  }
  assert.equal(consoleReady, true, `Control console did not become ready: ${JSON.stringify(cdp.notifications.slice(-10))}`);
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
        await new Promise((resolveLayout) => setTimeout(resolveLayout, 200));
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
  assert(rail.initial.viewportWidth > 500);
  assert(rail.initial.width <= 500);
  assert(rail.initial.right <= 500);
  assert.equal(rail.initial.clientHeight, rail.initial.viewportHeight);
  assert.equal(rail.initial.overflowY, 'auto');
  assert(rail.initial.scrollHeight > rail.initial.clientHeight);
  assert(rail.scrolled.maxScroll > 0);
  assert(rail.scrolled.scrollTop > 0);
  assert(rail.scrolled.scrollTop <= rail.scrolled.maxScroll + 1);
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
      document.getElementById('open-model-settings').click();
      const modelSettingsShortcutWorked = document.getElementById('tab-button-agent').getAttribute('aria-selected') === 'true'
        && document.getElementById('model-connection').open
        && document.activeElement === document.getElementById('model-local-endpoint');
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
      await window.blankseed.target.navigate('${serverOrigin}/target', {
        requestId: 'req_ui_target_capability_fixture'
      });
      await waitUntil(async () => {
        const status = await window.blankseed.status.get();
        return status.target?.url === '${serverOrigin}/target' && status.target?.isLoading === false;
      }, 'loopback target navigation');
      const pageExecution = await window.blankseed.page.execute(
        "return { title: document.title, heading: document.querySelector('h1')?.textContent || '' };",
        { requestId: 'req_ui_page_capability_fixture' }
      );
      const cdpExecution = await window.blankseed.cdp.send('Page.getNavigationHistory', {}, {
        requestId: 'req_ui_cdp_capability_fixture'
      });
      const nodeExecution = await window.blankseed.utility.execute('return { capability: "node", value: 42 };', {
        requestId: 'req_ui_node_capability_fixture'
      });
      const capabilityEvidence = {
        targetUrl: (await window.blankseed.status.get()).target?.url || null,
        pageStatus: pageExecution.status,
        pageTitle: pageExecution.result?.title || null,
        pageHeading: pageExecution.result?.heading || null,
        cdpStatus: cdpExecution.status,
        cdpHistoryEntries: cdpExecution.result?.entries?.length ?? 0,
        nodeStatus: nodeExecution.status,
        nodeValue: nodeExecution.result?.value ?? null
      };
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
      const normalAgentRunStatus = document.getElementById('agent-run-status').textContent.trim();
      const normalMessageLabels = [...document.querySelectorAll('.message-role strong')].map((element) => element.textContent);
      const messageNodesBeforeRefresh = [...document.querySelectorAll('#agent-messages .agent-message')];
      await window.blankseedConsole.refreshAll();
      const messageNodesAfterRefresh = [...document.querySelectorAll('#agent-messages .agent-message')];
      const liveLogNodesStable = messageNodesBeforeRefresh.length === messageNodesAfterRefresh.length
        && messageNodesBeforeRefresh.every((node, index) => node === messageNodesAfterRefresh[index]);
      const editorAccessibleNames = {
        page: document.getElementById('page-source').labels?.[0]?.textContent.trim() || '',
        node: document.getElementById('utility-source').labels?.[0]?.textContent.trim() || ''
      };
      const workflowFocusChecks = [];
      for (const workflowButton of document.querySelectorAll('[data-step-target]')) {
        workflowButton.click();
        await sleep(350);
        const stage = document.getElementById(workflowButton.dataset.stepTarget);
        const rect = stage.getBoundingClientRect();
        workflowFocusChecks.push({
          stage: stage.id,
          focused: document.activeElement === stage,
          visible: rect.bottom > 0 && rect.top < innerHeight
        });
      }
      document.getElementById('advanced-tools').open = true;
      const advancedToolFocusChecks = [];
      const toolTabs = [...document.querySelectorAll('.tabs .tab')];
      const initiallySelectedToolTab = document.querySelector('.tabs .tab[aria-selected="true"]') || toolTabs[0];
      initiallySelectedToolTab.focus();
      initiallySelectedToolTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await sleep(50);
      for (let index = 0; index < toolTabs.length; index += 1) {
        if (index > 0) {
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          await sleep(50);
        }
        const focusedTab = document.activeElement;
        const panel = document.getElementById(focusedTab.getAttribute('aria-controls'));
        advancedToolFocusChecks.push({
          tab: focusedTab.id,
          focused: focusedTab === toolTabs[index],
          selected: focusedTab.getAttribute('aria-selected') === 'true',
          panelVisible: panel?.hidden === false
        });
      }
      const reviewerAdapter = document.getElementById('reviewer-adapter');
      reviewerAdapter.value = 'local.openai-compatible';
      reviewerAdapter.dispatchEvent(new Event('change', { bubbles: true }));
      task.value = '請以唯讀方式審查 capability handoff。';
      task.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('multi-agent-run').click();
      await waitUntil(
        () => document.getElementById('multi-agent-status').classList.contains('success')
          && document.getElementById('multi-agent-status').textContent.includes('受控審核已完成'),
        'Multi-Agent governed review completion'
      );
      const multiAgentEvidence = {
        status: document.getElementById('multi-agent-status').textContent.trim(),
        decisionId: document.getElementById('governance-decision-id').value,
        proposerVisible: [...document.querySelectorAll('.message-role strong')].some((element) => element.textContent === 'PROPOSER'),
        reviewerVisible: [...document.querySelectorAll('.message-role strong')].some((element) => element.textContent === 'REVIEWER')
      };
      task.value = '請等待取消測試';
      task.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('agent-run').click();
      await waitUntil(
        () => document.getElementById('agent-run-status').classList.contains('running'),
        'Agent cancellation fixture start'
      );
      document.getElementById('agent-cancel').click();
      await waitUntil(
        () => document.getElementById('agent-run-status').classList.contains('warning')
          && document.getElementById('agent-run-status').textContent.includes('已取消'),
        'Agent cancellation warning presentation'
      );
      const agentCancellation = {
        runStatusClass: document.getElementById('agent-run-status').className,
        runStatusText: document.getElementById('agent-run-status').textContent.trim(),
        transcriptWarning: document.querySelector('#agent-messages .agent-message:last-child')?.classList.contains('warning') === true,
        workflowWarning: document.querySelector('[data-workflow-step="5"]')?.classList.contains('warning') === true
      };
      document.getElementById('tab-button-module').click();
      const automationButton = document.getElementById('module-auto-run');
      const confirmationDialog = document.getElementById('confirmation-dialog');
      automationButton.click();
      await waitUntil(() => confirmationDialog.open, 'Module Commit confirmation');
      const confirmationPresentationOpen = (await window.blankseed.status.get()).target.presentation;
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
      try {
        await waitUntil(
          () => document.getElementById('module-auto-status').textContent.includes('流程停在已測試候選'),
          'Module automation NO stop'
        );
      } catch (error) {
        throw new Error(error.message
          + '; status=' + document.getElementById('module-auto-status').textContent.trim()
          + '; dialogOpen=' + confirmationDialog.open
          + '; returnValue=' + confirmationDialog.returnValue
          + '; result=' + document.getElementById('result').textContent.slice(0, 500));
      }
      const noStatus = document.getElementById('module-auto-status').textContent.trim();
      const confirmationPresentationClosed = (await window.blankseed.status.get()).target.presentation;
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
      document.getElementById('module-version').value = '0.2.0';
      document.getElementById('module-description').value = '手動確認 gate fixture';
      const previousCandidateId = document.getElementById('module-candidate').value;
      document.getElementById('module-create').click();
      await waitUntil(
        () => document.getElementById('module-candidate').value.startsWith('cand_')
          && document.getElementById('module-candidate').value !== previousCandidateId,
        'manual Module candidate creation'
      );
      const manualCandidateId = document.getElementById('module-candidate').value;
      document.getElementById('module-test').click();
      await waitUntil(async () => (
        (await window.blankseed.modules.list()).candidates.some((candidate) => candidate.candidateId === manualCandidateId && candidate.status === 'tested')
      ), 'manual Module candidate test');
      let absentConfirmationRejected = false;
      try {
        await window.blankseed.modules.commitCandidate(manualCandidateId, {
          requestId: 'req_ui_missing_confirmation_fixture'
        });
      } catch (error) {
        absentConfirmationRejected = /explicit operator confirmation/.test(error.message);
      }
      const manualCommitCountBefore = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'module.version.committed' && event.data?.version === '0.2.0').length;
      document.getElementById('module-commit').click();
      await waitUntil(
        () => confirmationDialog.open && document.getElementById('confirmation-title').textContent === '提交所選候選？',
        'manual Module Commit NO confirmation'
      );
      confirmationDialog.querySelector('button[value="no"]').click();
      await waitUntil(() => !confirmationDialog.open, 'manual Module Commit NO close');
      const manualCommitCountAfterNo = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'module.version.committed' && event.data?.version === '0.2.0').length;
      document.getElementById('module-commit').click();
      await waitUntil(
        () => confirmationDialog.open && document.getElementById('confirmation-title').textContent === '提交所選候選？',
        'manual Module Commit YES confirmation'
      );
      confirmationDialog.querySelector('button[value="yes"]').click();
      await waitUntil(async () => (
        (await window.blankseed.modules.list()).modules.some((module) => module.id === 'generated.example' && module.version === '0.2.0')
      ), 'manual Module Commit completion');
      const manualCommitCountAfterYes = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'module.version.committed' && event.data?.version === '0.2.0').length;
      document.getElementById('module-activate').click();
      await waitUntil(
        () => confirmationDialog.open && document.getElementById('confirmation-title').textContent === '啟用所選版本？',
        'manual Module Activate NO confirmation'
      );
      confirmationDialog.querySelector('button[value="no"]').click();
      await waitUntil(() => !confirmationDialog.open, 'manual Module Activate NO close');
      const activeAfterManualNo = (await window.blankseed.modules.list()).active['generated.example'];
      const manualActivateCountBeforeYes = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'module.activated' && event.data?.version === '0.2.0').length;
      document.getElementById('module-activate').click();
      await waitUntil(
        () => confirmationDialog.open && document.getElementById('confirmation-title').textContent === '啟用所選版本？',
        'manual Module Activate YES confirmation'
      );
      confirmationDialog.querySelector('button[value="yes"]').click();
      await waitUntil(async () => (
        (await window.blankseed.modules.list()).active['generated.example'] === '0.2.0'
      ), 'manual Module Activate completion');
      const manualActivateCountAfterYes = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'module.activated' && event.data?.version === '0.2.0').length;
      document.getElementById('module-version').value = '0.1.0';
      let absentRollbackConfirmationRejected = false;
      try {
        await window.blankseed.modules.rollback('generated.example', '0.1.0', {
          requestId: 'req_ui_missing_rollback_confirmation_fixture'
        });
      } catch (error) {
        absentRollbackConfirmationRejected = /explicit operator confirmation/.test(error.message);
      }
      const rollbackCountBefore = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'module.rollback.completed').length;
      document.getElementById('module-rollback').click();
      await waitUntil(
        () => confirmationDialog.open && document.getElementById('confirmation-title').textContent === '回復所選版本？',
        'manual Module Rollback NO confirmation'
      );
      confirmationDialog.querySelector('button[value="no"]').click();
      await waitUntil(() => !confirmationDialog.open, 'manual Module Rollback NO close');
      const activeAfterRollbackNo = (await window.blankseed.modules.list()).active['generated.example'];
      const rollbackCountAfterNo = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'module.rollback.completed').length;
      document.getElementById('module-rollback').click();
      await waitUntil(
        () => confirmationDialog.open && document.getElementById('confirmation-title').textContent === '回復所選版本？',
        'manual Module Rollback YES confirmation'
      );
      confirmationDialog.querySelector('button[value="yes"]').click();
      await waitUntil(async () => (
        (await window.blankseed.modules.list()).active['generated.example'] === '0.1.0'
      ), 'manual Module Rollback completion');
      const rollbackCountAfterYes = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'module.rollback.completed').length;
      const manualModuleDialogs = {
        candidateId: manualCandidateId,
        absentConfirmationRejected,
        absentRollbackConfirmationRejected,
        commitNoMutation: manualCommitCountAfterNo === manualCommitCountBefore,
        commitExactlyOneOnYes: manualCommitCountAfterYes === manualCommitCountBefore + 1,
        activateNoMutation: activeAfterManualNo === '0.1.0' && manualActivateCountBeforeYes === 0,
        activateExactlyOneOnYes: manualActivateCountAfterYes === 1,
        rollbackNoMutation: activeAfterRollbackNo === '0.2.0' && rollbackCountAfterNo === rollbackCountBefore,
        rollbackExactlyOneOnYes: rollbackCountAfterYes === rollbackCountBefore + 1
      };
      document.getElementById('checkpoint').click();
      await waitUntil(
        async () => (await window.blankseed.checkpoint.list()).length > 0,
        'checkpoint creation'
      );
      await window.blankseedConsole.refreshAll();
      document.querySelector('#checkpoint-browser .browser-row').click();
      const selectedCheckpointId = document.getElementById('checkpoint-id').value;
      const restoreCountBefore = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'checkpoint.restore.completed').length;
      document.getElementById('checkpoint-restore').click();
      await waitUntil(
        () => confirmationDialog.open && document.getElementById('confirmation-title').textContent === '還原所選 checkpoint？',
        'checkpoint restore NO confirmation'
      );
      confirmationDialog.querySelector('button[value="no"]').click();
      await waitUntil(() => !confirmationDialog.open, 'checkpoint restore NO close');
      const restoreCountAfterNo = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'checkpoint.restore.completed').length;
      document.getElementById('checkpoint-restore').click();
      await waitUntil(
        () => confirmationDialog.open && document.getElementById('confirmation-title').textContent === '還原所選 checkpoint？',
        'checkpoint restore YES confirmation'
      );
      confirmationDialog.querySelector('button[value="yes"]').click();
      await waitUntil(async () => (
        (await window.blankseed.events.tail()).filter((event) => event.type === 'checkpoint.restore.completed').length === restoreCountBefore + 1
      ), 'checkpoint restore completion');
      const checkpointDialogEvidence = {
        selectedCheckpointId,
        noMutationOnNo: restoreCountAfterNo === restoreCountBefore,
        exactlyOneCompletionOnYes: true
      };
      document.getElementById('tab-button-node').click();
      document.getElementById('utility-source').value = "throw new Error('fulfilled error fixture');";
      document.getElementById('utility-execute').click();
      await waitUntil(
        () => document.getElementById('operation-feedback').classList.contains('error')
          && document.getElementById('result').textContent.includes('fulfilled error fixture'),
        'fulfilled Runtime error presentation'
      );
      const fulfilledErrorFeedback = {
        className: document.getElementById('operation-feedback').className,
        summary: document.getElementById('operation-summary').textContent,
        result: document.getElementById('result').textContent
      };
      document.getElementById('tab-button-agent').click();
      const governanceDecision = document.getElementById('governance-decision-id');
      governanceDecision.value = 'gov_missing_ui_fixture';
      governanceDecision.dispatchEvent(new Event('input', { bubbles: true }));
      const governanceAppliedBefore = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'governance.decision.applied').length;
      document.getElementById('governance-apply').click();
      await waitUntil(
        () => confirmationDialog.open && document.getElementById('confirmation-title').textContent === '套用治理決策？',
        'governance apply NO confirmation'
      );
      confirmationDialog.querySelector('button[value="no"]').click();
      await waitUntil(() => !confirmationDialog.open, 'governance apply NO close');
      const governanceAppliedAfterNo = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'governance.decision.applied').length;
      document.getElementById('governance-apply').click();
      await waitUntil(
        () => confirmationDialog.open && document.getElementById('confirmation-title').textContent === '套用治理決策？',
        'governance apply invalid YES confirmation'
      );
      const governanceResultBeforeInvalidYes = document.getElementById('result').textContent;
      confirmationDialog.querySelector('button[value="yes"]').click();
      await waitUntil(
        () => !confirmationDialog.open
          && document.getElementById('result').textContent !== governanceResultBeforeInvalidYes,
        'governance invalid decision fail closed'
      );
      const governanceAppliedAfterInvalidYes = (await window.blankseed.events.tail())
        .filter((event) => event.type === 'governance.decision.applied').length;
      const governanceDialogEvidence = {
        noMutationOnNo: governanceAppliedAfterNo === governanceAppliedBefore,
        invalidYesFailedClosed: governanceAppliedAfterInvalidYes === governanceAppliedBefore
          && document.getElementById('operation-feedback').classList.contains('error'),
        invalidYesResult: document.getElementById('result').textContent
      };
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
        messageLabels: normalMessageLabels,
        messageText: document.getElementById('agent-messages').textContent,
        taskCount: document.getElementById('agent-task-count').textContent,
        runStatus: normalAgentRunStatus,
        regionsSeparated: composerRect.bottom <= transcriptRect.top,
        liveLogNodesStable,
        editorAccessibleNames,
        workflowFocusChecks,
        advancedToolFocusChecks,
        capabilityEvidence,
        multiAgentEvidence,
        agentCancellation,
        disclosureLabels: [...document.querySelectorAll('.agent-disclosure summary > span:first-child')]
          .map((element) => element.textContent),
        modelConnection: {
          shortcutWorked: modelSettingsShortcutWorked,
          localEndpoint: document.getElementById('model-local-endpoint').value,
          localModel: document.getElementById('model-local-name').value,
          openAIKeyType: document.getElementById('model-openai-key').type,
          openAIStatus: document.getElementById('model-openai-badge').textContent,
          configurationRoundTrip: true
        },
        moduleAutomation: {
          automationControlsLocked,
          confirmationPresentationOpen,
          confirmationPresentationClosed,
          stoppedAtTestedCandidate,
          noStatus,
          completedStatus,
          committed,
          active,
          invoked
        },
        manualModuleDialogs,
        fulfilledErrorFeedback,
        checkpointDialogEvidence,
        governanceDialogEvidence,
        horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth,
        overflowingControls: overflow
      };
    })()
  `;
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 90000
  }, 100000);
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  evidence = result.result.value;
  evidence.leftRail = rail;
  assert.equal(evidence.title, 'BlankSeed Browser 控制台');
  assert.equal(evidence.agentMode, false);
  assert.deepEqual(evidence.hiddenGlobalRegions, { status: 'grid', target: 'grid' });
  assert.equal(evidence.transcriptRole, 'log');
  assert.deepEqual(evidence.messageLabels, ['USER', 'AGENT']);
  assert.match(evidence.messageText, /快捷執行可正常回傳/);
  assert.match(evidence.runStatus, /已完成/);
  assert.equal(evidence.regionsSeparated, true);
  assert.equal(evidence.liveLogNodesStable, true);
  assert.match(evidence.editorAccessibleNames.page, /Page JS 原始碼/);
  assert.match(evidence.editorAccessibleNames.node, /Generated Node 原始碼/);
  assert.equal(evidence.workflowFocusChecks.length, 6);
  assert(evidence.workflowFocusChecks.every((check) => check.focused && check.visible), JSON.stringify(evidence.workflowFocusChecks));
  assert.equal(evidence.advancedToolFocusChecks.length, 5);
  assert(
    evidence.advancedToolFocusChecks.every((check) => check.focused && check.selected && check.panelVisible),
    JSON.stringify(evidence.advancedToolFocusChecks)
  );
  assert.equal(evidence.capabilityEvidence.targetUrl, `${serverOrigin}/target`);
  assert.equal(evidence.capabilityEvidence.pageStatus, 'ok');
  assert.equal(evidence.capabilityEvidence.pageTitle, 'BlankSeed Capability Fixture');
  assert.equal(evidence.capabilityEvidence.pageHeading, 'Capability fixture ready');
  assert.equal(evidence.capabilityEvidence.cdpStatus, 'ok');
  assert(evidence.capabilityEvidence.cdpHistoryEntries > 0, JSON.stringify(evidence.capabilityEvidence));
  assert.equal(evidence.capabilityEvidence.nodeStatus, 'ok');
  assert.equal(evidence.capabilityEvidence.nodeValue, 42);
  assert.match(evidence.multiAgentEvidence.status, /受控審核已完成/);
  assert.match(evidence.multiAgentEvidence.decisionId, /^gov_/);
  assert.equal(evidence.multiAgentEvidence.proposerVisible, true);
  assert.equal(evidence.multiAgentEvidence.reviewerVisible, true);
  assert.match(evidence.agentCancellation.runStatusClass, /warning/);
  assert.match(evidence.agentCancellation.runStatusText, /已取消/);
  assert.equal(evidence.agentCancellation.transcriptWarning, true);
  assert.equal(evidence.agentCancellation.workflowWarning, true);
  assert.deepEqual(evidence.disclosureLabels, ['AI 模型接入', '執行設定', 'Governance 治理']);
  assert.equal(evidence.modelConnection.localEndpoint, `${serverOrigin}/v1/chat/completions`);
  assert.equal(evidence.modelConnection.shortcutWorked, true);
  assert.equal(evidence.modelConnection.localModel, 'agent-ui-panel-fixture');
  assert.equal(evidence.modelConnection.openAIKeyType, 'password');
  assert.match(evidence.modelConnection.openAIStatus, /尚未接入|環境變數已接入/);
  assert.equal(evidence.modelConnection.configurationRoundTrip, true);
  assert.equal(evidence.moduleAutomation.automationControlsLocked, true);
  assert.deepEqual(evidence.moduleAutomation.confirmationPresentationOpen, {
    overlayActive: true,
    visible: false
  });
  assert.deepEqual(evidence.moduleAutomation.confirmationPresentationClosed, {
    overlayActive: false,
    visible: true
  });
  assert.equal(evidence.moduleAutomation.stoppedAtTestedCandidate, true);
  assert.match(evidence.moduleAutomation.noStatus, /流程停在已測試候選/);
  assert.match(evidence.moduleAutomation.completedStatus, /自動化流程已完成/);
  assert.equal(evidence.moduleAutomation.committed, true);
  assert.equal(evidence.moduleAutomation.active, true);
  assert.equal(evidence.moduleAutomation.invoked, true);
  assert.match(evidence.manualModuleDialogs.candidateId, /^cand_/);
  assert.equal(evidence.manualModuleDialogs.absentConfirmationRejected, true);
  assert.equal(evidence.manualModuleDialogs.absentRollbackConfirmationRejected, true);
  assert.equal(evidence.manualModuleDialogs.commitNoMutation, true);
  assert.equal(evidence.manualModuleDialogs.commitExactlyOneOnYes, true);
  assert.equal(evidence.manualModuleDialogs.activateNoMutation, true);
  assert.equal(evidence.manualModuleDialogs.activateExactlyOneOnYes, true);
  assert.equal(evidence.manualModuleDialogs.rollbackNoMutation, true);
  assert.equal(evidence.manualModuleDialogs.rollbackExactlyOneOnYes, true);
  assert.match(evidence.fulfilledErrorFeedback.className, /error/);
  assert.match(evidence.fulfilledErrorFeedback.summary, /操作未完成/);
  assert.match(evidence.fulfilledErrorFeedback.result, /fulfilled error fixture/);
  assert.match(evidence.checkpointDialogEvidence.selectedCheckpointId, /^chk_/);
  assert.equal(evidence.checkpointDialogEvidence.noMutationOnNo, true);
  assert.equal(evidence.checkpointDialogEvidence.exactlyOneCompletionOnYes, true);
  assert.equal(evidence.governanceDialogEvidence.noMutationOnNo, true);
  assert.equal(evidence.governanceDialogEvidence.invalidYesFailedClosed, true);
  assert.match(evidence.governanceDialogEvidence.invalidYesResult, /gov_missing_ui_fixture|governance/i);
  assert.equal(evidence.horizontalOverflow, false);
  assert.deepEqual(evidence.overflowingControls, []);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 500,
    height: 920,
    deviceScaleFactor: 1,
    mobile: false
  });
  const desktopLayout = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      document.getElementById('model-connection').open = false;
      document.getElementById('advanced-tools').open = false;
      const main = document.querySelector('main');
      main.scrollTop = 0;
      await new Promise((resolveLayout) => setTimeout(resolveLayout, 200));
      return {
        width: innerWidth,
        mainWidth: main.getBoundingClientRect().width,
        horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth,
        workflowSteps: document.querySelectorAll('[data-workflow-step]').length,
        visibleContext: getComputedStyle(document.querySelector('.status-grid')).display !== 'none'
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.deepEqual(desktopLayout.result.value, {
    width: 500,
    mainWidth: 500,
    horizontalOverflow: false,
    workflowSteps: 6,
    visibleContext: true
  });
  await saveScreenshot(cdp, desktopScreenshot);

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false
  });
  const narrowResult = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const longText = 'MODULE_AUTOMATION_FAILED：這是一段用來驗證窄版錯誤訊息可完整換行的長文字，包含 generated.research.module@0.1.0 與 req_ui_validation_1234567890，不得以 ellipsis 隱藏。';
      document.getElementById('operation-next-step').textContent = longText.repeat(2);
      document.getElementById('workflow-step-4').scrollIntoView({ block: 'start' });
      await new Promise((resolveLayout) => setTimeout(resolveLayout, 200));
      const detail = document.getElementById('operation-next-step');
      const lineHeight = Number.parseFloat(getComputedStyle(detail).lineHeight);
      return {
        width: innerWidth,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth,
        longTextWrapped: detail.scrollHeight > lineHeight * 2,
        ellipsisCount: [...document.querySelectorAll('*')].filter((element) => getComputedStyle(element).textOverflow === 'ellipsis').length
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.equal(narrowResult.result.value.width, 390);
  assert.equal(narrowResult.result.value.overflow, false);
  assert(narrowResult.result.value.scrollWidth <= narrowResult.result.value.width);
  assert.equal(narrowResult.result.value.longTextWrapped, true);
  assert.equal(narrowResult.result.value.ellipsisCount, 0);
  await saveScreenshot(cdp, narrowScreenshot);

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 430,
    height: 600,
    deviceScaleFactor: 1,
    mobile: false
  });
  const shortResult = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const stage = document.getElementById('workflow-step-4');
      const main = document.querySelector('main');
      main.scrollTop = stage.offsetTop;
      await new Promise((resolveLayout) => setTimeout(resolveLayout, 200));
      const actionBar = document.querySelector('.primary-action-bar').getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        actionBarVisible: actionBar.top >= 0 && actionBar.bottom <= innerHeight,
        horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  assert.deepEqual(shortResult.result.value, {
    width: 430,
    height: 600,
    actionBarVisible: true,
    horizontalOverflow: false
  });
  await saveScreenshot(cdp, shortScreenshot);

  const relevantErrors = cdp.notifications.filter((notification) => (
    notification.method === 'Runtime.exceptionThrown'
    || (notification.method === 'Log.entryAdded' && ['error', 'warning'].includes(notification.params?.entry?.level))
  ));
  assert.deepEqual(relevantErrors, []);
} catch (error) {
  primaryError = error;
} finally {
  cleanupFailures = await resources.close();
  if (stderr.trim()) console.error(stderr.trim());
}

throwWithCleanupFailures(primaryError, cleanupFailures);

const temporaryRuntimeRemoved = await stat(temporaryRoot).then(
  () => false,
  (error) => {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
);
assert.equal(browserNonceObserved, true, 'The owned control target nonce was not observed before interaction.');
assert.equal(temporaryRuntimeRemoved, true, 'Expected the temporary Runtime root to be absent after cleanup.');

const finalEvidence = {
  schema: 'blankseed-ui-runtime-smoke/1',
  command: 'node scripts/runtime-ui-agent-workspace-smoke.mjs',
  exitCode: 0,
  ...evidence,
  screenshots: { desktop: desktopScreenshot, narrow: narrowScreenshot, short: shortScreenshot },
  cleanup: {
    browserNonceObserved,
    ownedChildProcessExited: electron?.exitCode !== null || electron?.signalCode !== null,
    temporaryRuntimeRemoved,
    cdpPort
  }
};
const redactedEvidence = redactLocalPaths(finalEvidence);
await writeFile(runtimeSmokeEvidence, `${JSON.stringify(redactedEvidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(redactedEvidence, null, 2));
