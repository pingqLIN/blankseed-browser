import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cwd = resolve(import.meta.dirname, '..');
const electronPath = resolve(cwd, 'node_modules/electron/dist/electron.exe');
const fixturePath = resolve(cwd, 'test/fixtures/basic-page.html');
const taskSuitePath = resolve(cwd, 'test/fixtures/sandbox-ten-tasks.json');
const taskSuite = JSON.parse(await readFile(taskSuitePath, 'utf8'));
const tasks = taskSuite.tasks;
assert.equal(tasks.length, 10, 'Sandbox task suite must contain exactly ten tasks.');
assert.equal(new Set(tasks.map((task) => task.id)).size, 10, 'Sandbox task IDs must be unique.');

const temporaryRoot = await mkdtemp(join(tmpdir(), 'blankseed-sandbox-ten-tasks-'));
const workspaceRoot = join(temporaryRoot, 'workspace');
const dataRoot = join(temporaryRoot, 'data');
const userDataDirectory = join(temporaryRoot, 'user-data');
const moduleId = 'generated.sandbox.counter';
const modelRequests = [];
let completed = false;

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
    sendAndForget(method, params = {}) {
      ws.send(JSON.stringify({ id: nextId++, method, params }));
    },
    close() { ws.close(); }
  };
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

async function launchElectron(cdpPort, modelEndpoint) {
  const smokeNonce = randomUUID();
  const electron = spawn(electronPath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDirectory}`,
    '.'
  ], {
    cwd,
    env: {
      ...process.env,
      BLANKSEED_LOCAL_MODEL_ENDPOINT: modelEndpoint,
      BLANKSEED_LOCAL_MODEL_NAME: 'sandbox-ten-task-fixture',
      BLANKSEED_WORKSPACE_ROOT: workspaceRoot,
      BLANKSEED_DATA_ROOT: dataRoot,
      BLANKSEED_SANDBOX_AGENT_AUTO_APPLY: '1',
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
    assert(control, `Owned control page was not found for nonce ${smokeNonce}.`);
    const cdp = await connect(control.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    return { cdp, cdpPort, electron, smokeNonce, getStderr: () => stderr };
  } catch (error) {
    electron.kill();
    throw error;
  }
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
    // The scoped process fallback below still guarantees owned cleanup.
  }
  let exit = await Promise.race([exitPromise, sleep(8000).then(() => null)]);
  if (!exit && launch.electron.exitCode === null) {
    launch.electron.kill();
    exit = await Promise.race([exitPromise, sleep(5000).then(() => null)]);
  }
  assert(exit, 'Owned Electron did not exit after Browser.close and scoped fallback.');
  const stderr = launch.getStderr().trim();
  if (stderr) console.error(stderr);
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

function taskIdFromBody(body) {
  const text = body.messages.map((message) => String(message.content || '')).join('\n');
  return /TASK-\d{2}/.exec(text)?.[0] ?? null;
}

function terminal(taskId, message) {
  return { role: 'assistant', content: `${taskId} PASS：${message}`, tool_calls: [] };
}

function manifest(version, description) {
  return {
    id: moduleId,
    version,
    description,
    entry: 'index.cjs',
    runtime: 'node',
    dependencies: {},
    tests: []
  };
}

function scenarioResponse(body) {
  const promptText = body.messages.map((message) => String(message.content || '')).join('\n');
  if (promptText.includes('You are the Proposer in a governed sequential Multi-Agent review.')) {
    return {
      role: 'assistant',
      content: 'Activate generated.sandbox.counter@1.1.0 inside the ephemeral sandbox profile after validating immutable Module identity.',
      tool_calls: []
    };
  }
  if (promptText.includes('You are the Reviewer in a governed sequential Multi-Agent review.')) {
    const proposalHash = /"proposalHash":"([^"]+)"/.exec(promptText)?.[1];
    assert(proposalHash, 'Reviewer prompt did not contain proposalHash.');
    return {
      role: 'assistant',
      content: JSON.stringify({
        verdict: 'approve',
        proposalHash,
        reason: 'Distinct Agent identities, committed sourceHash, temporary roots, loopback egress and compare-and-swap activation are consistent.'
      }),
      tool_calls: []
    };
  }

  const taskId = taskIdFromBody(body);
  const step = body.messages.filter((message) => message.role === 'tool').length;
  const latest = latestToolResult(body);
  assert(taskId, 'Model request did not contain a task ID.');

  if (taskId === 'TASK-01') {
    if (step === 0) return toolCall('call_task01_snapshot', 'page_snapshot', {});
    assert.equal(latest.result.result.title, 'Fixture Page');
    return terminal(taskId, 'page snapshot 已驗證。');
  }
  if (taskId === 'TASK-02') {
    if (step === 0) {
      return toolCall('call_task02_page', 'page_execute', {
        source: 'return { heading: document.querySelector("h1")?.textContent || null, links: document.links.length };'
      });
    }
    assert.deepEqual(latest.result.result, { heading: 'Fixture Page', links: 0 });
    return terminal(taskId, 'isolated page execution 已驗證。');
  }
  if (taskId === 'TASK-03') {
    if (step === 0) return toolCall('call_task03_cdp', 'cdp_send', { method: 'Page.getNavigationHistory', params: {} });
    assert(Array.isArray(latest.result.result.entries) && latest.result.result.entries.length >= 1);
    return terminal(taskId, 'CDP navigation history 已驗證。');
  }
  if (taskId === 'TASK-04') {
    if (step === 0) return toolCall('call_task04_node', 'node_execute', { source: 'return { answer: 6 * 7 };' });
    assert.equal(latest.result.result.answer, 42);
    return terminal(taskId, 'supervised Node result=42。');
  }
  if (taskId === 'TASK-05') {
    if (step === 0) return toolCall('call_task05_modules', 'module_list', {});
    assert.equal(latest.result.modules.length, 0);
    assert.deepEqual(latest.result.active, {});
    return terminal(taskId, '初始 Module Store 為空。');
  }
  if (taskId === 'TASK-06') {
    if (step === 0) {
      return toolCall('call_task06_create', 'module_candidate_create', {
        manifest: manifest('1.0.0', 'Sandbox counter base version.'),
        source: 'return { version: "1.0.0", value: Number(environment.value || 0) + 1 };'
      });
    }
    if (step === 1) return toolCall('call_task06_test', 'module_candidate_test', { candidateId: latest.result.candidateId });
    if (step === 2) {
      assert.equal(latest.result.passed, true);
      return toolCall('call_task06_commit', 'module_candidate_commit', { candidateId: latest.result.candidateId });
    }
    assert.equal(latest.result.version, '1.0.0');
    return terminal(taskId, 'base Module 已 Test 與 Commit。');
  }
  if (taskId === 'TASK-07') {
    if (step === 0) {
      return toolCall('call_task07_create', 'module_candidate_create', {
        manifest: manifest('1.1.0', 'Sandbox counter reviewed next version.'),
        source: 'return { version: "1.1.0", value: Number(environment.value || 0) + 2 };'
      });
    }
    if (step === 1) return toolCall('call_task07_test', 'module_candidate_test', { candidateId: latest.result.candidateId });
    if (step === 2) {
      assert.equal(latest.result.passed, true);
      return toolCall('call_task07_commit', 'module_candidate_commit', { candidateId: latest.result.candidateId });
    }
    assert.equal(latest.result.version, '1.1.0');
    return terminal(taskId, 'next Module version 已 Test 與 Commit。');
  }
  if (taskId === 'TASK-08') {
    if (step === 0) return toolCall('call_task08_activate', 'module_activate', { id: moduleId, version: '1.0.0' });
    if (step === 1) {
      return toolCall('call_task08_invoke', 'module_invoke', {
        id: moduleId,
        environment: { value: 40 },
        timeoutMs: 5000
      });
    }
    assert.equal(latest.result.result.version, '1.0.0');
    assert.equal(latest.result.result.value, 41);
    return terminal(taskId, '1.0.0 Activate 與 Invoke 已驗證。');
  }
  if (taskId === 'TASK-09') {
    if (step === 0) return toolCall('call_task09_fail', 'node_execute', { source: 'throw new Error("intentional sandbox task failure");' });
    if (step === 1) {
      assert.equal(latest.status, 'error');
      assert.match(latest.error.message, /intentional sandbox task failure/);
      return toolCall('call_task09_recover', 'node_execute', { source: 'return { recovered: true };' });
    }
    assert.equal(latest.result.result.recovered, true);
    return terminal(taskId, '失敗 evidence 已回饋並完成修正。');
  }
  throw new Error(`Unexpected fixture task: ${taskId}`);
}

const server = createServer(async (request, response) => {
  try {
    if (request.url === '/fixture.html') {
      const fixture = (await readFile(fixturePath, 'utf8')).replaceAll('BlankSeed Fixture', 'Fixture Page');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(fixture);
      return;
    }
    if (request.url === '/v1/chat/completions' && request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(request.headers.authorization, undefined, 'Loopback fixture received an Authorization header.');
      assert(body.messages[0]?.content?.includes('BlankSeed operational context JSON'));
      modelRequests.push({
        taskId: taskIdFromBody(body),
        toolNames: (body.tools || []).map((entry) => entry.function?.name).filter(Boolean),
        messageCount: body.messages.length
      });
      const responsePayload = JSON.stringify({ choices: [{ message: scenarioResponse(body) }] });
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(responsePayload);
      return;
    }
    response.writeHead(404);
    response.end();
  } catch (error) {
    if (!response.headersSent) {
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: { message: error.message } }));
    } else {
      response.destroy(error);
    }
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});
const serverOrigin = `http://127.0.0.1:${server.address().port}`;
const fixtureUrl = `${serverOrigin}/fixture.html`;
const cdpPort = await allocateLoopbackPort();
let launch = null;
let summary = null;

try {
  launch = await launchElectron(cdpPort, `${serverOrigin}/v1/chat/completions`);
  const result = await evaluate(launch.cdp, `
    (async () => {
      const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
      const waitUntil = async (predicate, label, timeoutMs = 15000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const value = predicate();
          if (value) return value;
          await sleep(100);
        }
        throw new Error('Timed out waiting for ' + label);
      };
      await waitUntil(() => window.blankseedConsoleReady, 'console readiness');
      await window.blankseed.target.navigate(${JSON.stringify(fixtureUrl)}, { requestId: 'req_sandbox_suite_nav' });
      await sleep(400);
      const status = await window.blankseed.status.get({ requestId: 'req_sandbox_suite_status' });
      const tasks = ${JSON.stringify(tasks.slice(0, 9))};
      const results = [];
      for (const task of tasks) {
        const run = await window.blankseed.evolution.run([{
          role: 'user',
          content: '[' + task.id + '] ' + task.title + '\\n' + task.prompt
        }], {
          requestId: 'req_sandbox_' + task.id.toLowerCase().replace('-', '_'),
          adapter: 'local.openai-compatible',
          timeoutMs: 10000,
          maxTurns: 8,
          maxActions: 8
        });
        results.push({
          id: task.id,
          title: task.title,
          status: run.status,
          evolutionRunId: run.evolutionRunId,
          checkpointId: run.checkpointId,
          evidencePath: run.evidencePath,
          metrics: run.metrics,
          output: run.output?.content || null,
          error: run.error
        });
      }
      const beforeGovernance = await window.blankseed.modules.list({ requestId: 'req_task10_modules_before' });
      const task10 = ${JSON.stringify(tasks[9])};
      const governed = await window.blankseed.multiAgent.run('[' + task10.id + '] ' + task10.title + '\\n' + task10.prompt, {
        proposerAdapter: 'local.openai-compatible',
        reviewerAdapter: 'local.openai-compatible',
        activation: { id: ${JSON.stringify(moduleId)}, version: '1.1.0' },
        autoApply: true,
        maxTurns: 4,
        maxActions: 4,
        options: { reasoningEffort: 'medium' }
      }, { requestId: 'req_task10_governed_auto_apply' });
      const verified = await window.blankseed.modules.invoke(${JSON.stringify(moduleId)}, {
        requestId: 'req_task10_invoke',
        environment: { value: 40 },
        timeoutMs: 5000
      });
      const modules = await window.blankseed.modules.list({ requestId: 'req_sandbox_suite_modules_after' });
      const runtimeStop = await window.blankseed.utility.stop({ requestId: 'req_sandbox_suite_stop' });
      const events = await window.blankseed.events.tail({ limit: 100 });
      return {
        sessionId: status.sessionId,
        sandboxProfile: status.config.sandboxAgentAutoApply,
        results,
        task10: {
          id: task10.id,
          title: task10.title,
          status: governed.status,
          multiAgentRunId: governed.multiAgentRunId,
          evidencePath: governed.evidencePath,
          decision: governed.decision,
          autoApply: governed.autoApply,
          error: governed.error,
          invoke: verified
        },
        moduleState: {
          beforeGovernance,
          after: modules
        },
        runtimeStop,
        relevantEvents: events.filter((event) =>
          event.type.startsWith('multi_agent.')
          || event.type.startsWith('governance.')
          || event.type.startsWith('module.activation')
        )
      };
    })()
  `);
  launch.cdp.close();
  await closeElectron(launch);
  launch = null;

  assert.equal(result.sandboxProfile.enabled, true);
  assert.equal(result.sandboxProfile.isolationClaims.securitySandbox, false);
  assert.equal(result.results.length, 9);
  for (const taskResult of result.results) {
    assert.equal(taskResult.status, 'ok', `${taskResult.id} failed: ${JSON.stringify(taskResult.error)}`);
    assert(existsSync(taskResult.evidencePath), `${taskResult.id} evidence is missing.`);
    assert.match(taskResult.output, new RegExp(`^${taskResult.id} PASS`));
  }
  const task09 = result.results.find((entry) => entry.id === 'TASK-09');
  assert.equal(task09.metrics.failedActions, 1);
  assert.equal(result.moduleState.beforeGovernance.active[moduleId], '1.0.0');
  assert.equal(result.task10.status, 'ok');
  assert.equal(result.task10.decision.status, 'applied');
  assert.equal(result.task10.decision.authority.kind, 'agent-sandbox-policy');
  assert.equal(result.task10.autoApply.result.status, 'applied');
  assert.equal(result.moduleState.after.active[moduleId], '1.1.0');
  assert.equal(result.task10.invoke.status, 'ok');
  assert.deepEqual(result.task10.invoke.result, { version: '1.1.0', value: 42 });
  assert.equal(result.runtimeStop.remaining, 0);
  assert.equal(modelRequests.length, 26);

  const archiveName = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveRoot = resolve(cwd, 'workspace/state/sandbox-ten-task-evidence', archiveName);
  await mkdir(archiveRoot, { recursive: true });
  await cp(workspaceRoot, join(archiveRoot, 'workspace'), { recursive: true });
  await cp(dataRoot, join(archiveRoot, 'data'), { recursive: true });
  summary = {
    schema: taskSuite.schema,
    executedAt: new Date().toISOString(),
    fixtureUrl,
    taskSuitePath,
    archiveRoot,
    modelRequestCount: modelRequests.length,
    tasks: [
      ...result.results.map((entry) => ({
        id: entry.id,
        title: entry.title,
        status: entry.status,
        evolutionRunId: entry.evolutionRunId,
        checkpointId: entry.checkpointId,
        metrics: entry.metrics,
        output: entry.output
      })),
      {
        id: result.task10.id,
        title: result.task10.title,
        status: result.task10.status,
        multiAgentRunId: result.task10.multiAgentRunId,
        governanceDecisionId: result.task10.decision.decisionId,
        decisionStatus: result.task10.decision.status,
        authorityKind: result.task10.decision.authority.kind,
        safetyCheckpointId: result.task10.decision.safetyCheckpointId,
        invokeResult: result.task10.invoke.result
      }
    ],
    sandboxProfile: result.sandboxProfile,
    finalActiveModules: result.moduleState.after.active,
    runtimeRemaining: result.runtimeStop.remaining,
    relevantEventCount: result.relevantEvents.length,
    cleanup: {
      ownedElectronClosed: true,
      temporaryRuntimeRemoved: true,
      archivedWorkspaceAndData: true,
      cdpPort
    }
  };
  await writeFile(join(archiveRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  completed = true;
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (launch) {
    launch.cdp.close();
    await closeElectron(launch);
  }
  server.closeAllConnections();
  await new Promise((resolveClose) => server.close(resolveClose));
  if (completed) await rm(temporaryRoot, { recursive: true, force: true });
  else console.error(`Sandbox ten-task evidence preserved at: ${temporaryRoot}`);
}
