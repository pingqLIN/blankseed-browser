import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const starterRoot = resolve(import.meta.dirname, '..');

test('renderer presents a complete Traditional Chinese control surface', async () => {
  const [html, app] = await Promise.all([
    readFile(resolve(starterRoot, 'src/renderer/index.html'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/app.js'), 'utf8')
  ]);

  assert.match(html, /<html lang="zh-Hant-TW">/);
  for (const label of [
    'BlankSeed Browser 控制台',
    '目標頁',
    '擷取頁面快照',
    '隔離 Page JS',
    '執行 Node 程式',
    '建立候選',
    '測試候選',
    '提交版本',
    '啟用版本',
    '呼叫 Module',
    '回復版本',
    'Agent 訊息',
    '給 Agent 的任務',
    '檢查並開始執行',
    '停止目前任務',
    '執行設定',
    'AI 模型接入',
    '本機模型',
    '接入 OpenAI',
    '清除暫時金鑰',
    '使用受控自動流程',
    '開始建立並測試',
    '手動操作',
    'Governance 治理',
    '沙盒 Agent 自動套用',
    '一般 Runtime 維持人工確認',
    '啟動受控審核',
    '確認並套用決策',
    '取消審核',
    '建立 checkpoint',
    '還原所選 checkpoint',
    '全部停止',
    '事件時間軸'
  ]) {
    assert.ok(html.includes(label), `missing localized interface label: ${label}`);
  }

  for (const dynamicLabel of [
    '尚無目標頁',
    'Node 已啟用',
    '尚無模組。',
    '尚無檢查點。',
    '尚無事件。',
    '已要求停止',
    '已確認 / 剩餘',
    '多代理待命。',
    "candidate: '候選'",
    "tested: '已測試'",
    "committed: '已提交'",
    "isActive ? '已啟用'",
    '已就緒。'
  ]) {
    assert.ok(app.includes(dynamicLabel), `missing localized dynamic label: ${dynamicLabel}`);
  }

  assert.match(app, /moduleStatusLabel\(manifest\.status\)/);
});

test('renderer provides direct model configuration and default module automation with explicit gates', async () => {
  const [html, app, preload, contracts, main, ipcRouter, evolutionLoop] = await Promise.all([
    readFile(resolve(starterRoot, 'src/renderer/index.html'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/app.js'), 'utf8'),
    readFile(resolve(starterRoot, 'src/preload/preload.cjs'), 'utf8'),
    readFile(resolve(starterRoot, 'src/shared/contracts.cjs'), 'utf8'),
    readFile(resolve(starterRoot, 'src/main/main.cjs'), 'utf8'),
    readFile(resolve(starterRoot, 'src/main/ipc-router.cjs'), 'utf8'),
    readFile(resolve(starterRoot, 'src/main/evolution-loop.cjs'), 'utf8')
  ]);

  assert.match(html, /id="model-local-endpoint"/);
  assert.match(html, /id="model-openai-key" type="password"/);
  assert.match(html, /id="open-model-settings"/);
  assert.match(html, /尚未註冊為此程式的模型 Adapter/);
  assert.match(html, /id="module-auto-enabled" type="checkbox" checked/);
  assert.match(html, /id="confirmation-dialog"/);
  assert.match(html, /<button value="no"[^>]*>NO，返回檢查<\/button>/);
  assert.match(html, /<button value="yes"[^>]*>YES，繼續<\/button>/);
  assert.match(app, /async function runModuleAutomation\(\)/);
  assert.match(app, /function openModelSettings\(\)/);
  assert.match(app, /\$\('open-model-settings'\)\.addEventListener\('click', openModelSettings\)/);
  assert.match(app, /await requestConfirmation\(\s*'提交版本？'/);
  assert.match(app, /await requestConfirmation\(\s*'啟用版本？'/);
  assert.match(app, /await requestConfirmation\(\s*'提交所選候選？'/);
  assert.match(app, /await requestConfirmation\(\s*'啟用所選版本？'/);
  assert.match(app, /await requestConfirmation\(\s*'回復所選版本？'/);
  assert.match(app, /allowedTools: \[\.\.\.uiAgentTools\]/);
  assert.match(app, /createCandidate[\s\S]*testCandidate[\s\S]*commitCandidate[\s\S]*activate[\s\S]*invoke/);
  assert.match(app, /tested\.passed !== true/);
  assert.match(app, /invocation\.status !== 'ok'/);
  assert.match(preload, /setOpenAICredential/);
  assert.match(preload, /commitCandidate:[^\n]+confirmed: options\?\.confirmed === true/);
  assert.match(preload, /activate:[^\n]+confirmed: options\?\.confirmed === true/);
  assert.match(preload, /rollback:[^\n]+confirmed: options\?\.confirmed === true/);
  assert.match(contracts, /modelConfigurationOpenAISet/);
  assert.match(main, /registerIpc\(\{[\s\S]*modelTurnManager,\s*modelConfiguration,/);
  assert.match(ipcRouter, /Module Commit requires explicit operator confirmation/);
  assert.match(ipcRouter, /Module Activate requires explicit operator confirmation/);
  assert.match(ipcRouter, /Module Rollback requires explicit operator confirmation/);
  assert.match(
    evolutionLoop,
    /\.filter\(\(name\) => !\['module_candidate_commit', 'module_activate', 'module_rollback'\]\.includes\(name\)\)/
  );
});

test('renderer separates the Agent transcript from the user instruction composer', async () => {
  const [html, app] = await Promise.all([
    readFile(resolve(starterRoot, 'src/renderer/index.html'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/app.js'), 'utf8')
  ]);

  assert.match(html, /<section class="agent-transcript" aria-labelledby="agent-messages-title">/);
  assert.match(html, /id="agent-messages" class="agent-messages" role="log"/);
  assert.match(html, /<section class="agent-composer" aria-labelledby="agent-composer-title">/);
  assert.match(html, /<label id="agent-composer-title" for="agent-task">給 Agent 的任務<\/label>/);
  assert.match(html, /id="agent-task"[^>]+maxlength="12000"/);
  assert.match(app, /addAgentMessage\('user', task/);
  assert.match(app, /addAgentMessage\('agent', output/);
  assert.match(app, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(app, /event\.key === 'Enter'/);
});

test('renderer presents a guarded six-step task workflow without hiding advanced capabilities', async () => {
  const [html, app, styles] = await Promise.all([
    readFile(resolve(starterRoot, 'src/renderer/index.html'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/app.js'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/styles.css'), 'utf8')
  ]);

  assert.equal((html.match(/data-workflow-step="[1-6]"/g) || []).length, 6);
  assert.equal((html.match(/id="workflow-step-[1-6]"/g) || []).length, 6);
  assert.match(html, /<main data-workflow-contract="prepare,target-context,describe-task,system-check,execute-confirm,evidence-recovery">/);
  assert.match(html, /id="task-no-target" type="checkbox"/);
  assert.match(html, /id="workflow-blocker"[^>]+role="status"/);
  assert.match(html, /id="agent-task-error"[^>]+role="alert"/);
  assert.match(html, /id="checkpoint-error"[^>]+role="alert"/);
  assert.match(html, /id="advanced-tools"/);
  assert.match(html, /<label id="page-source-label" for="page-source">Page JS 原始碼/);
  assert.match(html, /<label id="utility-source-label" for="utility-source">Generated Node 原始碼/);
  assert.equal((html.match(/class="workflow-stage"[^>]+tabindex="-1"/g) || []).length, 6);
  assert.match(app, /function workflowPrerequisites\(\)/);
  assert.match(app, /function renderWorkflow\(\)/);
  assert.match(app, /row\.dataset\.messageId = message\.id/);
  assert.match(app, /if \(renderedIds\.has\(message\.id\)\) continue/);
  assert.match(app, /target\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /function classifyResult\(value\)/);
  assert.match(app, /errorCode === 'EXECUTION_CANCELLED'/);
  assert.match(app, /button\.setAttribute\('aria-label', `前往步驟/);
  assert.match(app, /button\.setAttribute\('aria-current', 'step'\)/);
  assert.match(app, /await requestConfirmation\(\s*'還原所選 checkpoint？'/);
  assert.match(app, /await requestConfirmation\(\s*'套用治理決策？'/);
  assert.doesNotMatch(app, /window\.confirm\(/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(styles, /text-overflow:\s*ellipsis/);
});

test('renderer tabs expose keyboard and ARIA state without translating protocol identifiers', async () => {
  const [html, app] = await Promise.all([
    readFile(resolve(starterRoot, 'src/renderer/index.html'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/app.js'), 'utf8')
  ]);

  assert.match(html, /role="tablist"/);
  assert.equal((html.match(/role="tab"/g) || []).length, 5);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 5);
  assert.match(app, /button\.setAttribute\('aria-selected', String\(isActive\)\)/);
  assert.match(app, /event\.key === 'ArrowRight'/);
  assert.match(app, /event\.key === 'ArrowLeft'/);

  for (const technicalTerm of [
    'Page.getNavigationHistory',
    'module-candidate',
    'requestId',
    'window.blankseed'
  ]) {
    assert.ok(`${html}\n${app}`.includes(technicalTerm), `technical term changed: ${technicalTerm}`);
  }
});

test('renderer keeps the complete control surface in an independently scrollable left rail', async () => {
  const [styles, app] = await Promise.all([
    readFile(resolve(starterRoot, 'src/renderer/styles.css'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/app.js'), 'utf8')
  ]);

  assert.match(styles, /--control-panel-width:\s*500px/);
  assert.match(styles, /main\s*\{[^}]*width:\s*min\(100%, var\(--control-panel-width\)\)/s);
  assert.match(styles, /main\s*\{[^}]*height:\s*100vh/s);
  assert.match(styles, /main\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /scrollbar-gutter:\s*stable/);
  assert.match(app, /style\.setProperty\('--control-panel-width'/);
  assert.match(app, /window\.blankseedConsoleReady = false;[\s\S]*refreshAll\(\)\.finally\([\s\S]*window\.blankseedConsoleReady = true/);
});

test('UI V2 verification declares the non-recursive artifact hash policy', async () => {
  const [writer, report] = await Promise.all([
    readFile(resolve(starterRoot, 'scripts/write-ui-v2-verification.mjs'), 'utf8'),
    readFile(resolve(starterRoot, 'reports/ui-v2/README.md'), 'utf8')
  ]);

  assert.match(writer, /artifactHashPolicy:\s*\{/);
  assert.match(writer, /excludedOutput: 'starter\/reports\/ui-v2\/verification\.json'/);
  assert.match(writer, /avoid recursive self-reference/);
  assert.match(report, /intentionally excludes itself from its `artifacts` array/);
});
