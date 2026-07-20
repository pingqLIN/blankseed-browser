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
    '產生快照',
    '執行隔離 JS',
    '執行 Node 程式',
    '建立候選',
    '測試候選',
    '提交版本',
    '啟用版本',
    '呼叫 Module',
    '回復版本',
    'Agent 訊息',
    '給 Agent 的任務',
    '>執行<',
    '>停止<',
    '執行設定',
    'AI 模型接入',
    '本機模型',
    '接入 OpenAI',
    '清除暫時金鑰',
    '預設使用自動化流程',
    '開始產生與測試模組',
    '手動操作（進階）',
    'Governance 治理',
    '沙盒 Agent 自動套用',
    '一般 Runtime 維持人工確認',
    '啟動受控審核',
    '確認並套用決策',
    '取消審核',
    '建立檢查點',
    '還原檢查點',
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
  const [html, app, preload, contracts, main] = await Promise.all([
    readFile(resolve(starterRoot, 'src/renderer/index.html'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/app.js'), 'utf8'),
    readFile(resolve(starterRoot, 'src/preload/preload.cjs'), 'utf8'),
    readFile(resolve(starterRoot, 'src/shared/contracts.cjs'), 'utf8'),
    readFile(resolve(starterRoot, 'src/main/main.cjs'), 'utf8')
  ]);

  assert.match(html, /id="model-local-endpoint"/);
  assert.match(html, /id="model-openai-key" type="password"/);
  assert.match(html, /id="module-auto-enabled" type="checkbox" checked/);
  assert.match(html, /id="confirmation-dialog"/);
  assert.match(html, /<button value="no"[^>]*>NO<\/button>/);
  assert.match(html, /<button value="yes"[^>]*>YES<\/button>/);
  assert.match(app, /async function runModuleAutomation\(\)/);
  assert.match(app, /await requestConfirmation\(\s*'提交版本？'/);
  assert.match(app, /await requestConfirmation\(\s*'啟用版本？'/);
  assert.match(app, /createCandidate[\s\S]*testCandidate[\s\S]*commitCandidate[\s\S]*activate[\s\S]*invoke/);
  assert.match(app, /tested\.passed !== true/);
  assert.match(app, /invocation\.status !== 'ok'/);
  assert.match(preload, /setOpenAICredential/);
  assert.match(contracts, /modelConfigurationOpenAISet/);
  assert.match(main, /registerIpc\(\{[\s\S]*modelTurnManager,\s*modelConfiguration,/);
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

  assert.match(styles, /--control-panel-width:\s*430px/);
  assert.match(styles, /main\s*\{[^}]*width:\s*min\(100%, var\(--control-panel-width\)\)/s);
  assert.match(styles, /main\s*\{[^}]*height:\s*100vh/s);
  assert.match(styles, /main\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /scrollbar-gutter:\s*stable/);
  assert.match(app, /style\.setProperty\('--control-panel-width'/);
  assert.match(app, /window\.blankseedConsoleReady = false;[\s\S]*refreshAll\(\)\.finally\([\s\S]*window\.blankseedConsoleReady = true/);
});
