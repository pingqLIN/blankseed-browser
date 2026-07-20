'use strict';

const $ = (id) => document.getElementById(id);
const result = $('result');
const timeline = $('timeline');
const agentTask = $('agent-task');

const moduleStatusLabels = Object.freeze({
  candidate: '候選',
  tested: '已測試',
  committed: '已提交'
});

const state = {
  activeTab: 'page',
  events: [],
  checkpoints: [],
  modules: { active: {}, modules: [], candidates: [] },
  status: null,
  agent: { running: false, evolutionRunId: null, label: 'Agent 待命。', status: 'idle' },
  agentMessages: [],
  multiAgent: { running: false, multiAgentRunId: null, decisionId: null, label: 'Multi-Agent 待命。', status: 'idle' },
  stop: { state: 'idle', label: '待命' }
};

function requestId(label) {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`.replace(/[^A-Za-z0-9_-]/g, '_');
  return `req_ui_${label}_${suffix}`;
}

function short(value, length = 10) {
  if (!value) return '無';
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
  await Promise.all([refreshStatus(), refreshModules(), refreshCheckpoints(), refreshEvents()]);
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

async function refreshCheckpoints() {
  try {
    state.checkpoints = await window.blankseed.checkpoint.list();
  } catch {
    state.checkpoints = [];
  }
}

function renderAll() {
  renderStatus();
  renderStopState();
  renderModules();
  renderAgent();
  renderAgentMessages();
  renderCheckpoints();
  renderTimeline();
}

function addAgentMessage(role, content, { label, detail, status = 'ok' } = {}) {
  const text = typeof content === 'string' ? content.trim() : JSON.stringify(content, null, 2);
  if (!text) return;
  state.agentMessages.push({
    id: `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    role,
    label: label || role,
    content: text,
    detail: detail || '',
    status,
    timestamp: new Date().toISOString()
  });
  state.agentMessages = state.agentMessages.slice(-100);
  renderAgentMessages({ scrollToEnd: true });
}

function renderAgentMessages({ scrollToEnd = false } = {}) {
  const messages = $('agent-messages');
  messages.replaceChildren();
  if (state.agentMessages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'agent-message-empty';
    empty.append(
      makeText('strong', '尚無 Agent 訊息'),
      makeText('span', '在下方輸入指令；Agent 回覆與 Governed Review 會集中顯示在這裡。')
    );
    messages.append(empty);
    return;
  }
  for (const message of state.agentMessages) {
    const row = document.createElement('article');
    row.className = `agent-message ${message.role} ${message.status === 'error' ? 'error' : ''}`;
    const role = document.createElement('div');
    role.className = 'message-role';
    role.append(makeText('strong', message.label));
    const content = document.createElement('div');
    content.className = 'message-content';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.append(
      makeText('span', message.detail || 'BlankSeed Runtime'),
      makeText('time', formatTime(message.timestamp))
    );
    const body = makeText('p', message.content);
    body.className = 'message-body';
    content.append(meta, body);
    row.append(role, content);
    messages.append(row);
  }
  if (scrollToEnd) messages.scrollTop = messages.scrollHeight;
}

function updateRunStatus(element, label, status) {
  element.className = `run-status ${status || 'idle'}`;
  const labelElement = element.querySelector('span:last-child');
  if (labelElement) labelElement.textContent = label;
}

function updateTaskCount() {
  $('agent-task-count').textContent = `${agentTask.value.length} / ${agentTask.maxLength}`;
}

function renderAgent() {
  const catalog = Array.isArray(state.status?.modelAdapters) ? state.status.modelAdapters : [];
  const defaults = new Map([
    ['agent-adapter', 'openai.gpt-5.6-terra'],
    ['reviewer-adapter', 'openai.gpt-5.6-sol']
  ]);
  for (const select of [$('agent-adapter'), $('reviewer-adapter')]) {
    const selected = select.value;
    select.replaceChildren();
    for (const adapter of catalog) {
      const option = document.createElement('option');
      option.value = adapter.id;
      option.textContent = `${adapter.label} · ${adapter.model || adapter.id}`;
      option.disabled = adapter.available === false;
      select.append(option);
    }
    if ([...select.options].some((option) => option.value === selected && !option.disabled)) {
      select.value = selected;
    } else {
      const preferred = [...select.options].find((option) => option.value === defaults.get(select.id) && !option.disabled);
      const fallback = [...select.options].find((option) => !option.disabled);
      if (preferred || fallback) select.value = (preferred || fallback).value;
    }
  }
  $('agent-run').disabled = state.agent.running || !$('agent-adapter').selectedOptions[0] || $('agent-adapter').selectedOptions[0].disabled;
  $('agent-cancel').disabled = !state.agent.running;
  updateRunStatus($('agent-run-status'), state.agent.label, state.agent.status);
  $('multi-agent-run').disabled = state.multiAgent.running
    || !$('agent-adapter').selectedOptions[0]
    || $('agent-adapter').selectedOptions[0].disabled
    || !$('reviewer-adapter').selectedOptions[0]
    || $('reviewer-adapter').selectedOptions[0].disabled;
  $('multi-agent-cancel').disabled = !state.multiAgent.running;
  $('governance-apply').disabled = !state.multiAgent.decisionId && !$('governance-decision-id').value.trim();
  updateRunStatus($('multi-agent-status'), state.multiAgent.label, state.multiAgent.status);
  updateTaskCount();
}

function renderStatus() {
  const status = state.status || {};
  const activeCount = Object.keys(state.modules.active || {}).length;
  $('stat-session').textContent = short(status.sessionId, 14);
  $('stat-target').textContent = status.target?.documentGeneration === undefined
    ? '尚無 Target'
    : `t${status.target.targetId}/g${status.target.documentGeneration}`;
  $('stat-runtime').textContent = status.config?.generatedNodeRuntimeEnabled ? 'Node 已啟用' : 'Node 未啟用';
  $('stat-modules').textContent = `${activeCount} 個啟用`;
  const compactTarget = $('console-target-state');
  compactTarget.textContent = status.target?.title || status.target?.url || '尚無 Target';
  compactTarget.parentElement.classList.toggle('connected', Boolean(status.target?.url));
  $('target-summary').textContent = status.target?.url
    ? `${status.target.url} | ${status.target.title || '無標題'}`
    : status.error || '等待 Target';
}

function renderStopState() {
  const nodeEvents = state.events.filter((event) => event.type?.startsWith('node.runtime.stop'));
  const latest = nodeEvents.at(-1);
  if (latest?.type === 'node.runtime.stop.requested') state.stop = { state: 'requested', label: '已要求停止' };
  if (latest?.type === 'node.runtime.stop.confirmed') state.stop = { state: 'confirmed', label: `已確認 / 剩餘 ${latest.data?.remaining ?? 0}` };
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
    browser.textContent = '尚無模組。';
    return;
  }

  for (const manifest of committed) {
    const isActive = active[manifest.id] === manifest.version;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'browser-row';
    if (isActive) row.classList.add('active-row');
    row.addEventListener('click', () => fillModule(manifest));
    row.append(
      makeText('strong', `${manifest.id}@${manifest.version}`),
      makeText('span', isActive ? '已啟用' : moduleStatusLabel(manifest.status)),
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
      makeText('span', moduleStatusLabel(manifest.status)),
      makeText('small', manifest.candidateId)
    );
    browser.append(row);
  }
}

function moduleStatusLabel(status) {
  return moduleStatusLabels[status] || status || '未知';
}

function fillModule(manifest) {
  $('module-id').value = manifest.id || '';
  $('module-version').value = manifest.version || '';
  $('module-description').value = manifest.description || '';
}

function renderCheckpoints() {
  const browser = $('checkpoint-browser');
  browser.replaceChildren();
  const checkpoints = state.checkpoints.slice(0, 8);
  if (checkpoints.length === 0) {
    browser.textContent = '尚無 Checkpoint。';
    return;
  }
  for (const checkpoint of checkpoints) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'browser-row';
    row.disabled = checkpoint.restorable === false;
    row.addEventListener('click', () => { $('checkpoint-id').value = checkpoint.id; });
    row.append(
      makeText('strong', checkpoint.label || 'checkpoint'),
      makeText('span', short(checkpoint.id, 18)),
      makeText('small', `${checkpoint.schema}${checkpoint.restorable ? '' : ' · capture only'}`)
    );
    browser.append(row);
  }
}

function renderTimeline() {
  timeline.replaceChildren();
  const rows = state.events.slice(-80).reverse();
  if (rows.length === 0) {
    timeline.textContent = '尚無事件。';
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
  document.body.classList.toggle('agent-mode', tab === 'agent');
  for (const button of document.querySelectorAll('.tab')) {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }
  for (const panel of document.querySelectorAll('.tab-panel')) {
    const isActive = panel.id === `tab-${tab}`;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  }
}

function moduleManifest() {
  return {
    id: $('module-id').value.trim(),
    version: $('module-version').value.trim(),
    description: $('module-description').value.trim() || '生成的 capability',
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
  button.addEventListener('keydown', (event) => {
    const tabs = [...document.querySelectorAll('.tab')];
    const currentIndex = tabs.indexOf(button);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === currentIndex) return;
    event.preventDefault();
    setTab(tabs[nextIndex].dataset.tab);
    tabs[nextIndex].focus();
  });
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
$('checkpoint-restore').addEventListener('click', () => {
  const checkpointId = $('checkpoint-id').value.trim();
  if (!checkpointId) {
    showError({ code: 'INVALID_REQUEST', message: '請先選擇 Checkpoint。' });
    return;
  }
  if (!window.confirm('Restore 只會還原 committed Module 的 active mapping；不會還原頁面、儲存空間、設定、credential 或 external side effects。確定繼續？')) return;
  run(() => window.blankseed.checkpoint.restore(checkpointId, {
    requestId: requestId('checkpoint_restore'),
    confirmed: true
  }));
});
$('utility-ping').addEventListener('click', () => run(() => window.blankseed.utility.ping({ requestId: requestId('ping') })));
$('utility-execute').addEventListener('click', () => run(() => window.blankseed.utility.execute($('utility-source').value, { requestId: requestId('node') })));
$('utility-stop').addEventListener('click', () => run(() => window.blankseed.utility.stop({ requestId: requestId('node_stop') })));
$('stop-all').addEventListener('click', () => run(async () => {
  state.stop = { state: 'requested', label: '已要求停止' };
  renderStopState();
  const [evolution, multiAgent, executions, runtime, model] = await Promise.all([
    window.blankseed.evolution.cancel(null, { requestId: requestId('stop_evolution') }),
    window.blankseed.multiAgent.cancel(null, { requestId: requestId('stop_multi_agent') }),
    window.blankseed.execution.cancel(null, { requestId: requestId('stop_execution') }),
    window.blankseed.utility.stop({ requestId: requestId('stop_runtime') }),
    window.blankseed.model.cancel({ requestId: requestId('stop_model') })
  ]);
  const remaining = Number(runtime.remaining || 0) + Number(executions.remaining || 0);
  state.stop = { state: 'confirmed', label: `已確認 / 剩餘 ${remaining}` };
  return { evolution, multiAgent, executions, runtime, model, remaining };
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
$('agent-run').addEventListener('click', async () => {
  const task = agentTask.value.trim();
  if (!task) {
    showError({ code: 'INVALID_REQUEST', message: 'Task 任務不得為空。' });
    return;
  }
  addAgentMessage('user', task, { label: 'USER', detail: '使用者指令' });
  state.agent = { running: true, evolutionRunId: null, label: 'Agent Run 執行中…', status: 'running' };
  renderAgent();
  try {
    const value = await window.blankseed.evolution.run([{ role: 'user', content: task }], {
      requestId: requestId('agent_run'),
      adapter: $('agent-adapter').value,
      maxTurns: Number($('agent-max-turns').value),
      maxActions: Number($('agent-max-actions').value),
      options: { reasoningEffort: $('agent-reasoning').value }
    });
    state.agent = {
      running: false,
      evolutionRunId: value.evolutionRunId || null,
      label: `Agent Run ${value.status === 'ok' ? '已完成' : '已停止'} · ${short(value.evolutionRunId, 18)}`,
      status: value.status === 'ok' ? 'success' : 'error'
    };
    const output = value.output?.content || value.error?.message || `Agent Run ${value.status === 'ok' ? '已完成。' : '未完成。'}`;
    addAgentMessage('agent', output, {
      label: 'AGENT',
      detail: `Turns ${value.metrics?.turns ?? 0} · Actions ${value.metrics?.actions ?? 0}`,
      status: value.status === 'ok' ? 'ok' : 'error'
    });
    show(value);
  } catch (error) {
    state.agent = { running: false, evolutionRunId: null, label: `Agent Run 失敗：${error.message}`, status: 'error' };
    addAgentMessage('agent', error.message, { label: 'AGENT', detail: '執行失敗', status: 'error' });
    showError(error);
  }
  await refreshAll();
});
$('agent-cancel').addEventListener('click', () => run(async () => {
  const value = await window.blankseed.evolution.cancel(state.agent.evolutionRunId, { requestId: requestId('agent_cancel') });
  state.agent = { running: false, evolutionRunId: null, label: `已要求取消 Agent Run · ${value.cancelled || 0}`, status: 'idle' };
  return value;
}));
$('multi-agent-run').addEventListener('click', async () => {
  const task = agentTask.value.trim();
  if (!task) {
    showError({ code: 'INVALID_REQUEST', message: 'Task 任務不得為空。' });
    return;
  }
  const moduleId = $('governance-module-id').value.trim();
  const version = $('governance-module-version').value.trim();
  addAgentMessage('user', task, { label: 'USER', detail: 'Governed Review 指令' });
  state.multiAgent = { running: true, multiAgentRunId: null, decisionId: null, label: 'Multi-Agent Review 執行中…', status: 'running' };
  renderAgent();
  try {
    const value = await window.blankseed.multiAgent.run(task, {
      proposerAdapter: $('agent-adapter').value,
      reviewerAdapter: $('reviewer-adapter').value,
      activation: moduleId || version ? { id: moduleId, version } : null,
      maxTurns: Number($('agent-max-turns').value),
      maxActions: Number($('agent-max-actions').value),
      options: { reasoningEffort: $('agent-reasoning').value }
    }, { requestId: requestId('multi_agent_run') });
    const decisionId = value.decision?.decisionId || null;
    if (decisionId) $('governance-decision-id').value = decisionId;
    state.multiAgent = {
      running: false,
      multiAgentRunId: value.multiAgentRunId || null,
      decisionId,
      label: value.status === 'ok'
        ? `Governed Review 已完成 · ${value.decision.review.verdict} · ${short(decisionId, 18)}`
        : `Multi-Agent Review 失敗：${value.error?.message || 'unknown'}`,
      status: value.status === 'ok' ? 'success' : 'error'
    };
    if (value.status === 'ok') {
      addAgentMessage('agent', value.decision.proposal.content, {
        label: 'PROPOSER',
        detail: short(value.decision.proposal.evolutionRunId, 22)
      });
      addAgentMessage('reviewer', value.decision.review.reason, {
        label: 'REVIEWER',
        detail: `${value.decision.review.verdict.toUpperCase()} · ${short(decisionId, 20)}`
      });
    } else {
      addAgentMessage('reviewer', value.error?.message || 'Governed Review 未完成。', {
        label: 'REVIEWER',
        detail: 'Review 失敗',
        status: 'error'
      });
    }
    show(value);
  } catch (error) {
    state.multiAgent = { running: false, multiAgentRunId: null, decisionId: null, label: `Multi-Agent Review 失敗：${error.message}`, status: 'error' };
    addAgentMessage('reviewer', error.message, { label: 'REVIEWER', detail: 'Review 失敗', status: 'error' });
    showError(error);
  }
  await refreshAll();
});
$('multi-agent-cancel').addEventListener('click', () => run(async () => {
  const value = await window.blankseed.multiAgent.cancel(state.multiAgent.multiAgentRunId, { requestId: requestId('multi_agent_cancel') });
  state.multiAgent = { running: false, multiAgentRunId: null, decisionId: state.multiAgent.decisionId, label: `已要求取消 Multi-Agent Run · ${value.cancelled || 0}`, status: 'idle' };
  return value;
}));
$('governance-apply').addEventListener('click', () => {
  const decisionId = $('governance-decision-id').value.trim();
  if (!decisionId) {
    showError({ code: 'INVALID_REQUEST', message: '請先完成或選擇 Governance Decision。' });
    return;
  }
  if (!window.confirm('Apply 會依已審查的 immutable evidence Activate 指定 committed Module version。確定繼續？')) return;
  run(async () => {
    const value = await window.blankseed.multiAgent.apply(decisionId, {
      requestId: requestId('governance_apply'),
      confirmed: true
    });
    state.multiAgent = { running: false, multiAgentRunId: value.multiAgentRunId, decisionId, label: `Governance Decision 已套用 · ${short(decisionId, 18)}`, status: 'success' };
    addAgentMessage('governance', `Decision ${decisionId} 已由使用者確認並套用。`, {
      label: 'GOVERNANCE',
      detail: short(value.multiAgentRunId, 22)
    });
    return value;
  });
});
$('governance-decision-id').addEventListener('input', () => {
  $('governance-apply').disabled = !$('governance-decision-id').value.trim();
});
$('refresh-events').addEventListener('click', () => refreshAll());
$('clear-result').addEventListener('click', () => { result.textContent = '已就緒。'; });
$('agent-clear-messages').addEventListener('click', () => {
  state.agentMessages = [];
  renderAgentMessages();
});
agentTask.addEventListener('input', updateTaskCount);
agentTask.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    if (!$('agent-run').disabled) $('agent-run').click();
  }
});

window.blankseed.events.subscribe(() => {
  refreshEvents().then(renderAll);
});
window.blankseedConsole = { refreshAll, setTab };
window.blankseedConsoleReady = true;
refreshAll();
