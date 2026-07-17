'use strict';

const $ = (id) => document.getElementById(id);
const result = $('result');
const timeline = $('timeline');

const state = {
  activeTab: 'page',
  events: [],
  modules: { active: {}, modules: [], candidates: [] },
  status: null,
  stop: { state: 'idle', label: 'idle' }
};

function requestId(label) {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`.replace(/[^A-Za-z0-9_-]/g, '_');
  return `req_ui_${label}_${suffix}`;
}

function short(value, length = 10) {
  if (!value) return 'none';
  const text = String(value);
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function show(value) {
  result.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function showError(error) {
  show({
    error: {
      code: error?.code || 'ERROR',
      name: error?.name || 'Error',
      message: error?.message || String(error),
      stack: error?.stack || null,
      details: error?.details || {}
    }
  });
}

async function run(operation, { skipRefresh = false } = {}) {
  try {
    show(await operation());
  } catch (error) {
    showError(error);
  }
  if (!skipRefresh) await refreshAll();
}

async function refreshAll() {
  await Promise.all([refreshStatus(), refreshModules(), refreshEvents()]);
  renderAll();
}

async function refreshStatus() {
  try {
    state.status = await window.blankseed.status.get();
    if (state.status.target?.url) $('url').value = state.status.target.url;
  } catch (error) {
    state.status = { error: error.message };
  }
}

async function refreshModules() {
  try {
    state.modules = await window.blankseed.modules.list();
  } catch {
    state.modules = { active: {}, modules: [], candidates: [] };
  }
}

async function refreshEvents() {
  try {
    state.events = await window.blankseed.events.tail();
  } catch (error) {
    state.events = [{ type: 'events.failed', timestamp: new Date().toISOString(), data: { message: error.message } }];
  }
}

function renderAll() {
  renderStatus();
  renderStopState();
  renderModules();
  renderCheckpoints();
  renderTimeline();
}

function renderStatus() {
  const status = state.status || {};
  const activeCount = Object.keys(state.modules.active || {}).length;
  $('stat-session').textContent = short(status.sessionId, 14);
  $('stat-target').textContent = status.target?.documentGeneration === undefined
    ? 'no target'
    : `t${status.target.targetId}/g${status.target.documentGeneration}`;
  $('stat-runtime').textContent = status.config?.generatedNodeRuntimeEnabled ? 'node on' : 'node off';
  $('stat-modules').textContent = `${activeCount} active`;
  $('target-summary').textContent = status.target?.url
    ? `${status.target.url} | ${status.target.title || 'untitled'}`
    : status.error || 'waiting for target';
}

function renderStopState() {
  const nodeEvents = state.events.filter((event) => event.type?.startsWith('node.runtime.stop'));
  const latest = nodeEvents.at(-1);
  if (latest?.type === 'node.runtime.stop.requested') state.stop = { state: 'requested', label: 'requested' };
  if (latest?.type === 'node.runtime.stop.confirmed') state.stop = { state: 'confirmed', label: `confirmed / remaining ${latest.data?.remaining ?? 0}` };
  const el = $('stop-state');
  el.className = `stop-state ${state.stop.state}`;
  el.querySelector('strong').textContent = state.stop.label;
}

function renderModules() {
  const browser = $('module-browser');
  browser.replaceChildren();
  const active = state.modules.active || {};
  const committed = state.modules.modules || [];
  const candidates = state.modules.candidates || [];

  if (committed.length === 0 && candidates.length === 0) {
    browser.textContent = 'No modules.';
    return;
  }

  for (const manifest of committed) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'browser-row';
    if (active[manifest.id] === manifest.version) row.classList.add('active-row');
    row.addEventListener('click', () => fillModule(manifest));
    row.append(
      makeText('strong', `${manifest.id}@${manifest.version}`),
      makeText('span', active[manifest.id] === manifest.version ? 'active' : manifest.status),
      makeText('small', manifest.sourceHash)
    );
    browser.append(row);
  }

  for (const manifest of candidates) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'browser-row candidate-row';
    row.addEventListener('click', () => {
      fillModule(manifest);
      $('module-candidate').value = manifest.candidateId;
    });
    row.append(
      makeText('strong', `${manifest.id}@${manifest.version}`),
      makeText('span', manifest.status),
      makeText('small', manifest.candidateId)
    );
    browser.append(row);
  }
}

function fillModule(manifest) {
  $('module-id').value = manifest.id || '';
  $('module-version').value = manifest.version || '';
  $('module-description').value = manifest.description || '';
}

function renderCheckpoints() {
  const browser = $('checkpoint-browser');
  browser.replaceChildren();
  const checkpoints = state.events.filter((event) => event.type === 'checkpoint.created').slice(-8).reverse();
  if (checkpoints.length === 0) {
    browser.textContent = 'No checkpoints.';
    return;
  }
  for (const event of checkpoints) {
    const row = document.createElement('div');
    row.className = 'browser-row';
    row.append(
      makeText('strong', event.data?.label || 'checkpoint'),
      makeText('span', short(event.data?.id, 14)),
      makeText('small', `#${event.sequence}`)
    );
    browser.append(row);
  }
}

function renderTimeline() {
  timeline.replaceChildren();
  const rows = state.events.slice(-80).reverse();
  if (rows.length === 0) {
    timeline.textContent = 'No events.';
    return;
  }
  for (const event of rows) {
    const row = document.createElement('div');
    row.className = `timeline-row ${eventClass(event.type)}`;
    row.append(
      makeText('time', formatTime(event.timestamp)),
      makeText('strong', event.type || 'event'),
      makeText('span', event.requestId ? short(event.requestId, 18) : `#${event.sequence}`),
      makeText('small', summarizeEvent(event))
    );
    timeline.append(row);
  }
}

function eventClass(type = '') {
  if (/failed|timeout|error|gone|unresponsive/i.test(type)) return 'danger';
  if (/rollback|kill|stop|cancel/i.test(type)) return 'warn';
  if (/completed|committed|activated|created/i.test(type)) return 'ok';
  return 'neutral';
}

function summarizeEvent(event) {
  const data = event.data || {};
  if (data.moduleId) return `${data.moduleId}${data.version ? ` @ ${data.version}` : ''}`;
  if (data.channel) return data.channel;
  if (data.sourceHash) return data.sourceHash;
  if (data.error?.code) return `${data.error.code}: ${data.error.message}`;
  if (data.url) return data.url;
  return JSON.stringify(data).slice(0, 160);
}

function formatTime(value) {
  if (!value) return '--:--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString('zh-TW', { hour12: false });
}

function makeText(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text ?? '';
  return el;
}

function setTab(tab) {
  state.activeTab = tab;
  for (const button of document.querySelectorAll('.tab')) {
    button.classList.toggle('active', button.dataset.tab === tab);
  }
  for (const panel of document.querySelectorAll('.tab-panel')) {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  }
}

function moduleManifest() {
  return {
    id: $('module-id').value.trim(),
    version: $('module-version').value.trim(),
    description: $('module-description').value.trim() || 'Generated capability',
    entry: 'index.cjs',
    runtime: 'node',
    provenance: {
      sessionId: state.status?.sessionId || null,
      executionIds: [],
      checkpointId: null,
      model: null
    },
    dependencies: {},
    tests: []
  };
}

function moduleEnvironment() {
  return JSON.parse($('module-env').value || '{}');
}

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => setTab(button.dataset.tab));
});

$('refresh-all').addEventListener('click', () => refreshAll());
$('navigate-form').addEventListener('submit', (event) => {
  event.preventDefault();
  run(() => window.blankseed.target.navigate($('url').value, { requestId: requestId('nav') }));
});
$('back').addEventListener('click', () => run(() => window.blankseed.target.back({ requestId: requestId('back') })));
$('forward').addEventListener('click', () => run(() => window.blankseed.target.forward({ requestId: requestId('forward') })));
$('reload').addEventListener('click', () => run(() => window.blankseed.target.reload({ requestId: requestId('reload') })));
$('snapshot').addEventListener('click', () => run(() => window.blankseed.target.snapshot({ requestId: requestId('snapshot') })));
$('execute-page').addEventListener('click', () => run(() => window.blankseed.page.execute($('page-source').value, { requestId: requestId('page') })));
$('send-cdp').addEventListener('click', () => run(() => {
  const params = JSON.parse($('cdp-params').value || '{}');
  return window.blankseed.cdp.send($('cdp-method').value, params, { requestId: requestId('cdp') });
}));
$('checkpoint').addEventListener('click', () => run(() => window.blankseed.checkpoint.create($('checkpoint-label').value, { requestId: requestId('checkpoint') })));
$('utility-ping').addEventListener('click', () => run(() => window.blankseed.utility.ping({ requestId: requestId('ping') })));
$('utility-execute').addEventListener('click', () => run(() => window.blankseed.utility.execute($('utility-source').value, { requestId: requestId('node') })));
$('utility-stop').addEventListener('click', () => run(() => window.blankseed.utility.stop({ requestId: requestId('node_stop') })));
$('stop-all').addEventListener('click', () => run(async () => {
  state.stop = { state: 'requested', label: 'requested' };
  renderStopState();
  const [evolution, executions, runtime, model] = await Promise.all([
    window.blankseed.evolution.cancel(null, { requestId: requestId('stop_evolution') }),
    window.blankseed.execution.cancel(null, { requestId: requestId('stop_execution') }),
    window.blankseed.utility.stop({ requestId: requestId('stop_runtime') }),
    window.blankseed.model.cancel({ requestId: requestId('stop_model') })
  ]);
  const remaining = Number(runtime.remaining || 0) + Number(executions.remaining || 0);
  state.stop = { state: 'confirmed', label: `confirmed / remaining ${remaining}` };
  return { evolution, executions, runtime, model, remaining };
}));
$('module-refresh').addEventListener('click', () => run(() => window.blankseed.modules.list(), { skipRefresh: false }));
$('module-create').addEventListener('click', () => run(async () => {
  const value = await window.blankseed.modules.createCandidate(moduleManifest(), $('module-source').value, { requestId: requestId('module_candidate') });
  $('module-candidate').value = value.candidateId;
  return value;
}));
$('module-test').addEventListener('click', () => run(() => window.blankseed.modules.testCandidate($('module-candidate').value, { requestId: requestId('module_test') })));
$('module-commit').addEventListener('click', () => run(() => window.blankseed.modules.commitCandidate($('module-candidate').value, { requestId: requestId('module_commit') })));
$('module-activate').addEventListener('click', () => run(() => window.blankseed.modules.activate($('module-id').value, $('module-version').value, { requestId: requestId('module_activate') })));
$('module-invoke').addEventListener('click', () => run(() => window.blankseed.modules.invoke($('module-id').value, {
  requestId: requestId('module_invoke'),
  environment: moduleEnvironment(),
  timeoutMs: 5000
})));
$('module-rollback').addEventListener('click', () => run(() => window.blankseed.modules.rollback($('module-id').value, $('module-version').value, { requestId: requestId('module_rollback') })));
$('refresh-events').addEventListener('click', () => refreshAll());
$('clear-result').addEventListener('click', () => { result.textContent = 'Ready.'; });

window.blankseed.events.subscribe(() => {
  refreshEvents().then(renderAll);
});
window.blankseedConsole = { refreshAll, setTab };
window.blankseedConsoleReady = true;
refreshAll();
