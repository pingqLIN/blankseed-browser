import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const cwd = resolve(import.meta.dirname, '..');
const electronPath = resolve(cwd, 'node_modules/electron/dist/electron.exe');
const cdpPort = Number(process.env.BLANKSEED_CDP_PORT || 9333);
const moduleId = `generated.wp05.smoke.${Date.now()}`;

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

async function launchElectron() {
  const electron = spawn(electronPath, [`--remote-debugging-port=${cdpPort}`, '.'], {
    cwd,
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  electron.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const control = targets.find((target) => target.url.startsWith('file:///') && target.url.includes('/src/renderer/index.html'));
  if (!control) throw new Error(`Control page target not found. Targets: ${JSON.stringify(targets)}`);
  const cdp = await connect(control.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  return { cdp, electron, getStderr: () => stderr };
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

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 90000
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

let first = null;
let second = null;
let firstLaunch = null;
let secondLaunch = null;

try {
  firstLaunch = await launchElectron();
  first = await evaluate(firstLaunch.cdp, `
(async () => {
  const moduleId = ${JSON.stringify(moduleId)};
  const manifest = (version) => ({
    id: moduleId,
    version,
    description: 'WP05 smoke module ' + version,
    entry: 'index.cjs',
    runtime: 'node',
    provenance: {
      sessionId: 'ses_wp05_smoke',
      executionIds: ['exe_wp05_source'],
      checkpointId: null,
      model: null
    },
    dependencies: {},
    tests: []
  });
  const source = (version, increment) => \`
    const base = Number(environment.value || 0);
    return { module: ${JSON.stringify(moduleId)}, version: '\${version}', value: base + \${increment} };
  \`;
  const candidate1 = await window.blankseed.modules.createCandidate(manifest('0.1.0'), source('0.1.0', 1), { requestId: 'req_wp05_candidate_v1' });
  const tested1 = await window.blankseed.modules.testCandidate(candidate1.candidateId, { requestId: 'req_wp05_test_v1' });
  const committed1 = await window.blankseed.modules.commitCandidate(candidate1.candidateId, { requestId: 'req_wp05_commit_v1' });
  let conflict = null;
  try {
    await window.blankseed.modules.commitCandidate(candidate1.candidateId, { requestId: 'req_wp05_commit_conflict' });
  } catch (error) {
    conflict = { code: error.code, message: error.message };
  }
  const activated1 = await window.blankseed.modules.activate(moduleId, '0.1.0', { requestId: 'req_wp05_activate_v1' });
  const invoked1 = await window.blankseed.modules.invoke(moduleId, { requestId: 'req_wp05_invoke_v1', environment: { value: 41 }, timeoutMs: 5000 });
  const candidate2 = await window.blankseed.modules.createCandidate(manifest('0.2.0'), source('0.2.0', 2), { requestId: 'req_wp05_candidate_v2' });
  const tested2 = await window.blankseed.modules.testCandidate(candidate2.candidateId, { requestId: 'req_wp05_test_v2' });
  const committed2 = await window.blankseed.modules.commitCandidate(candidate2.candidateId, { requestId: 'req_wp05_commit_v2' });
  const activated2 = await window.blankseed.modules.activate(moduleId, '0.2.0', { requestId: 'req_wp05_activate_v2' });
  const invoked2 = await window.blankseed.modules.invoke(moduleId, { requestId: 'req_wp05_invoke_v2', environment: { value: 41 }, timeoutMs: 5000 });
  const rollback = await window.blankseed.modules.rollback(moduleId, '0.1.0', { requestId: 'req_wp05_rollback_v1' });
  const invokedRollback = await window.blankseed.modules.invoke(moduleId, { requestId: 'req_wp05_invoke_rollback', environment: { value: 41 }, timeoutMs: 5000 });
  const list = await window.blankseed.modules.list({ requestId: 'req_wp05_list' });
  const status = await window.blankseed.status.get({ requestId: 'req_wp05_status' });
  const events = await window.blankseed.events.tail();
  return {
    moduleId,
    sessionId: status.sessionId,
    candidate1,
    tested1,
    committed1,
    conflict,
    activated1,
    invoked1,
    candidate2,
    tested2,
    committed2,
    activated2,
    invoked2,
    rollback,
    invokedRollback,
    activeVersion: list.active[moduleId],
    modulesRoot: status.modules.modulesRoot,
    events: events
      .filter((event) => event.sessionId === status.sessionId)
      .filter((event) => event.type.startsWith('module.') || String(event.requestId || '').startsWith('req_wp05_'))
      .map((event) => ({
        sequence: event.sequence,
        type: event.type,
        requestId: event.requestId,
        executionId: event.executionId,
        data: event.data
      }))
  };
})()
`);
  firstLaunch.cdp.close();
  await closeElectron(firstLaunch.electron, firstLaunch.getStderr());
  firstLaunch = null;

  assert(first.tested1.passed === true, 'v1 candidate did not pass test');
  assert(first.committed1.manifest.status === 'committed', 'v1 candidate did not commit');
  assert(first.conflict?.code === 'MODULE_VERSION_CONFLICT', 'duplicate commit did not produce MODULE_VERSION_CONFLICT');
  assert(first.invoked1.status === 'ok' && first.invoked1.result.value === 42, 'v1 invoke did not produce expected value');
  assert(first.tested2.passed === true && first.committed2.manifest.status === 'committed', 'v2 did not test and commit');
  assert(first.invoked2.status === 'ok' && first.invoked2.result.value === 43, 'v2 invoke did not produce expected value');
  assert(first.rollback.toVersion === '0.1.0', 'rollback did not target v1');
  assert(first.invokedRollback.status === 'ok' && first.invokedRollback.result.value === 42, 'rollback invoke did not use v1');
  assert(first.activeVersion === '0.1.0', 'active version was not v1 after rollback');

  secondLaunch = await launchElectron();
  second = await evaluate(secondLaunch.cdp, `
(async () => {
  const moduleId = ${JSON.stringify(moduleId)};
  const status = await window.blankseed.status.get({ requestId: 'req_wp05_restart_status' });
  const list = await window.blankseed.modules.list({ requestId: 'req_wp05_restart_list' });
  const invoked = await window.blankseed.modules.invoke(moduleId, { requestId: 'req_wp05_restart_invoke', environment: { value: 41 }, timeoutMs: 5000 });
  return {
    sessionId: status.sessionId,
    activeVersion: list.active[moduleId],
    invoked,
    statusAlive: Boolean(status.sessionId)
  };
})()
`);
  secondLaunch.cdp.close();
  await closeElectron(secondLaunch.electron, secondLaunch.getStderr());
  secondLaunch = null;

  assert(second.statusAlive, 'status did not respond after restart');
  assert(second.activeVersion === '0.1.0', 'active module did not survive restart');
  assert(second.invoked.status === 'ok' && second.invoked.result.value === 42, 'restart invoke did not use rolled-back version');

  console.log(JSON.stringify({ first, second }, null, 2));
} finally {
  if (firstLaunch) await closeElectron(firstLaunch.electron, firstLaunch.getStderr());
  if (secondLaunch) await closeElectron(secondLaunch.electron, secondLaunch.getStderr());
}
