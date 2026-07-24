import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const starterRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(starterRoot, '..');
const electronPath = resolve(starterRoot, 'node_modules/electron/dist/electron.exe');
const cdpPort = Number(process.env.BLANKSEED_CDP_PORT || 9341);
const moduleId = 'youtube-aopass';
const parentVersion = '1.0.0';
const targetVersion = '1.0.1';
const parentRoot = resolve(starterRoot, 'workspace/modules', moduleId, 'versions', parentVersion);
const parentManifest = JSON.parse(readFileSync(resolve(parentRoot, 'manifest.json'), 'utf8'));
const parentSource = readFileSync(resolve(parentRoot, parentManifest.entry), 'utf8');
const evidencePath = resolve(starterRoot, 'reports/module-runtime-contract-v1.1-governance.json');
const liveUrl = 'https://www.youtube.com/watch?v=Yppak4lbl6Y&t=33s';

function sha256(value) {
  return `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}

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
    const operation = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) operation.reject(new Error(JSON.stringify(message.error)));
    else operation.resolve(message.result);
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
    }
  };
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 120000
  });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}

function migrationSource() {
  const adapter = `

// Module Runtime Contract v1.1 compatibility entry point.
module.exports.execute = async function execute(context) {
  return module.exports.evaluate(
    context.observation,
    context.environment
  );
};
`;
  return `${parentSource.trimEnd()}${adapter}`;
}

const source = migrationSource();
const parentHashBefore = sha256(parentSource);
assert(parentHashBefore === parentManifest.sourceHash, 'youtube-aopass@1.0.0 source hash does not match its manifest.');

const launch = spawn(electronPath, [`--remote-debugging-port=${cdpPort}`, '.'], {
  cwd: starterRoot,
  detached: true,
  stdio: 'ignore',
  windowsHide: true
});
launch.unref();

let cdp = null;
let activated = false;
let result = null;

try {
  const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const control = targets.find((target) => target.url.startsWith('file:///') && target.url.includes('/src/renderer/index.html'));
  assert(control, `Control page target not found on CDP port ${cdpPort}.`);
  cdp = await connect(control.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');

  const payload = {
    moduleId,
    parentVersion,
    targetVersion,
    parentManifest,
    parentHashBefore,
    source,
    sourceHash: sha256(source),
    liveUrl
  };

  result = await evaluate(cdp, `
(async (payload) => {
  const request = (name) => 'req_module_runtime_v11_' + name + '_12345678';
  const beforeList = await window.blankseed.modules.list({ requestId: request('before_list') });
  if (beforeList.active[payload.moduleId] !== payload.parentVersion) {
    throw new Error('Expected youtube-aopass@1.0.0 to be active before migration.');
  }
  if (beforeList.modules.some((entry) => entry.id === payload.moduleId && entry.version === payload.targetVersion)) {
    throw new Error('youtube-aopass@1.0.1 already exists; refusing to replace an immutable version.');
  }

  const status = await window.blankseed.status.get({ requestId: request('status') });
  const manifest = {
    id: payload.moduleId,
    version: payload.targetVersion,
    parentVersion: payload.parentVersion,
    migrationReason: 'runtime contract compatibility',
    description: payload.parentManifest.description,
    entry: payload.parentManifest.entry,
    runtime: payload.parentManifest.runtime,
    provenance: {
      sessionId: status.sessionId,
      executionIds: [],
      checkpointId: payload.parentManifest.provenance?.checkpointId ?? null,
      model: null
    },
    dependencies: payload.parentManifest.dependencies || {},
    tests: ['module-runtime-contract-v1.1']
  };

  const candidate = await window.blankseed.modules.createCandidate(manifest, payload.source, {
    requestId: request('candidate_create')
  });
  const tested = await window.blankseed.modules.testCandidate(candidate.candidateId, {
    requestId: request('candidate_test')
  });
  if (!tested.passed || tested.result?.status !== 'ok' || tested.result?.result == null) {
    throw new Error('Candidate test did not produce a non-null successful result.');
  }

  const checkpoint = await window.blankseed.checkpoint.create('before youtube-aopass 1.0.1 activation', {
    requestId: request('checkpoint')
  });
  const committed = await window.blankseed.modules.commitCandidate(candidate.candidateId, {
    requestId: request('candidate_commit'),
    confirmed: true
  });
  const activation = await window.blankseed.modules.activate(payload.moduleId, payload.targetVersion, {
    requestId: request('activate'),
    confirmed: true
  });

  await window.blankseed.target.navigate(payload.liveUrl, { requestId: request('navigate') });
  await new Promise((resolveWait) => setTimeout(resolveWait, 6000));

  const rawObservationEnvelope = await window.blankseed.cdp.send('Runtime.evaluate', {
    expression: \`(()=>{const v=document.querySelector('video'); const p=document.querySelector('#movie_player'); const skip=[...document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, button')].filter(e=>/skip ad|略過廣告/i.test((e.getAttribute('aria-label')||'')+' '+(e.textContent||''))).map(e=>({tag:e.tagName,visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),disabled:!!e.disabled,aria:e.getAttribute('aria-label'),text:(e.textContent||'').trim()})); return {url:location.href,video:v?{currentTime:v.currentTime,duration:v.duration,paused:v.paused,ended:v.ended,readyState:v.readyState}:null,playerClass:p?.className||null,adShowing:!!p?.classList.contains('ad-showing'),adInterruption:!!p?.classList.contains('ad-interruption'),skip};})()\`,
    returnByValue: true
  }, { requestId: request('cdp_observation'), timeoutMs: 15000 });
  const rawObservation = rawObservationEnvelope.result?.result?.value;
  if (!rawObservation || !String(rawObservation.url || '').startsWith('https://www.youtube.com/')) {
    throw new Error('Live YouTube CDP observation was unavailable.');
  }
  const observation = {
    adShowing: Boolean(rawObservation.adShowing || rawObservation.adInterruption),
    controls: (rawObservation.skip || []).map((control) => ({
      text: control.text || '',
      ariaLabel: control.aria || '',
      visible: control.visible,
      enabled: !control.disabled,
      isSkip: true,
      selector: null
    })),
    countdown: null
  };

  const invocation = await window.blankseed.modules.invoke(payload.moduleId, {
    requestId: request('invoke'),
    environment: { observation },
    timeoutMs: 10000
  });
  if (invocation.status !== 'ok' || invocation.result == null || typeof invocation.result !== 'object') {
    throw new Error('Active youtube-aopass@1.0.1 did not return a structured result.');
  }

  let cdpAction = {
    status: 'not-issued',
    reason: invocation.result.action ? 'proposal-not-actionable' : 'no-action-proposed'
  };
  if (invocation.result.action?.type === 'click-native-skip') {
    const actionEnvelope = await window.blankseed.cdp.send('Runtime.evaluate', {
      expression: \`(()=>{const e=[...document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, button')].find(x=>{const t=((x.getAttribute('aria-label')||'')+' '+(x.textContent||'')).trim();const r=x.getBoundingClientRect();const s=getComputedStyle(x);return /skip ad|略過廣告/i.test(t)&&!x.disabled&&s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0});if(!e)return {clicked:false,reason:'native-skip-unavailable'};e.click();return {clicked:true,control:(e.getAttribute('aria-label')||e.textContent||'').trim()};})()\`,
      returnByValue: true
    }, { requestId: request('cdp_action'), timeoutMs: 10000 });
    cdpAction = {
      status: 'issued',
      result: actionEnvelope.result?.result?.value ?? null
    };
  }

  const afterList = await window.blankseed.modules.list({ requestId: request('after_list') });
  const checkpoints = await window.blankseed.checkpoint.list({ requestId: request('checkpoint_list') });
  const events = await window.blankseed.events.tail();
  return {
    status: 'PASS',
    runtimeSessionId: status.sessionId,
    parent: {
      version: payload.parentVersion,
      sourceHash: payload.parentHashBefore
    },
    candidate: {
      candidateId: candidate.candidateId,
      manifest: candidate.manifest
    },
    test: tested,
    checkpoint: {
      id: checkpoint.id,
      label: checkpoint.label,
      active: checkpoint.state?.modules?.active ?? null,
      listed: checkpoints.some((entry) => entry.id === checkpoint.id)
    },
    committed: {
      moduleId: committed.moduleId,
      version: committed.version,
      manifest: committed.manifest
    },
    activation,
    liveValidation: {
      rawObservation,
      normalizedObservation: observation,
      invocation,
      actionProposal: invocation.result.action,
      cdpAction
    },
    finalActive: afterList.active[payload.moduleId],
    relevantEvents: events
      .filter((event) => event.sessionId === status.sessionId)
      .filter((event) => event.type.startsWith('module.') || event.type.startsWith('cdp.') || event.type === 'checkpoint.created')
      .slice(-40)
  };
})(${JSON.stringify(payload)})
`);
  activated = result?.finalActive === targetVersion;

  const parentHashAfter = sha256(readFileSync(resolve(parentRoot, parentManifest.entry), 'utf8'));
  assert(parentHashAfter === parentHashBefore, 'youtube-aopass@1.0.0 changed during migration.');
  result.parent.sourceHashAfter = parentHashAfter;
  result.targetSourceHash = sha256(source);
  result.evidenceGeneratedAt = new Date().toISOString();
  writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: result.status,
    candidateId: result.candidate.candidateId,
    testPassed: result.test.passed,
    testResult: result.test.result.result,
    checkpointId: result.checkpoint.id,
    committedVersion: result.committed.version,
    sourceHash: result.targetSourceHash,
    activeVersion: result.finalActive,
    liveUrl: result.liveValidation.rawObservation.url,
    liveInvocationResult: result.liveValidation.invocation.result,
    cdpAction: result.liveValidation.cdpAction,
    evidencePath
  }, null, 2));
} catch (error) {
  if (activated && cdp) {
    try {
      await evaluate(cdp, `window.blankseed.modules.rollback(${JSON.stringify(moduleId)}, ${JSON.stringify(parentVersion)}, { requestId: 'req_module_runtime_v11_failure_rollback', confirmed: true })`);
    } catch {
      // The failure report below leaves rollback status explicit if renderer access was lost.
    }
  }
  const failure = {
    status: 'FAIL',
    message: error.message,
    activated,
    rollbackTarget: `${moduleId}@${parentVersion}`,
    evidenceGeneratedAt: new Date().toISOString()
  };
  writeFileSync(evidencePath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  cdp?.close();
}
