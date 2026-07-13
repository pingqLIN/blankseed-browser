import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const cwd = resolve(import.meta.dirname, '..');
const electronPath = resolve(cwd, 'node_modules/electron/dist/electron.exe');
const cdpPort = Number(process.env.BLANKSEED_CDP_PORT || 9333);
const moduleId = `generated.wp07.summary.${Date.now()}`;

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
    timeout: 120000
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

let firstLaunch = null;
let secondLaunch = null;

try {
  firstLaunch = await launchElectron();
  const first = await evaluate(firstLaunch.cdp, `
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await new Promise((resolve) => {
    if (window.blankseedConsoleReady) resolve();
    else setTimeout(resolve, 1000);
  });
  const moduleId = ${JSON.stringify(moduleId)};
  const status = await window.blankseed.status.get({ requestId: 'req_wp07_status_initial' });
  const initialList = await window.blankseed.modules.list({ requestId: 'req_wp07_list_initial' });
  const checkpoint = await window.blankseed.checkpoint.create('wp07 before manual AI experiment', { requestId: 'req_wp07_checkpoint_before' });
  const snapshot = await window.blankseed.target.snapshot({ requestId: 'req_wp07_snapshot' });
  const text = snapshot.result.text;
  const manifest = (description) => ({
    id: moduleId,
    version: '0.1.0',
    description,
    entry: 'index.cjs',
    runtime: 'node',
    provenance: {
      sessionId: status.sessionId,
      executionIds: [snapshot.executionId],
      checkpointId: checkpoint.id,
      model: 'manual-copy-codex'
    },
    dependencies: {},
    tests: []
  });
  const failingSource = \`
    const text = environment.text || 'Example Domain has one paragraph.';
    const words = text.trim().split(/\\\\s+/).filter(Boolean);
    return {
      title: environment.title || 'untitled',
      wordCount: BigInt(words.length),
      sample: words.slice(0, 8)
    };
  \`;
  const failingCandidate = await window.blankseed.modules.createCandidate(
    manifest('Text summary module; first attempt intentionally returns BigInt.'),
    failingSource,
    { requestId: 'req_wp07_candidate_fail' }
  );
  const failingTest = await window.blankseed.modules.testCandidate(failingCandidate.candidateId, { requestId: 'req_wp07_test_fail' });
  const correctedSource = \`
    const text = String(environment.text || 'Example Domain has one paragraph.');
    const words = text.trim().split(/\\\\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean);
    return {
      title: environment.title || 'untitled',
      charCount: text.length,
      wordCount: words.length,
      sentenceCount: sentences.length,
      firstWords: words.slice(0, 12),
      summary: sentences.slice(0, 2).join('. ')
    };
  \`;
  const correctedCandidate = await window.blankseed.modules.createCandidate(
    manifest('Text summary module; corrected serializable result.'),
    correctedSource,
    { requestId: 'req_wp07_candidate_fix' }
  );
  const correctedTest = await window.blankseed.modules.testCandidate(correctedCandidate.candidateId, { requestId: 'req_wp07_test_fix' });
  const committed = await window.blankseed.modules.commitCandidate(correctedCandidate.candidateId, { requestId: 'req_wp07_commit' });
  const activated = await window.blankseed.modules.activate(moduleId, '0.1.0', { requestId: 'req_wp07_activate' });
  const invoked = await window.blankseed.modules.invoke(moduleId, {
    requestId: 'req_wp07_invoke_verified',
    environment: { text, title: snapshot.result.title },
    timeoutMs: 5000
  });
  const events = await window.blankseed.events.tail();
  return {
    sessionId: status.sessionId,
    initialActive: initialList.active[moduleId] || null,
    checkpointId: checkpoint.id,
    snapshot: {
      executionId: snapshot.executionId,
      title: snapshot.result.title,
      url: snapshot.result.url,
      textLength: snapshot.result.text.length
    },
    failingCandidate,
    failingTest,
    correctedCandidate,
    correctedTest,
    committed,
    activated,
    invoked,
    events: events
      .filter((event) => event.sessionId === status.sessionId)
      .filter((event) => String(event.requestId || '').startsWith('req_wp07_') || event.type.startsWith('module.'))
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

  assert(first.initialActive === null, 'experiment module namespace was already active');
  assert(first.failingTest.passed === false, 'first generated attempt did not fail');
  assert(first.failingTest.result.error.code === 'SERIALIZATION_FAILED', 'first failure was not serialization evidence');
  assert(first.correctedTest.passed === true, 'corrected generated attempt did not pass');
  assert(first.committed.manifest.status === 'committed', 'corrected candidate did not commit');
  assert(first.invoked.status === 'ok' && first.invoked.result.wordCount > 0, 'verified invocation did not produce summary');

  secondLaunch = await launchElectron();
  const second = await evaluate(secondLaunch.cdp, `
(async () => {
  const moduleId = ${JSON.stringify(moduleId)};
  const status = await window.blankseed.status.get({ requestId: 'req_wp07_reuse_status' });
  const list = await window.blankseed.modules.list({ requestId: 'req_wp07_reuse_list' });
  const reused = await window.blankseed.modules.invoke(moduleId, {
    requestId: 'req_wp07_reuse_invoke',
    environment: {
      title: 'Reuse sample',
      text: 'A later session can reuse the same generated module. Evidence should stay reproducible.'
    },
    timeoutMs: 5000
  });
  return {
    sessionId: status.sessionId,
    activeVersion: list.active[moduleId],
    reused
  };
})()
`);
  secondLaunch.cdp.close();
  await closeElectron(secondLaunch.electron, secondLaunch.getStderr());
  secondLaunch = null;

  assert(second.activeVersion === '0.1.0', 'committed module was not active after restart');
  assert(second.reused.status === 'ok' && second.reused.result.title === 'Reuse sample', 'reuse invoke failed after restart');

  console.log(JSON.stringify({ moduleId, first, second }, null, 2));
} finally {
  if (firstLaunch) await closeElectron(firstLaunch.electron, firstLaunch.getStderr());
  if (secondLaunch) await closeElectron(secondLaunch.electron, secondLaunch.getStderr());
}
