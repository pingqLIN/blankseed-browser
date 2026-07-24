const { applyBindings, formatTime, getLocale, observe, setLocale, t } = globalThis.BlankSeedI18n;

let scenarios = globalThis.blankseedTutorialScenarios;
let getScenario = globalThis.blankseedTutorialGetScenario;

const tutorialState = {
  scenarioId: new URLSearchParams(location.search).get('scenario') || 'overview',
  stepIndex: 0,
  activeTab: 'page',
  target: {
    url: 'https://example.com/',
    title: 'Example Domain',
    generation: 1,
    page: 'example',
    loggedIn: false
  },
  agentMessages: [],
  agentRunning: false,
  reviewRunning: false,
  reviewDecision: null,
  hostedAvailable: false,
  checkpoints: [
    { id: 'chk_tutorial_baseline', label: '教學基準', schema: 'blankseed-checkpoint/0.2' }
  ],
  modules: {
    activeVersion: '0.0.1',
    candidate: null,
    versions: [
      {
        id: 'generated.tutorial.summary',
        version: '0.0.1',
        status: 'committed',
        sourceHash: 'sha256:7a0f…baseline'
      }
    ]
  }
};

const documentRoot = document;
const query = (selector, root = documentRoot) => root.querySelector(selector);
const queryAll = (selector, root = documentRoot) => [...root.querySelectorAll(selector)];

let consoleRoot = null;
let currentHighlightTarget = null;

function announce(message) {
  query('#tutorial-status').textContent = message;
}

function setText(selector, value) {
  const element = query(selector, consoleRoot || documentRoot);
  if (element) element.textContent = value;
}

function shortId(value, maxLength = 20) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function createId(prefix) {
  return `${prefix}_tutorial_${Math.random().toString(16).slice(2, 10)}`;
}

async function loadReplica() {
  const mount = query('#console-mount');
  const rendererSource = mount.dataset.rendererSource;
  const response = await fetch(rendererSource, { cache: 'no-store' });
  if (!response.ok) throw new Error(`無法載入現行 renderer markup（HTTP ${response.status}）`);
  const rendererHtml = await response.text();
  const parsed = new DOMParser().parseFromString(rendererHtml, 'text/html');
  const rendererMain = parsed.querySelector('main');
  if (!rendererMain) throw new Error('現行 renderer markup 缺少 main。');
  const confirmationDialog = parsed.querySelector('#confirmation-dialog');
  mount.replaceChildren(
    document.importNode(rendererMain, true),
    ...(confirmationDialog ? [document.importNode(confirmationDialog, true)] : [])
  );
  consoleRoot = mount;
}

function setTab(tabId) {
  tutorialState.activeTab = tabId;
  document.body.classList.toggle('agent-mode', tabId === 'agent');
  for (const button of queryAll('.tab', consoleRoot)) {
    const active = button.dataset.tab === tabId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  for (const panel of queryAll('.tab-panel', consoleRoot)) {
    const active = panel.id === `tab-${tabId}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  }
}

function openModelSettings() {
  setTab('agent');
  const modelConnection = query('#model-connection', consoleRoot);
  modelConnection.open = true;
  modelConnection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  query('#model-local-endpoint', consoleRoot).focus({ preventScroll: true });
}

function populateAdapters() {
  const adapters = [
    { id: 'local.manual', label: '本機手動', model: 'manual', available: true },
    { id: 'local.openai-compatible', label: '本機 OpenAI 相容', model: 'local-model', available: true },
    { id: 'openai.gpt-5.6-sol', label: 'OpenAI GPT-5.6 Sol', model: 'gpt-5.6-sol', available: tutorialState.hostedAvailable },
    { id: 'openai.gpt-5.6-terra', label: 'OpenAI GPT-5.6 Terra', model: 'gpt-5.6-terra', available: tutorialState.hostedAvailable },
    { id: 'openai.gpt-5.6-luna', label: 'OpenAI GPT-5.6 Luna', model: 'gpt-5.6-luna', available: tutorialState.hostedAvailable }
  ];
  for (const selector of ['#agent-adapter', '#reviewer-adapter']) {
    const select = query(selector, consoleRoot);
    const prior = select.value;
    select.replaceChildren();
    for (const adapter of adapters) {
      const option = document.createElement('option');
      option.value = adapter.id;
      option.textContent = `${adapter.label} · ${adapter.model}`;
      option.disabled = !adapter.available;
      select.append(option);
    }
    const priorOption = [...select.options].find((option) => option.value === prior && !option.disabled);
    select.value = priorOption?.value || (selector === '#reviewer-adapter' && tutorialState.hostedAvailable
      ? 'openai.gpt-5.6-sol'
      : 'local.manual');
  }
}

function renderStatus() {
  setText('#stat-session', 'ses_tutorial_demo');
  setText('#stat-target', `t2/g${tutorialState.target.generation}`);
  setText('#stat-runtime', 'Node 已啟用');
  setText('#stat-modules', tutorialState.modules.activeVersion ? '1 個啟用' : '0 個啟用');
  setText('#console-target-state', tutorialState.target.title);
  const compactState = query('#console-target-state', consoleRoot)?.parentElement;
  compactState?.classList.add('connected');
  setText('#target-summary', `${tutorialState.target.url} | ${tutorialState.target.title}`);
}

function renderTarget() {
  const page = query('#target-page');
  const origin = query('#target-origin');
  let hostname = '本機教學頁';
  try {
    hostname = new URL(tutorialState.target.url).hostname;
  } catch {
    hostname = tutorialState.target.url;
  }
  origin.textContent = hostname;
  page.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.className = 'training-page';
  if (tutorialState.target.page === 'login' && !tutorialState.target.loggedIn) {
    wrapper.innerHTML = `
      <section class="training-login-card">
        <div class="training-content">
          <h2>登入 BlankSeed 練習站</h2>
          <p>這是本機教學表單，不會傳送或保存帳密。</p>
        </div>
        <form id="training-login-form" class="training-form">
          <label>電子郵件
            <input id="training-email" type="email" autocomplete="username" placeholder="learner@example.test">
          </label>
          <label>密碼
            <input id="training-password" type="password" autocomplete="current-password" placeholder="教學用假密碼">
          </label>
          <button id="training-login-submit" type="submit">登入</button>
        </form>
        <p class="training-note">真實網站的 MFA、CAPTCHA、同意流程與付款確認，請由使用者親自完成。</p>
      </section>`;
  } else if (tutorialState.target.page === 'dashboard' || tutorialState.target.loggedIn) {
    wrapper.innerHTML = `
      <section class="training-dashboard">
        <div class="training-content">
        <h2>教學儀表板</h2>
          <p><strong>已登入。</strong>現在可讓 Agent 觀察頁面，但不要把 credential 放進 Agent 指令。</p>
        </div>
        <button id="training-logout" type="button">登出</button>
      </section>`;
  } else {
    wrapper.innerHTML = `
      <article class="training-content">
        <h1>Example Domain</h1>
        <p>此網域用於文件範例，不需事先授權即可於教學文件引用。</p>
        <a href="https://iana.org/domains/example" tabindex="0">更多資訊…</a>
      </article>`;
  }
  page.append(wrapper);

  query('#training-login-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitTrainingLogin();
  });
  query('#training-logout')?.addEventListener('click', () => logoutTraining());
  renderStatus();
}

function navigate(url) {
  const normalized = url.trim() || 'https://example.com/';
  tutorialState.target.url = normalized;
  tutorialState.target.generation += 1;
  if (/training\.blankseed\.local\/login/i.test(normalized)) {
    tutorialState.target.page = 'login';
    tutorialState.target.loggedIn = false;
    tutorialState.target.title = '登入 BlankSeed 練習站';
  } else {
    tutorialState.target.page = 'example';
    tutorialState.target.loggedIn = false;
    tutorialState.target.title = 'Example Domain';
  }
  renderTarget();
  showResult({ status: 'ok', action: 'target.navigate', url: normalized, documentGeneration: tutorialState.target.generation });
  addTimeline('target.navigation.completed', normalized, 'ok');
}

function submitTrainingLogin() {
  const email = query('#training-email')?.value || 'learner@example.test';
  tutorialState.target.loggedIn = true;
  tutorialState.target.page = 'dashboard';
  tutorialState.target.url = 'https://training.blankseed.local/dashboard';
  tutorialState.target.title = '教學儀表板';
  tutorialState.target.generation += 1;
  renderTarget();
  showResult({ status: 'ok', action: 'training.login', user: email, credentialRetained: false });
  addTimeline('target.login.simulated', email, 'ok');
  announce('教學登入完成。');
}

function logoutTraining() {
  tutorialState.target.loggedIn = false;
  tutorialState.target.page = 'login';
  tutorialState.target.url = 'https://training.blankseed.local/login';
  tutorialState.target.title = '登入 BlankSeed 練習站';
  tutorialState.target.generation += 1;
  renderTarget();
  showResult({ status: 'ok', action: 'training.logout', sessionRevoked: true });
  addTimeline('target.logout.simulated', '網站 session 已撤銷', 'warn');
  announce('教學網站已登出。');
}

function showResult(value) {
  query('#result', consoleRoot).textContent = JSON.stringify(value, null, 2);
}

function addTimeline(type, detail, tone = 'neutral') {
  const timeline = query('#timeline', consoleRoot);
  if (timeline.dataset.seeded !== 'true') {
    timeline.replaceChildren();
    timeline.dataset.seeded = 'true';
  }
  const row = document.createElement('div');
  row.className = `timeline-row ${tone}`;
  row.dataset.i18nSkip = 'true';
  const time = formatTime(new Date());
  const timeElement = document.createElement('time');
  timeElement.textContent = time;
  const title = document.createElement('strong');
  title.textContent = type;
  const detailElement = document.createElement('small');
  detailElement.textContent = detail;
  row.append(timeElement, title, detailElement);
  timeline.prepend(row);
}

function addAgentMessage(role, label, content, detail) {
  tutorialState.agentMessages.push({ role, label, content, detail, timestamp: new Date() });
  renderAgentMessages();
}

function renderAgentMessages() {
  const messages = query('#agent-messages', consoleRoot);
  messages.replaceChildren();
  if (tutorialState.agentMessages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'agent-message-empty';
    const title = document.createElement('strong');
    title.textContent = t('agent.emptyTitle');
    const body = document.createElement('span');
    body.textContent = t('agent.emptyBody');
    empty.append(title, body);
    messages.append(empty);
    return;
  }
  for (const message of tutorialState.agentMessages) {
    const row = document.createElement('article');
    row.className = `agent-message ${message.role}`;
    row.dataset.i18nSkip = 'true';
    const role = document.createElement('div');
    role.className = 'message-role';
    const roleName = document.createElement('strong');
    roleName.textContent = message.label;
    role.append(roleName);
    const content = document.createElement('div');
    content.className = 'message-content';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const detail = document.createElement('span');
    detail.textContent = message.detail;
    const time = document.createElement('time');
    time.textContent = formatTime(message.timestamp);
    meta.append(detail, time);
    const body = document.createElement('p');
    body.className = 'message-body';
    body.textContent = message.content;
    content.append(meta, body);
    row.append(role, content);
    messages.append(row);
  }
  messages.scrollTop = messages.scrollHeight;
}

function updateRunStatus(selector, text, status = 'idle') {
  const element = query(selector, consoleRoot);
  element.className = `run-status ${status}`;
  const label = element.querySelector('span:last-child');
  if (label) label.textContent = text;
}

function runAgent({ modelSmoke = false } = {}) {
  const task = query('#agent-task', consoleRoot).value.trim();
  if (!task) return;
  tutorialState.agentRunning = true;
  query('#agent-run', consoleRoot).disabled = true;
  query('#agent-cancel', consoleRoot).disabled = false;
  addAgentMessage('user', '使用者', task, '使用者指令');
  updateRunStatus('#agent-run-status', 'Agent 運作中…', 'running');

  const adapter = query('#agent-adapter', consoleRoot).value;
  const output = modelSmoke
    ? '已透過選定介接器觀察目標頁：Example Domain。這次 smoke 只讀取標題，沒有執行變更。'
    : '已觀察目前目標頁。頁面標題為 Example Domain；建議先檢查快照，再決定是否需要建立模組。';
  addAgentMessage('agent', '代理人', output, '輪次 1 · 動作 1');
  const runId = createId('evo');
  tutorialState.agentRunning = false;
  query('#agent-run', consoleRoot).disabled = false;
  query('#agent-cancel', consoleRoot).disabled = true;
  updateRunStatus('#agent-run-status', `Agent 已完成 · ${shortId(runId)}`, 'success');
  showResult({ status: 'ok', evolutionRunId: runId, adapter, metrics: { turns: 1, actions: 1 }, output: { content: output } });
  addTimeline('model.turn.completed', `${adapter} · ${runId}`, 'ok');
}

function generateCandidate() {
  const candidate = {
    candidateId: createId('cand'),
    id: 'generated.tutorial.summary',
    version: '0.1.0',
    status: 'candidate',
    sourceHash: 'sha256:5d61…tutorial'
  };
  tutorialState.modules.candidate = candidate;
  query('#module-id', consoleRoot).value = candidate.id;
  query('#module-version', consoleRoot).value = candidate.version;
  query('#module-description', consoleRoot).value = '產生目標頁摘要';
  query('#module-candidate', consoleRoot).value = candidate.candidateId;
  query('#module-source', consoleRoot).value = `return {\n  title: environment.title || '未命名',\n  summary: '已建立教學摘要'\n};`;
  query('#module-env', consoleRoot).value = '{"title":"Example Domain"}';
  renderModules();
  addAgentMessage('agent', '代理人', `已建立候選版本 ${candidate.id}@${candidate.version}。`, '動作 2');
  showResult({ status: 'ok', ...candidate, active: false });
  addTimeline('module.candidate.created', `${candidate.id}@${candidate.version}`, 'warn');
}

function renderModules() {
  const browser = query('#module-browser', consoleRoot);
  browser.replaceChildren();
  const records = [...tutorialState.modules.versions];
  if (tutorialState.modules.candidate) records.push(tutorialState.modules.candidate);
  for (const record of records) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'browser-row';
    if (record.version === tutorialState.modules.activeVersion) row.classList.add('active-row');
    if (record.candidateId) row.classList.add('candidate-row');
    const title = document.createElement('strong');
    title.textContent = `${record.id}@${record.version}`;
    const status = document.createElement('span');
    status.textContent = record.version === tutorialState.modules.activeVersion
      ? '已啟用'
      : ({ candidate: '候選', tested: '測試通過', committed: '已提交' }[record.status] || record.status);
    const evidence = document.createElement('small');
    evidence.textContent = record.candidateId || record.sourceHash;
    row.append(title, status, evidence);
    row.addEventListener('click', () => {
      query('#module-id', consoleRoot).value = record.id;
      query('#module-version', consoleRoot).value = record.version;
      if (record.candidateId) query('#module-candidate', consoleRoot).value = record.candidateId;
    });
    browser.append(row);
  }
  renderStatus();
}

function testCandidate() {
  const candidate = tutorialState.modules.candidate;
  if (!candidate) return showResult({ status: 'error', code: 'INVALID_REQUEST', message: '請先建立候選版本。' });
  candidate.status = 'tested';
  renderModules();
  showResult({ status: 'ok', candidateId: candidate.candidateId, tests: { passed: 1, failed: 0 }, active: false });
  addTimeline('module.candidate.test.completed', candidate.candidateId, 'ok');
}

function commitCandidate() {
  const candidate = tutorialState.modules.candidate;
  if (!candidate || candidate.status !== 'tested') return showResult({ status: 'error', code: 'INVALID_REQUEST', message: '候選版本必須先通過測試。' });
  tutorialState.modules.versions.push({
    id: candidate.id,
    version: candidate.version,
    status: 'committed',
    sourceHash: candidate.sourceHash
  });
  tutorialState.modules.candidate = null;
  renderModules();
  showResult({ status: 'ok', id: candidate.id, version: candidate.version, sourceHash: candidate.sourceHash, active: false });
  addTimeline('module.version.committed', `${candidate.id}@${candidate.version}`, 'ok');
}

function activateModule(version = query('#module-version', consoleRoot).value) {
  const record = tutorialState.modules.versions.find((item) => item.version === version);
  if (!record) return showResult({ status: 'error', code: 'MODULE_NOT_FOUND', message: '請先提交這個模組版本。' });
  tutorialState.modules.activeVersion = record.version;
  renderModules();
  showResult({ status: 'ok', id: record.id, version: record.version, active: true });
  addTimeline('module.activation.completed', `${record.id}@${record.version}`, 'ok');
}

function invokeModule() {
  let environment = {};
  try {
    environment = JSON.parse(query('#module-env', consoleRoot).value || '{}');
  } catch {
    return showResult({ status: 'error', code: 'INVALID_REQUEST', message: '模組環境必須是有效 JSON。' });
  }
  const activeVersion = tutorialState.modules.activeVersion;
  showResult({
    status: 'ok',
    module: `generated.tutorial.summary@${activeVersion}`,
    result: { title: environment.title || '未命名', summary: '已建立教學摘要' }
  });
  addTimeline('module.invocation.completed', `generated.tutorial.summary@${activeVersion}`, 'ok');
}

function rollbackModule(targetVersion = '0.0.1') {
  query('#module-id', consoleRoot).value = 'generated.tutorial.summary';
  query('#module-version', consoleRoot).value = targetVersion;
  tutorialState.modules.activeVersion = targetVersion;
  renderModules();
  showResult({ status: 'ok', action: 'module.rollback', id: 'generated.tutorial.summary', version: targetVersion, externalEffectsReversed: false });
  addTimeline('module.rollback.completed', `generated.tutorial.summary@${targetVersion}`, 'warn');
}

function updateModuleAutomationStep(step, status, label) {
  const item = query(`#module-auto-steps [data-step="${step}"]`, consoleRoot);
  if (item) item.className = status || '';
  if (label) updateRunStatus('#module-auto-status', label, status === 'running' ? 'running' : 'idle');
}

function requestTutorialConfirmation(title, body) {
  const dialog = query('#confirmation-dialog', consoleRoot);
  query('#confirmation-title', dialog).textContent = title;
  query('#confirmation-body', dialog).textContent = body;
  dialog.returnValue = '';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
    dialog.showModal();
  });
}

async function runModuleAutomationTutorial() {
  if (tutorialState.moduleAutomationRunning) return;
  tutorialState.moduleAutomationRunning = true;
  query('#module-auto-run', consoleRoot).disabled = true;
  queryAll('#module-auto-steps [data-step]', consoleRoot).forEach((item) => { item.className = ''; });
  updateModuleAutomationStep('candidate', 'running', '正在建立候選…');
  generateCandidate();
  updateModuleAutomationStep('candidate', 'completed');
  updateModuleAutomationStep('test', 'running', '正在測試候選…');
  testCandidate();
  updateModuleAutomationStep('test', 'completed');
  updateModuleAutomationStep('commit', 'running', '候選測試已通過，等待是否提交。');
  if (!await requestTutorialConfirmation('提交版本？', '選擇 YES 會提交不可變版本；選擇 NO 會停在已測試候選。')) {
    updateModuleAutomationStep('commit', 'stopped', '使用者選擇 NO；流程停在已測試候選。');
    tutorialState.moduleAutomationRunning = false;
    query('#module-auto-run', consoleRoot).disabled = false;
    return;
  }
  commitCandidate();
  updateModuleAutomationStep('commit', 'completed');
  updateModuleAutomationStep('activate', 'running', '版本已提交，等待是否啟用。');
  if (!await requestTutorialConfirmation('啟用版本？', '選擇 YES 會啟用版本並呼叫驗證；選擇 NO 會保留提交版本但不啟用。')) {
    updateModuleAutomationStep('activate', 'stopped', '使用者選擇 NO；流程停在已提交版本。');
    tutorialState.moduleAutomationRunning = false;
    query('#module-auto-run', consoleRoot).disabled = false;
    return;
  }
  activateModule('0.1.0');
  updateModuleAutomationStep('activate', 'completed');
  updateModuleAutomationStep('invoke', 'running', '正在呼叫模組進行驗證…');
  invokeModule();
  updateModuleAutomationStep('invoke', 'completed');
  updateRunStatus('#module-auto-status', '自動化流程已完成 · generated.tutorial.summary@0.1.0', 'success');
  tutorialState.moduleAutomationRunning = false;
  query('#module-auto-run', consoleRoot).disabled = false;
}

function prepareGovernance() {
  if (!tutorialState.modules.versions.some((item) => item.version === '0.1.0')) {
    generateCandidate();
    testCandidate();
    commitCandidate();
  }
  setTab('agent');
  query('#governance-module-id', consoleRoot).value = 'generated.tutorial.summary';
  query('#governance-module-version', consoleRoot).value = '0.1.0';
  query('#agent-task', consoleRoot).value = '審查 generated.tutorial.summary@0.1.0，確認來源身份與啟用風險。';
  updateTaskCount();
}

function runGovernance() {
  prepareGovernance();
  const decisionId = createId('gov');
  tutorialState.reviewRunning = false;
  tutorialState.reviewDecision = { id: decisionId, status: 'awaiting_operator', verdict: 'approve' };
  query('#governance-decision-id', consoleRoot).value = decisionId;
  query('#governance-apply', consoleRoot).disabled = false;
  query('#multi-agent-cancel', consoleRoot).disabled = false;
  addAgentMessage('user', '使用者', query('#agent-task', consoleRoot).value, '受控審核指令');
  addAgentMessage('agent', '提案者', '提案：此版本已通過候選測試，建議由操作員決定是否啟用。', 'agt_proposer_tutorial');
  addAgentMessage('reviewer', '稽核者', '核准：proposalHash[提案雜湊] 與 committed sourceHash[提交來源雜湊] 一致；審核結果僅供建議，尚未具啟用權限。', `核准 · ${decisionId}`);
  updateRunStatus('#multi-agent-status', `受控審核已完成 · 核准 · ${shortId(decisionId)}`, 'success');
  showResult({ status: 'ok', decision: { decisionId, status: 'awaiting_operator', review: { verdict: 'approve' } } });
  addTimeline('governance.decision.awaiting_operator', decisionId, 'warn');
}

function cancelGovernance() {
  const decisionId = tutorialState.reviewDecision?.id || null;
  tutorialState.reviewRunning = false;
  tutorialState.reviewDecision = null;
  query('#governance-decision-id', consoleRoot).value = '';
  query('#governance-apply', consoleRoot).disabled = true;
  query('#multi-agent-cancel', consoleRoot).disabled = true;
  updateRunStatus('#multi-agent-status', '已要求取消受控審核流程 · 1', 'idle');
  showResult({ status: 'ok', action: 'multi_agent.cancel', cancelled: 1, priorDecisionId: decisionId, activeMappingChanged: false });
  addTimeline('multi_agent.run.cancelled', decisionId || 'active run', 'warn');
}

function applyGovernance() {
  const decision = tutorialState.reviewDecision;
  if (!decision) return showResult({ status: 'error', code: 'INVALID_REQUEST', message: '請先完成受控審核。' });
  decision.status = 'applied';
  tutorialState.modules.activeVersion = '0.1.0';
  query('#governance-apply', consoleRoot).disabled = true;
  query('#multi-agent-cancel', consoleRoot).disabled = true;
  updateRunStatus('#multi-agent-status', `治理決策已套用 · ${shortId(decision.id)}`, 'success');
  addAgentMessage('governance', '治理', `決策 ${decision.id} 已由操作員確認並套用。`, 'operator-confirmed');
  tutorialState.checkpoints.unshift({ id: createId('chk'), label: 'pre-governance-apply', schema: 'blankseed-checkpoint/0.2' });
  renderCheckpoints();
  renderModules();
  showResult({ status: 'ok', decisionId: decision.id, authority: 'operator', checkpointCreated: true, activeVersion: '0.1.0' });
  addTimeline('governance.decision.applied', decision.id, 'ok');
}

function renderCheckpoints() {
  const browser = query('#checkpoint-browser', consoleRoot);
  browser.replaceChildren();
  for (const checkpoint of tutorialState.checkpoints.slice(0, 8)) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'browser-row';
    const label = document.createElement('strong');
    label.textContent = checkpoint.label;
    const id = document.createElement('span');
    id.textContent = shortId(checkpoint.id, 18);
    const schema = document.createElement('small');
    schema.textContent = checkpoint.schema;
    row.append(label, id, schema);
    row.addEventListener('click', () => { query('#checkpoint-id', consoleRoot).value = checkpoint.id; });
    browser.append(row);
  }
}

function updateTaskCount() {
  const task = query('#agent-task', consoleRoot);
  setText('#agent-task-count', `${task.value.length} / ${task.maxLength}`);
}

function wireReplica() {
  queryAll('.tab', consoleRoot).forEach((button) => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
    button.addEventListener('keydown', (event) => {
      const tabs = queryAll('.tab', consoleRoot);
      const index = tabs.indexOf(button);
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === index) return;
      event.preventDefault();
      setTab(tabs[next].dataset.tab);
      tabs[next].focus();
    });
  });

  query('#navigate-form', consoleRoot).addEventListener('submit', (event) => {
    event.preventDefault();
    navigate(query('#url', consoleRoot).value);
  });
  query('#back', consoleRoot).addEventListener('click', () => showResult({ status: 'ok', action: 'target.back', simulated: true }));
  query('#forward', consoleRoot).addEventListener('click', () => showResult({ status: 'ok', action: 'target.forward', simulated: true }));
  query('#reload', consoleRoot).addEventListener('click', () => navigate(tutorialState.target.url));
  query('#refresh-all', consoleRoot).addEventListener('click', () => {
    renderStatus();
    renderModules();
    renderCheckpoints();
    addTimeline('console.refresh.completed', '教學狀態已重新整理', 'neutral');
  });
  query('#open-model-settings', consoleRoot).addEventListener('click', openModelSettings);
  query('#snapshot', consoleRoot).addEventListener('click', () => {
    showResult({ status: 'ok', title: tutorialState.target.title, url: tutorialState.target.url, headings: [tutorialState.target.title] });
    addTimeline('page.snapshot.completed', tutorialState.target.title, 'ok');
  });
  query('#execute-page', consoleRoot).addEventListener('click', () => {
    showResult({ status: 'ok', execution: 'isolated-world-1001', title: tutorialState.target.title, url: tutorialState.target.url });
    addTimeline('page.execution.completed', 'isolated world 1001', 'ok');
  });
  query('#send-cdp', consoleRoot).addEventListener('click', () => {
    showResult({ status: 'ok', method: query('#cdp-method', consoleRoot).value, result: { currentIndex: 0, entries: [{ url: tutorialState.target.url }] } });
    addTimeline('cdp.command.completed', query('#cdp-method', consoleRoot).value, 'ok');
  });
  query('#utility-ping', consoleRoot).addEventListener('click', () => showResult({ status: 'ok', pong: true, runtime: 'utilityProcess' }));
  query('#utility-execute', consoleRoot).addEventListener('click', () => {
    showResult({ status: 'ok', runtime: 'generated-node', result: { platform: 'win32', cwd: '<workspace>' }, supervised: true, securitySandbox: false });
    addTimeline('node.runtime.execution.completed', 'generated runtime', 'ok');
  });
  query('#utility-stop', consoleRoot).addEventListener('click', () => showResult({ status: 'ok', remaining: 0 }));
  query('#stop-all', consoleRoot).addEventListener('click', () => {
    const state = query('#stop-state', consoleRoot);
    state.className = 'stop-state confirmed';
    state.querySelector('strong').textContent = '已確認／剩餘 0';
    showResult({ status: 'ok', action: 'stop.all', remaining: 0 });
    addTimeline('node.runtime.stop.confirmed', '剩餘 0', 'warn');
  });
  query('#checkpoint', consoleRoot).addEventListener('click', () => {
    const checkpoint = {
      id: createId('chk'),
      label: query('#checkpoint-label', consoleRoot).value || '手動檢查點',
      schema: 'blankseed-checkpoint/0.2'
    };
    tutorialState.checkpoints.unshift(checkpoint);
    query('#checkpoint-id', consoleRoot).value = checkpoint.id;
    renderCheckpoints();
    showResult({ status: 'ok', checkpointId: checkpoint.id, restores: ['modules.active'] });
    addTimeline('checkpoint.created', checkpoint.id, 'ok');
  });
  query('#checkpoint-restore', consoleRoot).addEventListener('click', () => {
    const checkpointId = query('#checkpoint-id', consoleRoot).value;
    showResult({ status: checkpointId ? 'ok' : 'error', checkpointId, restored: checkpointId ? ['modules.active'] : [], excluded: ['navigation', 'credentials', 'external effects'] });
  });
  query('#module-create', consoleRoot).addEventListener('click', () => generateCandidate());
  query('#module-test', consoleRoot).addEventListener('click', () => testCandidate());
  query('#module-commit', consoleRoot).addEventListener('click', () => commitCandidate());
  query('#module-activate', consoleRoot).addEventListener('click', () => activateModule());
  query('#module-invoke', consoleRoot).addEventListener('click', () => invokeModule());
  query('#module-rollback', consoleRoot).addEventListener('click', () => rollbackModule(query('#module-version', consoleRoot).value));
  query('#module-refresh', consoleRoot).addEventListener('click', () => renderModules());
  query('#module-auto-enabled', consoleRoot).addEventListener('change', (event) => {
    query('#module-auto-run', consoleRoot).disabled = !event.currentTarget.checked;
  });
  query('#module-auto-run', consoleRoot).addEventListener('click', () => runModuleAutomationTutorial());
  query('#model-local-apply', consoleRoot).addEventListener('click', () => {
    updateRunStatus('#model-configuration-status', '教學模擬：本機模型設定已套用。', 'success');
    showResult({ status: 'ok', provider: 'local', simulated: true });
  });
  query('#model-openai-key', consoleRoot).disabled = true;
  query('#model-openai-key', consoleRoot).placeholder = '教學頁不接受真實金鑰';
  query('#model-openai-apply', consoleRoot).addEventListener('click', () => demoActions.simulateHostedAvailable());
  query('#model-openai-clear', consoleRoot).addEventListener('click', () => {
    tutorialState.hostedAvailable = false;
    populateAdapters();
    updateRunStatus('#model-configuration-status', '教學模擬：暫時金鑰已清除。', 'idle');
  });
  query('#agent-run', consoleRoot).addEventListener('click', () => runAgent());
  query('#agent-cancel', consoleRoot).addEventListener('click', () => {
    tutorialState.agentRunning = false;
    query('#agent-run', consoleRoot).disabled = false;
    query('#agent-cancel', consoleRoot).disabled = true;
    updateRunStatus('#agent-run-status', '已要求取消 Agent 運作 · 1', 'idle');
    showResult({ status: 'ok', action: 'evolution.cancel', cancelled: 1 });
  });
  query('#multi-agent-run', consoleRoot).addEventListener('click', () => runGovernance());
  query('#multi-agent-cancel', consoleRoot).addEventListener('click', () => cancelGovernance());
  query('#governance-apply', consoleRoot).addEventListener('click', () => applyGovernance());
  query('#governance-decision-id', consoleRoot).addEventListener('input', (event) => {
    query('#governance-apply', consoleRoot).disabled = !event.currentTarget.value.trim();
  });
  query('#clear-result', consoleRoot).addEventListener('click', () => setText('#result', '已就緒。'));
  query('#refresh-events', consoleRoot).addEventListener('click', () => addTimeline('events.refresh.completed', '教學事件已整理', 'neutral'));
  query('#agent-clear-messages', consoleRoot).addEventListener('click', () => {
    tutorialState.agentMessages = [];
    renderAgentMessages();
  });
  query('#agent-task', consoleRoot).addEventListener('input', updateTaskCount);
  query('#agent-task', consoleRoot).addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      runAgent();
    }
  });

  query('#agent-cancel', consoleRoot).disabled = true;
  query('#multi-agent-cancel', consoleRoot).disabled = true;
  query('#governance-apply', consoleRoot).disabled = true;
  query('#sandbox-auto-apply', consoleRoot).disabled = true;
  setText('#sandbox-auto-apply-help', '預設維持人工確認');
  populateAdapters();
  renderStatus();
  renderTarget();
  renderAgentMessages();
  renderModules();
  renderCheckpoints();
  updateTaskCount();
  setTab('page');
}

function buildScenarioNavigation() {
  const list = query('#scenario-list');
  list.replaceChildren();
  for (const scenario of scenarios) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scenario-button';
    button.dataset.scenarioId = scenario.id;
    button.textContent = scenario.label;
    button.title = scenario.summary;
    button.addEventListener('click', () => selectScenario(scenario.id));
    list.append(button);
  }
}

function selectScenario(scenarioId) {
  tutorialState.scenarioId = getScenario(scenarioId).id;
  tutorialState.stepIndex = 0;
  const url = new URL(location.href);
  url.searchParams.set('scenario', tutorialState.scenarioId);
  history.replaceState(null, '', url);
  renderStep();
}

function getCurrentStep() {
  const scenario = getScenario(tutorialState.scenarioId);
  return { scenario, step: scenario.steps[tutorialState.stepIndex] };
}

function prepareStepView(step) {
  const selector = step.target || '';
  if (/agent|governance|multi-agent|reviewer|model-adapter/.test(selector)) setTab('agent');
  if (/module-/.test(selector)) setTab('module');
  if (/cdp-/.test(selector)) setTab('cdp');
  if (/utility-/.test(selector)) setTab('node');
  if (/snapshot|page-source|execute-page|navigate|#url/.test(selector)) setTab('page');
  if (/training-|target-page/.test(selector) && matchMedia('(max-width: 720px)').matches) {
    query('#target-preview').classList.add('mobile-visible');
  }
  if (/training-email|training-login-submit/.test(selector) && tutorialState.target.page !== 'login') {
    tutorialState.target = {
      ...tutorialState.target,
      url: 'https://training.blankseed.local/login',
      title: '登入 BlankSeed 練習站',
      page: 'login',
      loggedIn: false
    };
    renderTarget();
  }
  if (/training-logout/.test(selector) && !tutorialState.target.loggedIn) {
    tutorialState.target = {
      ...tutorialState.target,
      url: 'https://training.blankseed.local/dashboard',
      title: '教學儀表板',
      page: 'dashboard',
      loggedIn: true
    };
    renderTarget();
  }
  if (/model-panel|model-setup/.test(selector)) query('#model-setup').open = true;
  if (/model-panel-hosted/.test(selector)) selectModelPanel('hosted');
  if (/model-panel-local/.test(selector)) selectModelPanel('local');
}

function renderStep() {
  const { scenario, step } = getCurrentStep();
  queryAll('.scenario-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.scenarioId === scenario.id);
    button.setAttribute('aria-current', button.dataset.scenarioId === scenario.id ? 'step' : 'false');
  });
  query('#step-progress').textContent = `步驟 ${tutorialState.stepIndex + 1} / ${scenario.steps.length}`;
  query('#step-title').textContent = step.title;
  query('#step-body').textContent = step.body;
  query('#step-expected span').textContent = step.expected;
  const safety = query('#step-safety');
  safety.hidden = !step.safety;
  safety.querySelector('span').textContent = step.safety || '';
  query('#step-demo').hidden = !step.action;
  query('#step-previous').disabled = tutorialState.stepIndex === 0;
  query('#step-next').textContent = tutorialState.stepIndex === scenario.steps.length - 1 ? '重新開始' : '下一步';
  prepareStepView(step);
  requestAnimationFrame(() => locateCurrentStep({ scroll: true }));
}

function locateCurrentStep({ scroll = true } = {}) {
  const { step } = getCurrentStep();
  currentHighlightTarget?.classList.remove('tutorial-flash');
  currentHighlightTarget = step.target ? query(step.target) : null;
  const coachmark = query('#coachmark');
  if (!currentHighlightTarget) {
    coachmark.hidden = true;
    return;
  }
  if (scroll) currentHighlightTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  requestAnimationFrame(() => {
    const rect = currentHighlightTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      coachmark.hidden = true;
      return;
    }
    const padding = 6;
    coachmark.style.left = `${Math.max(3, rect.left - padding)}px`;
    coachmark.style.top = `${Math.max(3, rect.top - padding)}px`;
    coachmark.style.width = `${Math.min(innerWidth - Math.max(3, rect.left - padding) - 3, rect.width + padding * 2)}px`;
    coachmark.style.height = `${Math.min(innerHeight - Math.max(3, rect.top - padding) - 3, rect.height + padding * 2)}px`;
    coachmark.hidden = false;
    currentHighlightTarget.classList.add('tutorial-flash');
  });
}

function previousStep() {
  tutorialState.stepIndex = Math.max(0, tutorialState.stepIndex - 1);
  renderStep();
}

function nextStep() {
  const scenario = getScenario(tutorialState.scenarioId);
  tutorialState.stepIndex = tutorialState.stepIndex === scenario.steps.length - 1
    ? 0
    : tutorialState.stepIndex + 1;
  renderStep();
}

const demoActions = {
  showEvidence() {
    showResult({ status: 'ok', evidence: ['結果信封', '事件時間軸', '模組身份識別'], simulated: true });
    addTimeline('tutorial.evidence.reviewed', '結果與時間軸已對照', 'ok');
  },
  prepareExampleUrl() {
    setTab('page');
    query('#url', consoleRoot).value = 'https://example.com/';
  },
  navigateExample() {
    setTab('page');
    query('#url', consoleRoot).value = 'https://example.com/';
    navigate('https://example.com/');
  },
  snapshot() {
    setTab('page');
    query('#snapshot', consoleRoot).click();
  },
  openTrainingLogin() {
    setTab('page');
    query('#url', consoleRoot).value = 'https://training.blankseed.local/login';
    navigate('https://training.blankseed.local/login');
  },
  fillTrainingCredentials() {
    if (tutorialState.target.page !== 'login') demoActions.openTrainingLogin();
    query('#training-email').value = 'learner@example.test';
    query('#training-password').value = 'demo-only';
  },
  submitTrainingLogin() {
    if (tutorialState.target.page !== 'login') demoActions.openTrainingLogin();
    demoActions.fillTrainingCredentials();
    submitTrainingLogin();
  },
  preparePostLoginAgent() {
    if (!tutorialState.target.loggedIn) demoActions.submitTrainingLogin();
    setTab('agent');
    query('#agent-task', consoleRoot).value = '觀察目前已登入的教學儀表板；不要要求、讀取或回傳任何憑證，僅說明頁面內容。';
    updateTaskCount();
  },
  logoutTraining() {
    if (!tutorialState.target.loggedIn) demoActions.submitTrainingLogin();
    logoutTraining();
  },
  openAgentTab() {
    setTab('agent');
  },
  prepareAgentTask() {
    setTab('agent');
    query('#agent-task', consoleRoot).value = '唯讀觀察目前目標頁，回報頁面標題與主要內容。不要登入、送出表單或修改任何狀態；若需要額外權限，先停止並說明。';
    updateTaskCount();
  },
  runAgent() {
    demoActions.prepareAgentTask();
    runAgent();
  },
  generateCandidate() {
    setTab('agent');
    query('#agent-task', consoleRoot).value = '觀察目前目標頁，建立 generated.tutorial.summary@0.1.0 候選版本；功能只回傳 title[標題] 與簡短摘要。建立後停止，不要啟用。';
    updateTaskCount();
    addAgentMessage('user', '使用者', query('#agent-task', consoleRoot).value, '使用者指令');
    generateCandidate();
  },
  openModuleTab() {
    if (!tutorialState.modules.candidate && !tutorialState.modules.versions.some((item) => item.version === '0.1.0')) demoActions.generateCandidate();
    setTab('module');
  },
  testCandidate() {
    demoActions.openModuleTab();
    if (tutorialState.modules.candidate?.status === 'candidate') testCandidate();
  },
  commitCandidate() {
    demoActions.testCandidate();
    if (tutorialState.modules.candidate?.status === 'tested') commitCandidate();
  },
  activateModule() {
    demoActions.commitCandidate();
    setTab('module');
    query('#module-version', consoleRoot).value = '0.1.0';
    activateModule('0.1.0');
  },
  invokeModule() {
    demoActions.activateModule();
    invokeModule();
  },
  prepareGovernance() {
    prepareGovernance();
  },
  runGovernance() {
    runGovernance();
  },
  cancelGovernance() {
    if (!tutorialState.reviewDecision) runGovernance();
    cancelGovernance();
  },
  applyGovernance() {
    if (!tutorialState.reviewDecision) runGovernance();
    applyGovernance();
  },
  rollbackModule() {
    if (tutorialState.modules.activeVersion !== '0.1.0') {
      if (!tutorialState.reviewDecision) runGovernance();
      applyGovernance();
    }
    setTab('module');
    rollbackModule('0.0.1');
  },
  openModelSetup() {
    query('#model-setup').open = true;
    setTab('agent');
    query('#model-connection', consoleRoot).open = true;
  },
  showHostedSetup() {
    query('#model-setup').open = true;
    selectModelPanel('hosted');
  },
  simulateHostedAvailable() {
    tutorialState.hostedAvailable = true;
    populateAdapters();
    setTab('agent');
    query('#agent-adapter', consoleRoot).value = 'openai.gpt-5.6-terra';
    query('#reviewer-adapter', consoleRoot).value = 'openai.gpt-5.6-sol';
    query('#model-openai-badge', consoleRoot).classList.remove('unavailable');
    query('#model-openai-badge', consoleRoot).textContent = '教學模擬已接入';
    updateRunStatus('#model-configuration-status', '教學模擬：本機模型與 OpenAI 已就緒。', 'success');
    announce('教學模擬：Hosted adapters 已標示為可用。');
  },
  runModuleAutomation() {
    setTab('module');
    runModuleAutomationTutorial();
  },
  runModelSmoke() {
    demoActions.simulateHostedAvailable();
    query('#agent-task', consoleRoot).value = '唯讀觀察 https://example.com/，只回報頁面標題；不要執行其他動作。';
    updateTaskCount();
    runAgent({ modelSmoke: true });
  }
};

function runCurrentDemo() {
  const { step } = getCurrentStep();
  const action = demoActions[step.action];
  if (!action) return;
  action();
  announce(`已示範：${step.title}`);
  requestAnimationFrame(() => locateCurrentStep({ scroll: false }));
}

function selectModelPanel(panelId) {
  queryAll('.model-tab').forEach((button) => {
    const active = button.dataset.modelTab === panelId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  queryAll('.model-panel').forEach((panel) => {
    const active = panel.id === `model-panel-${panelId}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function wireTutorial() {
  buildScenarioNavigation();
  query('#step-previous').addEventListener('click', previousStep);
  query('#step-next').addEventListener('click', nextStep);
  query('#step-locate').addEventListener('click', () => locateCurrentStep({ scroll: true }));
  query('#step-demo').addEventListener('click', runCurrentDemo);
  query('#guide-close').addEventListener('click', () => {
    query('#guide-panel').hidden = true;
    query('#guide-toggle').style.display = 'flex';
    query('#guide-toggle').setAttribute('aria-expanded', 'false');
    query('#coachmark').hidden = true;
  });
  query('#guide-toggle').addEventListener('click', () => {
    query('#guide-panel').hidden = false;
    query('#guide-toggle').style.display = 'none';
    query('#guide-toggle').setAttribute('aria-expanded', 'true');
    renderStep();
  });
  queryAll('.model-tab').forEach((button) => {
    button.addEventListener('click', () => selectModelPanel(button.dataset.modelTab));
  });
  queryAll('.copy-code').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = query(`#${button.dataset.copyTarget}`).textContent;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = '已複製';
        setTimeout(() => { button.textContent = '複製指令'; }, 1400);
      } catch {
        announce('瀏覽器未允許 clipboard；請手動選取指令。');
      }
    });
  });
  addEventListener('resize', () => locateCurrentStep({ scroll: false }));
  addEventListener('scroll', () => locateCurrentStep({ scroll: false }), true);
}

async function initialize() {
  try {
    const localeSelect = query('#tutorial-locale');
    localeSelect.value = getLocale();
    localeSelect.addEventListener('change', (event) => {
      setLocale(event.target.value);
      refreshTutorialLocale();
    });
    applyBindings(document);
    observe(document.body);
    await loadReplica();
    applyBindings(consoleRoot);
    const replicaLocaleSelect = query('#ui-locale', consoleRoot);
    if (replicaLocaleSelect) {
      replicaLocaleSelect.value = getLocale();
      replicaLocaleSelect.addEventListener('change', (event) => {
        setLocale(event.target.value);
        refreshTutorialLocale();
      });
    }
    wireReplica();
    wireTutorial();
    renderStep();
    window.blankseedTutorialReady = true;
    document.documentElement.dataset.tutorialReady = 'true';
    announce('BlankSeed Browser 操作教學已就緒。');
  } catch (error) {
    const mount = query('#console-mount');
    mount.replaceChildren();
    const failure = document.createElement('div');
    failure.className = 'replica-loading';
    failure.textContent = `${error.message} 請從 starter 目錄執行 npm run tutorial，不能直接以 file:// 開啟。`;
    mount.append(failure);
    throw error;
  }
}

function refreshTutorialLocale() {
  globalThis.blankseedTutorialRefreshScenarios?.();
  scenarios = globalThis.blankseedTutorialScenarios;
  getScenario = globalThis.blankseedTutorialGetScenario;
  const locale = getLocale();
  query('#tutorial-locale').value = locale;
  const replicaLocaleSelect = query('#ui-locale', consoleRoot);
  if (replicaLocaleSelect) replicaLocaleSelect.value = locale;
  applyBindings(document);
  applyBindings(consoleRoot);
  buildScenarioNavigation();
  renderStatus();
  renderTarget();
  renderStep();
}

if (globalThis.blankseedTutorialLaunchGuard?.assessment?.allowed === false) {
  globalThis.blankseedTutorialLaunchGuard.renderRecovery();
} else {
  initialize();
}
