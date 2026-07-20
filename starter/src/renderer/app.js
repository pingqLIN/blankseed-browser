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
  multiAgent: { running: false, multiAgentRunId: null, decisionId: null, applyAvailable: false, label: '多代理待命。', status: 'idle' },
  moduleAutomation: {
    running: false,
    label: '自動化流程待命。',
    status: 'idle',
    steps: {}
  },
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
  renderModelConfiguration();
  renderModuleAutomation();
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
      makeText('span', '在下方輸入指令；Agent 回覆與受控審核結果會集中顯示在這裡。')
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
  $('governance-apply').disabled = !state.multiAgent.applyAvailable;
  const sandboxAutoApplyEnabled = state.status?.config?.sandboxAgentAutoApply?.enabled === true;
  $('sandbox-auto-apply').disabled = !sandboxAutoApplyEnabled || state.multiAgent.running;
  $('sandbox-auto-apply-help').textContent = sandboxAutoApplyEnabled
    ? '已啟用：Reviewer 核准後會在暫存 profile 自動套用'
    : '一般 Runtime 維持人工確認';
  updateRunStatus($('multi-agent-status'), state.multiAgent.label, state.multiAgent.status);
  updateTaskCount();
}

function renderModelConfiguration() {
  const configuration = state.status?.modelConfiguration;
  const statusElement = $('model-configuration-status');
  if (!configuration) {
    updateRunStatus(statusElement, '模型設定尚未就緒。', 'error');
    return;
  }

  const endpointInput = $('model-local-endpoint');
  const modelInput = $('model-local-name');
  if (document.activeElement !== endpointInput && endpointInput.dataset.edited !== 'true') {
    endpointInput.value = configuration.local.endpoint;
  }
  if (document.activeElement !== modelInput && modelInput.dataset.edited !== 'true') {
    modelInput.value = configuration.local.model;
  }

  $('model-local-badge').textContent = '已設定';
  const openAI = configuration.openAI;
  const openAIBadge = $('model-openai-badge');
  openAIBadge.classList.toggle('unavailable', !openAI.credentialConfigured);
  openAIBadge.textContent = openAI.credentialConfigured
    ? (openAI.credentialSource === 'session' ? '本次程式已接入' : '環境變數已接入')
    : '尚未接入';
  const configurationLocked = state.agent.running || state.multiAgent.running;
  for (const id of ['model-local-endpoint', 'model-local-name', 'model-openai-key']) {
    $(id).disabled = configurationLocked;
  }
  $('model-local-apply').disabled = configurationLocked;
  $('model-openai-apply').disabled = configurationLocked;
  $('model-openai-clear').disabled = configurationLocked || openAI.credentialSource !== 'session';
  if (configurationLocked) {
    updateRunStatus(statusElement, '模型執行期間無法變更接入設定。', 'running');
  } else if (openAI.credentialConfigured) {
    updateRunStatus(statusElement, `本機模型與 OpenAI 已就緒；OpenAI 金鑰來源：${openAI.credentialSource === 'session' ? '本次程式' : '環境變數'}。`, 'success');
  } else {
    updateRunStatus(statusElement, '本機模型已設定；OpenAI 等待金鑰。', 'idle');
  }
}

function renderModuleAutomation() {
  const locked = state.moduleAutomation.running;
  for (const id of [
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
  ]) {
    $(id).disabled = locked;
  }
  $('module-auto-run').disabled = locked || !$('module-auto-enabled').checked;
  updateRunStatus($('module-auto-status'), state.moduleAutomation.label, state.moduleAutomation.status);
  for (const item of document.querySelectorAll('#module-auto-steps [data-step]')) {
    item.className = state.moduleAutomation.steps[item.dataset.step] || '';
  }
}

function renderStatus() {
  const status = state.status || {};
  const controlPanelWidth = Number(status.config?.controlPanelWidth);
  if (Number.isFinite(controlPanelWidth) && controlPanelWidth >= 320 && controlPanelWidth <= 800) {
    document.documentElement.style.setProperty('--control-panel-width', `${controlPanelWidth}px`);
  }
  const activeCount = Object.keys(state.modules.active || {}).length;
  $('stat-session').textContent = short(status.sessionId, 14);
  $('stat-target').textContent = status.target?.documentGeneration === undefined
    ? '尚無目標頁'
    : `t${status.target.targetId}/g${status.target.documentGeneration}`;
  $('stat-runtime').textContent = status.config?.generatedNodeRuntimeEnabled ? 'Node 已啟用' : 'Node 未啟用';
  $('stat-modules').textContent = `${activeCount} 個啟用`;
  const compactTarget = $('console-target-state');
  compactTarget.textContent = status.target?.title || status.target?.url || '尚無目標頁';
  compactTarget.parentElement.classList.toggle('connected', Boolean(status.target?.url));
  $('target-summary').textContent = status.target?.url
    ? `${status.target.url} | ${status.target.title || '無標題'}`
    : status.error || '等待目標頁';
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
    browser.textContent = '尚無檢查點。';
    return;
  }
  for (const checkpoint of checkpoints) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'browser-row';
    row.disabled = checkpoint.restorable === false;
    row.addEventListener('click', () => { $('checkpoint-id').value = checkpoint.id; });
    row.append(
      makeText('strong', checkpoint.label || '檢查點'),
      makeText('span', short(checkpoint.id, 18)),
      makeText('small', `${checkpoint.schema}${checkpoint.restorable ? '' : ' · 僅可擷取'}`)
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
      makeText('strong', event.type || '事件'),
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

function setModuleAutomationStep(step, status, label) {
  state.moduleAutomation.steps[step] = status;
  if (label) state.moduleAutomation.label = label;
  state.moduleAutomation.status = status === 'running'
    ? 'running'
    : (status === 'stopped' ? 'idle' : state.moduleAutomation.status);
  renderModuleAutomation();
}

function requestConfirmation(title, body) {
  const dialog = $('confirmation-dialog');
  $('confirmation-title').textContent = title;
  $('confirmation-body').textContent = body;
  dialog.returnValue = '';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
    dialog.showModal();
  });
}

async function runModuleAutomation() {
  if (state.moduleAutomation.running) return;
  state.moduleAutomation = {
    running: true,
    label: '正在建立候選…',
    status: 'running',
    steps: { candidate: 'running' }
  };
  renderModuleAutomation();
  const evidence = [];
  let activeStep = 'candidate';

  try {
    const manifest = moduleManifest();
    const source = $('module-source').value;
    const environment = moduleEnvironment();
    const candidate = await window.blankseed.modules.createCandidate(manifest, source, {
      requestId: requestId('module_auto_candidate')
    });
    $('module-candidate').value = candidate.candidateId;
    evidence.push({ step: 'candidate', candidateId: candidate.candidateId, status: 'completed' });
    setModuleAutomationStep('candidate', 'completed');

    activeStep = 'test';
    setModuleAutomationStep('test', 'running', '正在測試候選…');
    const tested = await window.blankseed.modules.testCandidate(candidate.candidateId, {
      requestId: requestId('module_auto_test')
    });
    if (tested.passed !== true) {
      throw createModuleAutomationError('候選測試未通過，流程已停止。', tested.result);
    }
    evidence.push({ step: 'test', status: 'completed', sourceHash: tested.manifest?.sourceHash || null });
    setModuleAutomationStep('test', 'completed');

    activeStep = 'commit';
    setModuleAutomationStep('commit', 'running', '候選測試已通過，等待是否提交。');
    const shouldCommit = await requestConfirmation(
      '提交版本？',
      `${manifest.id}@${manifest.version} 已通過候選測試。選擇 YES 會建立不可變的提交版本；選擇 NO 會保留已測試候選並停止流程。`
    );
    if (!shouldCommit) {
      evidence.push({ step: 'commit', status: 'declined' });
      state.moduleAutomation.running = false;
      setModuleAutomationStep('commit', 'stopped', '使用者選擇 NO；流程停在已測試候選。');
      show({ kind: 'module.automation.result', status: 'stopped', stoppedAt: 'commit', evidence });
      await refreshAll();
      return;
    }

    const committed = await window.blankseed.modules.commitCandidate(candidate.candidateId, {
      requestId: requestId('module_auto_commit')
    });
    evidence.push({ step: 'commit', status: 'completed', sourceHash: committed.manifest?.sourceHash || null });
    setModuleAutomationStep('commit', 'completed');

    activeStep = 'activate';
    setModuleAutomationStep('activate', 'running', '版本已提交，等待是否啟用。');
    const shouldActivate = await requestConfirmation(
      '啟用版本？',
      `${manifest.id}@${manifest.version} 已提交。選擇 YES 會切換作用中的模組版本並執行呼叫驗證；選擇 NO 會保留提交版本但不啟用。`
    );
    if (!shouldActivate) {
      evidence.push({ step: 'activate', status: 'declined' });
      state.moduleAutomation.running = false;
      setModuleAutomationStep('activate', 'stopped', '使用者選擇 NO；流程停在已提交版本。');
      show({ kind: 'module.automation.result', status: 'stopped', stoppedAt: 'activate', evidence });
      await refreshAll();
      return;
    }

    const activated = await window.blankseed.modules.activate(manifest.id, manifest.version, {
      requestId: requestId('module_auto_activate')
    });
    evidence.push({ step: 'activate', status: 'completed', active: activated.active || null });
    setModuleAutomationStep('activate', 'completed');

    activeStep = 'invoke';
    setModuleAutomationStep('invoke', 'running', '正在呼叫模組進行驗證…');
    const invocation = await window.blankseed.modules.invoke(manifest.id, {
      requestId: requestId('module_auto_invoke'),
      environment,
      timeoutMs: 5000
    });
    if (invocation.status !== 'ok') {
      throw createModuleAutomationError('模組呼叫驗證失敗。', invocation);
    }
    evidence.push({ step: 'invoke', status: 'completed', result: invocation.result ?? null });
    setModuleAutomationStep('invoke', 'completed');
    state.moduleAutomation.running = false;
    state.moduleAutomation.status = 'success';
    state.moduleAutomation.label = `自動化流程已完成 · ${manifest.id}@${manifest.version}`;
    renderModuleAutomation();
    show({ kind: 'module.automation.result', status: 'ok', module: `${manifest.id}@${manifest.version}`, evidence });
  } catch (error) {
    state.moduleAutomation.running = false;
    state.moduleAutomation.status = 'error';
    state.moduleAutomation.steps[activeStep] = 'failed';
    state.moduleAutomation.label = `自動化流程失敗：${error.message}`;
    renderModuleAutomation();
    showError(error);
  }
  await refreshAll();
}

function createModuleAutomationError(message, execution) {
  const error = new Error(execution?.error?.message || message);
  error.code = execution?.error?.code || 'MODULE_AUTOMATION_FAILED';
  error.details = {
    executionId: execution?.executionId || null,
    status: execution?.status || 'error'
  };
  return error;
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
$('model-local-endpoint').addEventListener('input', (event) => { event.currentTarget.dataset.edited = 'true'; });
$('model-local-name').addEventListener('input', (event) => { event.currentTarget.dataset.edited = 'true'; });
$('model-local-apply').addEventListener('click', () => run(async () => {
  const value = await window.blankseed.model.configuration.updateLocal(
    $('model-local-endpoint').value.trim(),
    $('model-local-name').value.trim(),
    { requestId: requestId('model_local_update') }
  );
  delete $('model-local-endpoint').dataset.edited;
  delete $('model-local-name').dataset.edited;
  return value;
}));
$('model-openai-apply').addEventListener('click', () => {
  const input = $('model-openai-key');
  const apiKey = input.value;
  input.value = '';
  if (!apiKey.trim()) {
    showError({ code: 'INVALID_REQUEST', message: '請輸入 OpenAI API 金鑰。' });
    return;
  }
  run(() => window.blankseed.model.configuration.setOpenAICredential(apiKey, {
    requestId: requestId('model_openai_set')
  }));
});
$('model-openai-clear').addEventListener('click', () => run(() => {
  return window.blankseed.model.configuration.clearOpenAICredential({
    requestId: requestId('model_openai_clear')
  });
}));
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
    showError({ code: 'INVALID_REQUEST', message: '請先選擇檢查點。' });
    return;
  }
  if (!window.confirm('還原檢查點只會恢復已套用的模組 mapping；不會還原頁面、儲存空間、設定、憑證或外部副作用。確定繼續？')) return;
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
$('module-auto-enabled').addEventListener('change', renderModuleAutomation);
$('module-auto-run').addEventListener('click', () => runModuleAutomation());
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
    showError({ code: 'INVALID_REQUEST', message: '任務內容不得為空。' });
    return;
  }
  addAgentMessage('user', task, { label: 'USER', detail: '使用者指令' });
  state.agent = { running: true, evolutionRunId: null, label: 'Agent 任務執行中…', status: 'running' };
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
      label: `Agent 任務 ${value.status === 'ok' ? '已完成' : '已停止'} · ${short(value.evolutionRunId, 18)}`,
      status: value.status === 'ok' ? 'success' : 'error'
    };
    const output = value.output?.content || value.error?.message || `Agent 任務 ${value.status === 'ok' ? '已完成。' : '未完成。'}`;
    addAgentMessage('agent', output, {
      label: 'AGENT',
      detail: `回合 ${value.metrics?.turns ?? 0} · 動作 ${value.metrics?.actions ?? 0}`,
      status: value.status === 'ok' ? 'ok' : 'error'
    });
    show(value);
  } catch (error) {
    state.agent = { running: false, evolutionRunId: null, label: `Agent 任務失敗：${error.message}`, status: 'error' };
    addAgentMessage('agent', error.message, { label: 'AGENT', detail: '執行失敗', status: 'error' });
    showError(error);
  }
  await refreshAll();
});
$('agent-cancel').addEventListener('click', () => run(async () => {
  const value = await window.blankseed.evolution.cancel(state.agent.evolutionRunId, { requestId: requestId('agent_cancel') });
  state.agent = { running: false, evolutionRunId: null, label: `已要求取消 Agent 任務 · ${value.cancelled || 0}`, status: 'idle' };
  return value;
}));
$('multi-agent-run').addEventListener('click', async () => {
  const task = agentTask.value.trim();
  if (!task) {
    showError({ code: 'INVALID_REQUEST', message: '任務內容不得為空。' });
    return;
  }
  const moduleId = $('governance-module-id').value.trim();
  const version = $('governance-module-version').value.trim();
  addAgentMessage('user', task, { label: 'USER', detail: '受控審核指令' });
  state.multiAgent = { running: true, multiAgentRunId: null, decisionId: null, applyAvailable: false, label: '多代理審核執行中…', status: 'running' };
  renderAgent();
  try {
    const value = await window.blankseed.multiAgent.run(task, {
      proposerAdapter: $('agent-adapter').value,
      reviewerAdapter: $('reviewer-adapter').value,
      activation: moduleId || version ? { id: moduleId, version } : null,
      maxTurns: Number($('agent-max-turns').value),
      maxActions: Number($('agent-max-actions').value),
      autoApply: $('sandbox-auto-apply').checked && !$('sandbox-auto-apply').disabled,
      options: { reasoningEffort: $('agent-reasoning').value }
    }, { requestId: requestId('multi_agent_run') });
    const decisionId = value.decision?.decisionId || null;
    if (decisionId) $('governance-decision-id').value = decisionId;
    state.multiAgent = {
      running: false,
      multiAgentRunId: value.multiAgentRunId || null,
      decisionId,
      applyAvailable: value.decision?.status === 'awaiting_operator',
      label: value.status === 'ok'
        ? `受控審核已完成 · ${value.decision.review.verdict}${value.decision.status === 'applied' ? ' · 已自動套用' : ''} · ${short(decisionId, 18)}`
        : `多代理審核失敗：${value.error?.message || '未知'}`,
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
      if (value.decision.status === 'applied') {
        addAgentMessage('governance', `決策 ${decisionId} 已由沙盒 Agent 政策自動套用。`, {
          label: 'GOVERNANCE',
          detail: value.autoApply?.result?.authorityId || '沙盒自動套用'
        });
      }
    } else {
      addAgentMessage('reviewer', value.error?.message || '受控審核未完成。', {
        label: 'REVIEWER',
        detail: '審核失敗',
        status: 'error'
      });
    }
    show(value);
  } catch (error) {
    state.multiAgent = { running: false, multiAgentRunId: null, decisionId: null, applyAvailable: false, label: `多代理審核失敗：${error.message}`, status: 'error' };
    addAgentMessage('reviewer', error.message, { label: 'REVIEWER', detail: '審核失敗', status: 'error' });
    showError(error);
  }
  await refreshAll();
});
$('multi-agent-cancel').addEventListener('click', () => run(async () => {
  const value = await window.blankseed.multiAgent.cancel(state.multiAgent.multiAgentRunId, { requestId: requestId('multi_agent_cancel') });
  state.multiAgent = { running: false, multiAgentRunId: null, decisionId: state.multiAgent.decisionId, applyAvailable: state.multiAgent.applyAvailable, label: `已要求取消多代理流程 · ${value.cancelled || 0}`, status: 'idle' };
  return value;
}));
$('governance-apply').addEventListener('click', () => {
  const decisionId = $('governance-decision-id').value.trim();
  if (!decisionId) {
    showError({ code: 'INVALID_REQUEST', message: '請先完成或選擇治理決策。' });
    return;
  }
  if (!window.confirm('套用將依已審查證據，啟用指定已提交的 Module 版本。確定繼續？')) return;
  run(async () => {
    const value = await window.blankseed.multiAgent.apply(decisionId, {
      requestId: requestId('governance_apply'),
      confirmed: true
    });
    state.multiAgent = { running: false, multiAgentRunId: value.multiAgentRunId, decisionId, applyAvailable: false, label: `治理決策已套用 · ${short(decisionId, 18)}`, status: 'success' };
    addAgentMessage('governance', `決策 ${decisionId} 已由使用者確認並套用。`, {
      label: 'GOVERNANCE',
      detail: short(value.multiAgentRunId, 22)
    });
    return value;
  });
});
$('governance-decision-id').addEventListener('input', () => {
  state.multiAgent.applyAvailable = Boolean($('governance-decision-id').value.trim());
  $('governance-apply').disabled = !state.multiAgent.applyAvailable;
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
window.blankseedConsoleReady = false;
refreshAll().finally(() => {
  window.blankseedConsoleReady = true;
});
