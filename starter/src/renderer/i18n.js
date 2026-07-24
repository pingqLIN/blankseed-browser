(function installBlankSeedI18n(globalScope) {
  'use strict';

  // This module intentionally has no process bridge, network, or privileged API access.
  // UI copy is keyed here; protocol identifiers, evidence JSON, code, and page
  // payloads are deliberately outside this translation boundary.
  const DEFAULT_LOCALE = 'zh-TW';
  const SUPPORTED_LOCALES = Object.freeze(['zh-TW', 'zh-CN', 'en']);
  const LOCALE_STORAGE_KEY = 'blankseed.ui.locale';
  const sourceByNode = new WeakMap();
  const sourceByAttribute = new WeakMap();

  const entries = [
    ['locale.label', '介面語言', '界面语言', 'Interface language'],
    ['locale.zh-TW', '繁體中文', '繁體中文', 'Traditional Chinese'],
    ['locale.zh-CN', '简体中文', '简体中文', 'Simplified Chinese'],
    ['locale.en', 'English', 'English', 'English'],
    ['common.loading', '載入中', '加载中', 'Loading'],
    ['common.unknown', '未知', '未知', 'Unknown'],
    ['common.ready', '已就緒。', '已就绪。', 'Ready.'],
    ['common.refresh', '重新整理', '刷新', 'Refresh'],
    ['common.cancel', '取消', '取消', 'Cancel'],
    ['common.stop', '停止', '停止', 'Stop'],
    ['common.execute', '執行', '执行', 'Run'],
    ['common.back', '上一頁', '上一页', 'Back'],
    ['common.forward', '下一頁', '下一页', 'Forward'],
    ['common.go', '前往', '前往', 'Go'],
    ['console.title', 'BlankSeed Browser 控制台', 'BlankSeed Browser 控制台', 'BlankSeed Browser Console'],
    ['console.subtitle', '依步驟完成任務；每一步都保留證據與復原路徑。', '按步骤完成任务；每一步都保留证据与恢复路径。', 'Follow the workflow; every step retains evidence and a recovery path.'],
    ['console.target.loading', '目標頁載入中', '目标页加载中', 'Target page loading'],
    ['console.target.state', '目前目標頁狀態', '当前目标页状态', 'Current target-page status'],
    ['console.modelSettings', '模型設定', '模型设置', 'Model settings'],
    ['console.openModelSettings', '開啟 AI 模型接入設定', '打开 AI 模型接入设置', 'Open AI model connection settings'],
    ['console.refreshAll', '重新整理所有面板', '刷新所有面板', 'Refresh all panels'],
    ['status.context', '目前工作情境', '当前工作情境', 'Current work context'],
    ['status.session', '工作階段', '工作阶段', 'Session'],
    ['status.target', '目標頁', '目标页', 'Target page'],
    ['status.runtime', 'Node 執行環境', 'Node 执行环境', 'Node runtime'],
    ['status.modules', 'Module', 'Module', 'Modules'],
    ['status.modulesActive', '{count} 個啟用', '{count} 个启用', '{count} active'],
    ['status.noSession', '尚無工作階段', '暂无工作阶段', 'No session yet'],
    ['status.noTarget', '尚無目標頁', '暂无目标页', 'No target page'],
    ['status.noTitle', '無標題', '无标题', 'Untitled'],
    ['status.nodeEnabled', 'Node 已啟用', 'Node 已启用', 'Node enabled'],
    ['status.nodeDisabled', 'Node 未啟用', 'Node 未启用', 'Node disabled'],
    ['workflow.order', '任務執行順序', '任务执行顺序', 'Task workflow'],
    ['workflow.prepare', '準備', '准备', 'Prepare'],
    ['workflow.target', '目標', '目标', 'Target'],
    ['workflow.task', '任務', '任务', 'Task'],
    ['workflow.check', '檢查', '检查', 'Check'],
    ['workflow.run', '執行', '执行', 'Run'],
    ['workflow.evidence', '證據', '证据', 'Evidence'],
    ['workflow.current', '目前', '当前', 'Current'],
    ['workflow.waiting', '等待', '等待', 'Waiting'],
    ['workflow.available', '可用', '可用', 'Available'],
    ['workflow.complete', '完成', '完成', 'Complete'],
    ['workflow.running', '執行中', '执行中', 'Running'],
    ['workflow.needsAttention', '需處理', '需处理', 'Needs attention'],
    ['workflow.stopped', '已停止', '已停止', 'Stopped'],
    ['workflow.alwaysAvailable', '隨時可用', '随时可用', 'Always available'],
    ['workflow.gotoStep', '前往步驟 {step} {title}；狀態：{status}', '前往步骤 {step} {title}；状态：{status}', 'Go to step {step}, {title}; status: {status}'],
    ['workflow.panelWidth', '控制介面寬度 {width} 像素', '控制界面宽度 {width} 像素', 'Control surface width {width} pixels'],
    ['prepare.subtitle', '先確認模型接入與本機執行環境；執行期間會鎖定設定，避免半途切換。', '先确认模型接入与本地执行环境；执行期间会锁定设置，避免中途切换。', 'Confirm the model connection and local runtime first; settings lock while work is running to avoid an in-flight change.'],
    ['prepare.modelConnection', 'AI 模型接入', 'AI 模型接入', 'AI model connection'],
    ['prepare.localOrOpenAI', '本機或 OpenAI', '本地或 OpenAI', 'Local or OpenAI'],
    ['prepare.localModel', '本機模型', '本地模型', 'Local model'],
    ['prepare.localEndpoint', '本機端點', '本地端点', 'Local endpoint'],
    ['prepare.applyLocal', '套用本機設定', '应用本地设置', 'Apply local settings'],
    ['prepare.configured', '已設定', '已设置', 'Configured'],
    ['prepare.notConnected', '尚未接入', '尚未接入', 'Not connected'],
    ['prepare.connectOpenAI', '接入 OpenAI', '接入 OpenAI', 'Connect OpenAI'],
    ['prepare.clearTemporaryKey', '清除暫時金鑰', '清除临时密钥', 'Clear temporary key'],
    ['target.subtitle', '設定可信的任務上下文。若任務不需要網頁，可以明確跳過此步驟。', '设置可信的任务上下文。若任务不需要网页，可以明确跳过此步骤。', 'Set trusted task context. Explicitly skip this step when the task does not require a web page.'],
    ['target.page', '目標頁', '目标页', 'Target page'],
    ['target.url', '目標網址', '目标网址', 'Target URL'],
    ['target.waiting', '等待目標頁', '等待目标页', 'Waiting for a target page'],
    ['target.snapshot', '擷取頁面快照', '获取页面快照', 'Capture page snapshot'],
    ['target.noPage', '此任務不需要網頁', '此任务不需要网页', 'This task does not need a web page'],
    ['task.subtitle', '用自然語言描述目標、限制與期待結果，不限制為預設動作清單。', '用自然语言描述目标、限制与预期结果，不限制为预设动作清单。', 'Describe goals, limits, and expected outcomes in natural language; tasks are not restricted to a preset action list.'],
    ['task.forAgent', '給 Agent 的任務', '给 Agent 的任务', 'Task for the agent'],
    ['task.shortcut', 'Ctrl + Enter 可在檢查通過後執行', 'Ctrl + Enter 可在检查通过后执行', 'Press Ctrl + Enter to run after checks pass'],
    ['task.placeholder', '輸入你想讓 Agent 執行的任務…', '输入你想让 Agent 执行的任务…', 'Enter the task you want the agent to perform…'],
    ['task.modelAdapter', '模型 Adapter', '模型 Adapter', 'Model adapter'],
    ['task.reasoning', '推理等級', '推理等级', 'Reasoning effort'],
    ['task.maxTurns', '最大回合', '最大轮次', 'Maximum turns'],
    ['task.maxActions', '最大動作', '最大动作', 'Maximum actions'],
    ['check.subtitle', '執行前先確認必要條件；被阻擋時會直接說明修正方式。', '执行前先确认必要条件；被阻挡时会直接说明修正方式。', 'Confirm prerequisites before running; blockers state how to correct them.'],
    ['check.beforeRun', '執行前檢查', '执行前检查', 'Pre-run checks'],
    ['check.stopRecovery', '停止與復原', '停止与恢复', 'Stop and recovery'],
    ['check.start', '檢查並開始執行', '检查并开始执行', 'Check and start'],
    ['check.stopTask', '停止目前任務', '停止当前任务', 'Stop current task'],
    ['execute.subtitle', '使用者、Agent、Reviewer 與治理訊息分開呈現；不會把確認埋在原始 JSON 裡。', '用户、Agent、Reviewer 与治理消息分开呈现；不会把确认埋在原始 JSON 中。', 'User, agent, reviewer, and governance messages are separated; confirmations are never hidden in raw JSON.'],
    ['execute.agentMessages', 'Agent 訊息', 'Agent 消息', 'Agent messages'],
    ['execute.clearMessages', '清除訊息', '清除消息', 'Clear messages'],
    ['evidence.subtitle', '先讀摘要與下一步；完整 JSON、事件與識別碼都可展開閱讀。', '先读摘要与下一步；完整 JSON、事件与标识符都可展开阅读。', 'Read the summary and next step first; full JSON, events, and identifiers remain expandable.'],
    ['evidence.stopCheckpoint', '停止與 checkpoint', '停止与 checkpoint', 'Stop and checkpoint'],
    ['evidence.stopAll', '全部停止', '全部停止', 'Stop all'],
    ['evidence.result', '完整操作結果', '完整操作结果', 'Full operation result'],
    ['evidence.clearResult', '清除結果', '清除结果', 'Clear result'],
    ['evidence.timeline', '事件時間軸', '事件时间轴', 'Event timeline'],
    ['evidence.showJson', '顯示或收合 JSON', '显示或收合 JSON', 'Show or collapse JSON'],
    ['evidence.showEvents', '顯示或收合事件證據', '显示或收合事件证据', 'Show or collapse event evidence'],
    ['advanced.tools', '進階工具', '高级工具', 'Advanced tools'],
    ['advanced.workspace', '進階工作台', '高级工作台', 'Advanced workspace'],
    ['advanced.pageIsolated', '隔離 Page JS', '隔离 Page JS', 'Isolated Page JS'],
    ['advanced.cdpRaw', 'CDP 原始操作', 'CDP 原始操作', 'Raw CDP operation'],
    ['advanced.nodeRuntime', 'Node 執行', 'Node 执行', 'Node execution'],
    ['advanced.moduleWorkflow', 'Module 工作流程', 'Module 工作流', 'Module workflow'],
    ['advanced.governance', 'Governance 治理', 'Governance 治理', 'Governance'],
    ['module.status.candidate', '候選', '候选', 'Candidate'],
    ['module.status.tested', '已測試', '已测试', 'Tested'],
    ['module.status.committed', '已提交', '已提交', 'Committed'],
    ['module.active', '已啟用', '已启用', 'Active'],
    ['module.none', '尚無模組。', '暂无模块。', 'No modules yet.'],
    ['checkpoint.none', '尚無檢查點。', '暂无检查点。', 'No checkpoints yet.'],
    ['checkpoint.label', 'Checkpoint 標籤', 'Checkpoint 标签', 'Checkpoint label'],
    ['checkpoint.defaultLabel', '手動檢查點', '手动检查点', 'Manual checkpoint'],
    ['checkpoint.id', '所選 checkpoint ID', '所选 checkpoint ID', 'Selected checkpoint ID'],
    ['event.none', '尚無事件。', '暂无事件。', 'No events yet.'],
    ['event.event', '事件', '事件', 'Event'],
    ['agent.idle', 'Agent 待命。', 'Agent 待命。', 'Agent standing by.'],
    ['agent.emptyTitle', '尚無 Agent 訊息', '暂无 Agent 消息', 'No agent messages yet'],
    ['agent.emptyBody', '在下方輸入指令；Agent 回覆與受控審核結果會集中顯示在這裡。', '在下方输入指令；Agent 回复与受控审核结果会集中显示在这里。', 'Enter an instruction below; agent replies and governed-review results appear here.'],
    ['governance.idle', '多代理待命。', '多代理待命。', 'Multi-agent review standing by.'],
    ['automation.idle', '自動化流程待命。', '自动化流程待命。', 'Automation standing by.'],
    ['stop.idle', '待命', '待命', 'Standing by'],
    ['operation.none', '尚未執行操作', '尚未执行操作', 'No operation has run'],
    ['operation.noneNext', '完成前四步後開始執行；發生錯誤時可從這裡查看修正方式。', '完成前四步后开始执行；发生错误时可从这里查看修正方式。', 'Run after the first four steps; use this area to find a corrective action if an error occurs.'],
    ['operation.done', '操作已完成。', '操作已完成。', 'Operation completed.'],
    ['operation.success', '操作已成功完成。', '操作已成功完成。', 'Operation completed successfully.'],
    ['operation.result', '操作已完成並留下結果。', '操作已完成并保留结果。', 'Operation completed and retained its result.'],
    ['operation.stopped', '操作已停止；請檢查目前狀態後再繼續。', '操作已停止；请检查当前状态后再继续。', 'Operation stopped; inspect the current state before continuing.'],
    ['operation.resultCleared', '結果顯示已清除', '结果显示已清除', 'Result display cleared'],
    ['operation.resultClearedNext', '事件證據仍保留；可重新執行操作或重新整理事件時間軸。', '事件证据仍保留；可重新执行操作或刷新事件时间轴。', 'Event evidence is retained; rerun an operation or refresh the event timeline.'],
    ['tutorial.title', 'BlankSeed Browser 操作教學', 'BlankSeed Browser 操作教程', 'BlankSeed Browser Tutorial'],
    ['tutorial.language', '教學語言', '教程语言', 'Tutorial language'],
    ['tutorial.loading', '正在載入現行 BlankSeed UI…', '正在加载当前 BlankSeed UI…', 'Loading the current BlankSeed UI…'],
    ['tutorial.guide', '操作教學', '操作教程', 'Tutorial'],
    ['tutorial.interactive', '互動式操作教學', '交互式操作教程', 'Interactive tutorial'],
    ['tutorial.simulation', '教學模擬', '教程模拟', 'Tutorial simulation'],
    ['tutorial.expected', '預期結果', '预期结果', 'Expected result'],
    ['tutorial.safety', '安全提醒', '安全提醒', 'Safety reminder'],
    ['tutorial.next', '下一步', '下一步', 'Next'],
    ['tutorial.previous', '上一步', '上一步', 'Previous'],
    ['tutorial.restart', '重新開始', '重新开始', 'Restart'],
    ['tutorial.locate', '定位控制項', '定位控件', 'Locate control'],
    ['tutorial.demo', '示範這一步', '演示这一步', 'Demonstrate this step'],
    ['tutorial.copy', '複製指令', '复制命令', 'Copy command'],
    ['tutorial.copied', '已複製', '已复制', 'Copied'],
    ['tutorial.stepProgress', '步驟 {current} / {total}', '步骤 {current} / {total}', 'Step {current} / {total}'],
    ['launch.title', '已攔截不正確的教學載入方式', '已拦截不正确的教程加载方式', 'Incorrect tutorial launch blocked'],
    ['launch.fileProtocol', '教學頁不能直接以 file:// 開啟，因為它需要從本機教學伺服器載入正式介面。', '教程页不能直接以 file:// 打开，因为它需要从本地教程服务器加载正式界面。', 'The tutorial cannot open with file:// because it loads the product UI from the local tutorial server.'],
    ['launch.nonLoopback', '教學頁只允許從本機回環網址啟動，避免把操作介面暴露到外部網路。', '教程页只允许从本地回环网址启动，避免将操作界面暴露到外部网络。', 'The tutorial only runs on a loopback URL so its controls are not exposed to an external network.'],
    ['launch.runStarter', '在 starter 目錄執行下列啟動指令。', '在 starter 目录执行下列启动命令。', 'Run the following launch command from the starter directory.'],
    ['launch.clickShortcut', '雙擊下列快捷啟動檔；它會啟動本機教學伺服器並自動開啟正確網址。', '双击下列快捷启动文件；它会启动本地教程服务器并自动打开正确网址。', 'Double-click the shortcut below to start the local tutorial server and open the correct URL.'],
    ['launch.closeTab', '完成後可關閉這個錯誤分頁。', '完成后可关闭这个错误分页。', 'You can close this error tab when finished.'],
    ['launch.shortcut', '快捷啟動檔', '快捷启动文件', 'Launch shortcut'],
    ['launch.powershell', 'PowerShell 輔助啟動指令', 'PowerShell 辅助启动命令', 'PowerShell launch command'],
    ['launch.copy', '複製啟動指令', '复制启动命令', 'Copy launch command'],
    ['launch.checkUrl', '檢查正確網址', '检查正确网址', 'Check the correct URL'],
    ['launch.copied', '已複製啟動指令。', '已复制启动命令。', 'Launch command copied.'],
    ['launch.copyDenied', '瀏覽器未允許自動複製；指令已選取，請按 Ctrl+C。', '浏览器未允许自动复制；命令已选中，请按 Ctrl+C。', 'The browser did not allow clipboard access; the command is selected, so press Ctrl+C.']
  ];

  const catalogs = Object.freeze(Object.fromEntries(SUPPORTED_LOCALES.map((locale, index) => [locale, Object.freeze(Object.fromEntries(entries.map(([key, tw, cn, en]) => [key, [tw, cn, en][index]])))])));
  const sourceKeys = Object.freeze(Object.fromEntries(entries.map(([key, source]) => [source, key])));
  const extensionCatalogs = Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, new Map()]));

  function resolveLocale(candidate, languages = globalScope.navigator?.languages || []) {
    if (SUPPORTED_LOCALES.includes(candidate)) return candidate;
    for (const language of languages) {
      const normalized = String(language || '').toLowerCase();
      if (normalized.startsWith('zh-hant') || normalized === 'zh-tw' || normalized === 'zh-hk') return 'zh-TW';
      if (normalized.startsWith('zh-hans') || normalized === 'zh-cn' || normalized === 'zh-sg') return 'zh-CN';
      if (normalized.startsWith('en')) return 'en';
    }
    return DEFAULT_LOCALE;
  }

  function readStoredLocale() {
    try { return globalScope.localStorage?.getItem(LOCALE_STORAGE_KEY) || ''; } catch { return ''; }
  }

  let activeLocale = resolveLocale(readStoredLocale());
  function getLocale() { return activeLocale; }
  function setLocale(candidate) {
    activeLocale = resolveLocale(candidate);
    try { globalScope.localStorage?.setItem(LOCALE_STORAGE_KEY, activeLocale); } catch { /* session-only fallback */ }
    return activeLocale;
  }

  function t(key, params = {}, fallback = `[[missing:${key}]]`) {
    const template = extensionCatalogs[activeLocale].get(key) ?? catalogs[activeLocale]?.[key]
      ?? extensionCatalogs[DEFAULT_LOCALE].get(key) ?? catalogs[DEFAULT_LOCALE]?.[key]
      ?? extensionCatalogs.en.get(key) ?? catalogs.en?.[key] ?? fallback;
    return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
  }

  function translateSource(source, fallback = source) {
    if (typeof source !== 'string') return source;
    const key = sourceKeys[source];
    return key ? t(key) : fallback;
  }

  function formatTime(value, options = { hour12: false }) {
    return new Intl.DateTimeFormat(activeLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit', ...options }).format(new Date(value));
  }

  function attributeSources(element) {
    let sources = sourceByAttribute.get(element);
    if (!sources) {
      sources = new Map();
      sourceByAttribute.set(element, sources);
    }
    return sources;
  }

  function translateTextNodes(root) {
    const documentRef = root.ownerDocument || globalScope.document;
    if (!documentRef?.createTreeWalker) return;
    const walker = documentRef.createTreeWalker(root, globalScope.NodeFilter?.SHOW_TEXT ?? 4);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement?.closest('script, style, code, pre, textarea, [data-i18n-skip], [data-i18n]')) continue;
      const current = node.nodeValue;
      const source = sourceByNode.get(node) ?? current;
      const translated = translateSource(source);
      sourceByNode.set(node, source);
      if (translated !== current) node.nodeValue = translated;
    }
  }

  function translateAttributes(root) {
    const elements = [root, ...(root.querySelectorAll?.('*') || [])];
    for (const element of elements) {
      if (!element?.getAttributeNames) continue;
      for (const attribute of ['title', 'placeholder', 'aria-label', 'aria-valuetext']) {
        if (!element.hasAttribute(attribute)) continue;
        if (element.dataset?.i18nAttr?.split(';').some((binding) => binding.trim().startsWith(`${attribute}:`))) continue;
        const sources = attributeSources(element);
        const current = element.getAttribute(attribute);
        const source = sources.get(attribute) ?? current;
        const translated = translateSource(source);
        sources.set(attribute, source);
        if (translated !== current) element.setAttribute(attribute, translated);
      }
    }
  }

  function applyBindings(root = globalScope.document) {
    if (!root) return activeLocale;
    if (globalScope.document?.documentElement) {
      const language = activeLocale === 'zh-TW' ? 'zh-Hant-TW' : activeLocale === 'zh-CN' ? 'zh-Hans-CN' : 'en';
      if (globalScope.document.documentElement.lang !== language) globalScope.document.documentElement.lang = language;
    }
    for (const element of root.querySelectorAll?.('[data-i18n]') || []) {
      const translated = t(element.dataset.i18n);
      if (element.textContent !== translated) element.textContent = translated;
    }
    for (const element of root.querySelectorAll?.('[data-i18n-attr]') || []) {
      for (const binding of element.dataset.i18nAttr.split(';')) {
        const [attribute, key] = binding.split(':').map((part) => part.trim());
        if (!attribute || !key) continue;
        const translated = t(key);
        if (element.getAttribute(attribute) !== translated) element.setAttribute(attribute, translated);
      }
    }
    translateTextNodes(root);
    translateAttributes(root);
    return activeLocale;
  }

  function observe(root = globalScope.document?.body) {
    if (!root || !globalScope.MutationObserver || root.dataset?.i18nObserved === 'true') return;
    root.dataset.i18nObserved = 'true';
    const observer = new globalScope.MutationObserver(() => applyBindings(root));
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label', 'aria-valuetext'] });
  }

  function registerMessages(messages) {
    for (const [key, tw, cn, en] of messages) {
      if (![key, tw, cn, en].every((value) => typeof value === 'string' && value.trim())) throw new TypeError(`Invalid localized message: ${key}`);
      extensionCatalogs['zh-TW'].set(key, tw);
      extensionCatalogs['zh-CN'].set(key, cn);
      extensionCatalogs.en.set(key, en);
    }
  }
  function catalogKeys() { return Object.freeze([...new Set([...Object.keys(catalogs[DEFAULT_LOCALE]), ...extensionCatalogs[DEFAULT_LOCALE].keys()])].sort()); }
  function catalogFor(locale) { return Object.freeze({ ...catalogs[resolveLocale(locale)], ...Object.fromEntries(extensionCatalogs[resolveLocale(locale)]) }); }
  function sourceKeyFor(source) { return sourceKeys[source] || null; }

  globalScope.BlankSeedI18n = Object.freeze({
    DEFAULT_LOCALE, SUPPORTED_LOCALES, LOCALE_STORAGE_KEY, resolveLocale, getLocale, setLocale, t, translateSource,
    formatTime, applyBindings, observe, catalogKeys, catalogFor, registerMessages, sourceKeyFor
  });
})(globalThis);
