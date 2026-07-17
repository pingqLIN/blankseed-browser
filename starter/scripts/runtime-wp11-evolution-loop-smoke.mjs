import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const cwd = resolve(import.meta.dirname, '..');
const fixturePath = resolve(cwd, 'test/fixtures/basic-page.html');
const electronPath = resolve(cwd, 'node_modules/electron/dist/electron.exe');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'blankseed-wp11-'));
const workspaceRoot = join(temporaryRoot, 'workspace');
const moduleId = 'generated.wp11.runtime';
const modelRequests = [];
let completed = false;

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

async function terminateChild(electron) {
  if (!electron) return null;
  if (electron.exitCode !== null) return { code: electron.exitCode, signal: electron.signalCode };
  const exitPromise = new Promise((resolveExit) => electron.once('exit', (code, signal) => resolveExit({ code, signal })));
  electron.kill();
  return Promise.race([exitPromise, sleep(5000).then(() => null)]);
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

async function launchElectron(userDataDirectory, cdpPort) {
  const smokeNonce = randomUUID();
  const electron = spawn(electronPath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDirectory}`,
    '.'
  ], {
    cwd,
    env: {
      ...process.env,
      BLANKSEED_LOCAL_MODEL_ENDPOINT: `${serverOrigin}/v1/chat/completions`,
      BLANKSEED_LOCAL_MODEL_NAME: 'wp11-fixture-model',
      BLANKSEED_WORKSPACE_ROOT: workspaceRoot,
      BLANKSEED_SMOKE_NONCE: smokeNonce
    },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  electron.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  try {
    const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
    const control = targets.find((target) => (
      target.url.startsWith('file:///')
      && target.url.includes('/src/renderer/index.html')
      && target.url.includes(`blankseedSmokeNonce=${encodeURIComponent(smokeNonce)}`)
    ));
    if (!control) throw new Error(`Owned control page target not found for nonce ${smokeNonce}.`);
    const cdp = await connect(control.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    return { electron, cdp, cdpPort, smokeNonce, getStderr: () => stderr };
  } catch (error) {
    const exit = await terminateChild(electron);
    const details = stderr.trim();
    throw new Error(`Electron launch readiness failed and scoped child cleanup ${exit ? 'completed' : 'timed out'}: ${error.message}${details ? `\n${details}` : ''}`);
  }
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

async function closeElectron(launch) {
  const exitPromise = launch.electron.exitCode === null
    ? new Promise((resolveExit) => launch.electron.once('exit', (code, signal) => resolveExit({ code, signal })))
    : Promise.resolve({ code: launch.electron.exitCode, signal: launch.electron.signalCode });
  try {
    const targets = await fetch(`http://127.0.0.1:${launch.cdpPort}/json/list`).then((response) => response.json());
    const owned = targets.some((target) => target.url.includes(`blankseedSmokeNonce=${encodeURIComponent(launch.smokeNonce)}`));
    const browser = owned
      ? await fetch(`http://127.0.0.1:${launch.cdpPort}/json/version`).then((response) => response.json())
      : null;
    if (owned && browser?.webSocketDebuggerUrl) {
      const browserCdp = await connect(browser.webSocketDebuggerUrl);
      browserCdp.sendAndForget('Browser.close');
      browserCdp.close();
    }
  } catch {
    // The scoped process fallback below remains available.
  }
  let exit = await Promise.race([exitPromise, sleep(8000).then(() => null)]);
  if (!exit && launch.electron.exitCode === null) {
    launch.electron.kill();
    exit = await Promise.race([exitPromise, sleep(5000).then(() => null)]);
  }
  assert(exit !== null, 'Electron did not exit after Browser.close and scoped kill fallback.');
  const stderr = launch.getStderr().trim();
  if (stderr) console.error(stderr);
  return exit;
}

function toolCall(id, name, argumentsValue) {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id,
      type: 'function',
      function: { name, arguments: JSON.stringify(argumentsValue) }
    }]
  };
}

function latestToolResult(body) {
  const message = [...body.messages].reverse().find((entry) => entry.role === 'tool');
  return message ? JSON.parse(message.content) : null;
}

function modelResponse(body) {
  const step = modelRequests.length;
  const latest = latestToolResult(body);
  const manifest = (version, description) => ({
    id: moduleId,
    version,
    description,
    entry: 'index.cjs',
    runtime: 'node',
    dependencies: {},
    tests: []
  });
  if (step === 1) return toolCall('call_wp11_snapshot', 'page_snapshot', {});
  if (step === 2) {
    assert(latest?.status === 'ok' && latest.result?.result?.title === 'Fixture Page', 'model did not receive page snapshot evidence');
    return toolCall('call_wp11_candidate_fail', 'module_candidate_create', {
      manifest: manifest('0.1.0-fail', 'Intentional BigInt failure generated by the fixture model.'),
      source: 'const words = String(environment.text || "fixture").split(/\\s+/); return { wordCount: BigInt(words.length) };'
    });
  }
  if (step === 3) {
    return toolCall('call_wp11_test_fail', 'module_candidate_test', { candidateId: latest.result.candidateId });
  }
  if (step === 4) {
    assert(latest?.status === 'error', 'first generated candidate did not produce observable failure evidence');
    assert(latest.result?.passed === false, 'first candidate test unexpectedly passed');
    assert(latest.result?.result?.error?.code === 'SERIALIZATION_FAILED', 'first candidate failure was not SERIALIZATION_FAILED');
    return toolCall('call_wp11_candidate_fix', 'module_candidate_create', {
      manifest: manifest('0.1.0', 'Serializable correction generated after observed failure.'),
      source: 'const text = String(environment.text || ""); const words = text.trim().split(/\\s+/).filter(Boolean); return { title: environment.title || "untitled", wordCount: words.length, firstWords: words.slice(0, 8) };'
    });
  }
  if (step === 5) return toolCall('call_wp11_test_fix', 'module_candidate_test', { candidateId: latest.result.candidateId });
  if (step === 6) {
    assert(latest?.status === 'ok' && latest.result?.passed === true, 'corrected candidate did not pass');
    return toolCall('call_wp11_commit', 'module_candidate_commit', { candidateId: latest.result.candidateId });
  }
  if (step === 7) {
    return toolCall('call_wp11_activate', 'module_activate', { id: latest.result.moduleId, version: latest.result.version });
  }
  if (step === 8) {
    return toolCall('call_wp11_invoke', 'module_invoke', {
      id: latest.result.moduleId,
      environment: {
        title: 'Fixture Page',
        text: 'BlankSeed observes a failure, corrects generated source, and reuses the capability.'
      },
      timeoutMs: 5000
    });
  }
  assert(step === 9, `unexpected model fixture step ${step}`);
  assert(latest?.status === 'ok' && latest.result?.status === 'ok', 'verified module invocation failed');
  return { role: 'assistant', content: 'WP-11 automated evolution completed.', tool_calls: [] };
}

const server = createServer(async (request, response) => {
  try {
    if (request.url === '/basic-page.html') {
      const html = await readFile(fixturePath);
      const fixture = html.toString('utf8').replaceAll('BlankSeed Fixture', 'Fixture Page');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(fixture);
      return;
    }
    if (request.url === '/v1/chat/completions' && request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      modelRequests.push(body);
      assert(request.headers.authorization === undefined, 'loopback model request unexpectedly included Authorization');
      assert(Array.isArray(body.tools) && body.tools.some((entry) => entry.function?.name === 'module_candidate_create'), 'raw tool catalog missing');
      assert(body.messages[0]?.content?.includes('BlankSeed operational context JSON'), 'packaged context was not transmitted');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: modelResponse(body) }] }));
      return;
    }
    response.writeHead(404);
    response.end();
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: error.message } }));
  }
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const serverOrigin = `http://127.0.0.1:${server.address().port}`;
const fixtureUrl = `${serverOrigin}/basic-page.html`;
const cdpPort = await allocateLoopbackPort();
let firstLaunch = null;
let secondLaunch = null;

try {
  firstLaunch = await launchElectron(join(temporaryRoot, 'user-data-first'), cdpPort);
  const first = await evaluate(firstLaunch.cdp, `
(async () => {
  const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
  await new Promise((resolveReady) => {
    if (window.blankseedConsoleReady) resolveReady();
    else setTimeout(resolveReady, 1000);
  });
  await window.blankseed.target.navigate(${JSON.stringify(fixtureUrl)}, { requestId: 'req_wp11_nav_fixture' });
  await sleep(500);
  const statusBefore = await window.blankseed.status.get({ requestId: 'req_wp11_status_before' });
  const run = await window.blankseed.evolution.run([
    { role: 'user', content: 'Create a reusable text capability from the current page using raw capabilities. Test it, correct observed failures, commit, activate, and invoke it.' }
  ], {
    requestId: 'req_wp11_evolution_run',
    adapter: 'local.openai-compatible',
    timeoutMs: 10000,
    maxTurns: 12,
    maxActions: 16,
    targetId: statusBefore.target.targetId,
    documentGeneration: statusBefore.target.documentGeneration
  });
  const modules = await window.blankseed.modules.list({ requestId: 'req_wp11_modules_after' });
  const runtimeStop = await window.blankseed.utility.stop({ requestId: 'req_wp11_runtime_stop' });
  const events = await window.blankseed.events.tail();
  return {
    sessionId: statusBefore.sessionId,
    run,
    activeVersion: modules.active[${JSON.stringify(moduleId)}],
    runtimeStop,
    events: events
      .filter((event) => event.evolutionRunId === run.evolutionRunId)
      .map((event) => ({
        sequence: event.sequence,
        type: event.type,
        requestId: event.requestId,
        executionId: event.executionId,
        evolutionRunId: event.evolutionRunId,
        turnId: event.turnId,
        actionId: event.actionId,
        data: event.data
      }))
  };
})()
`);
  firstLaunch.cdp.close();
  await closeElectron(firstLaunch);
  firstLaunch = null;
  await assertPortReusable(cdpPort);

  assert(first.run.status === 'ok', `automated evolution failed: ${JSON.stringify(first.run.error)}`);
  assert(first.run.metrics.turns === 9 && first.run.metrics.actions === 8, 'automated turn/action counts were unexpected');
  assert(first.run.metrics.failedActions === 1, 'intentional candidate failure was not recorded');
  assert(first.activeVersion === '0.1.0', 'corrected generated module was not active');
  assert(first.runtimeStop.remaining === 0, 'generated runtime remained active after the first run');
  assert(existsSync(first.run.evidencePath), 'evolution evidence manifest was not persisted');
  const evidence = JSON.parse(await readFile(first.run.evidencePath, 'utf8'));
  assert(evidence.status === 'ok' && evidence.actions.length === 8, 'evolution evidence manifest was incomplete');
  assert(evidence.actions[2].result.error.code === 'SERIALIZATION_FAILED', 'failure evidence was missing from run manifest');
  assert(first.events.some((event) => event.type === 'evolution.run.completed'), 'run completion event missing');
  assert(first.events.filter((event) => event.type === 'evolution.action.started').length === 8, 'action correlation events missing');

  secondLaunch = await launchElectron(join(temporaryRoot, 'user-data-second'), cdpPort);
  const second = await evaluate(secondLaunch.cdp, `
(async () => {
  await new Promise((resolveReady) => {
    if (window.blankseedConsoleReady) resolveReady();
    else setTimeout(resolveReady, 1000);
  });
  const status = await window.blankseed.status.get({ requestId: 'req_wp11_reuse_status' });
  const modules = await window.blankseed.modules.list({ requestId: 'req_wp11_reuse_list' });
  const reused = await window.blankseed.modules.invoke(${JSON.stringify(moduleId)}, {
    requestId: 'req_wp11_reuse_invoke',
    environment: { title: 'Restart reuse', text: 'The committed capability survives a new Electron session.' },
    timeoutMs: 5000
  });
  const runtimeStop = await window.blankseed.utility.stop({ requestId: 'req_wp11_reuse_runtime_stop' });
  return { sessionId: status.sessionId, activeVersion: modules.active[${JSON.stringify(moduleId)}], reused, runtimeStop };
})()
`);
  secondLaunch.cdp.close();
  await closeElectron(secondLaunch);
  secondLaunch = null;

  assert(second.sessionId !== first.sessionId, 'restart reuse did not create a new application session');
  assert(second.activeVersion === '0.1.0', 'active generated module version did not survive restart');
  assert(second.reused.status === 'ok' && second.reused.result.title === 'Restart reuse', 'committed module reuse failed after restart');
  assert(second.runtimeStop.remaining === 0, 'generated runtime remained active after restart reuse');

  await assertPortReusable(cdpPort);

  completed = true;
  console.log(JSON.stringify({
    fixtureUrl,
    workspaceRoot,
    modelRequestCount: modelRequests.length,
    first: {
      sessionId: first.sessionId,
      evolutionRunId: first.run.evolutionRunId,
      checkpointId: first.run.checkpointId,
      evidencePath: first.run.evidencePath,
      metrics: first.run.metrics,
      activeVersion: first.activeVersion,
      correlatedEventCount: first.events.length
    },
    second: {
      sessionId: second.sessionId,
      activeVersion: second.activeVersion,
      reuseResult: second.reused.result
    },
    cleanup: { runtimeRemaining: second.runtimeStop.remaining, cdpPort, cdpPortReusable: true, ownershipNonceVerified: true }
  }, null, 2));
} finally {
  if (firstLaunch) {
    firstLaunch.cdp.close();
    await closeElectron(firstLaunch);
  }
  if (secondLaunch) {
    secondLaunch.cdp.close();
    await closeElectron(secondLaunch);
  }
  server.closeAllConnections();
  await new Promise((resolveClose) => server.close(resolveClose));
  if (completed) await rm(temporaryRoot, { recursive: true, force: true });
  else console.error(`WP-11 evidence preserved at: ${temporaryRoot}`);
}
