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
    'Target 目標頁',
    '檢查 Snapshot',
    '執行 Isolated JS',
    '執行 Node Source',
    '建立 Candidate',
    '測試 Candidate',
    'Commit 版本',
    'Activate 版本',
    'Invoke Module',
    'Rollback 版本',
    'Agent Runtime 任務',
    '啟動 Agent Run',
    '取消 Agent Run',
    'Multi-Agent Governance',
    '啟動 Governed Review',
    '確認並 Apply Decision',
    '取消 Multi-Agent Run',
    '建立 Checkpoint',
    'Restore Checkpoint',
    '全部停止',
    '事件時間軸'
  ]) {
    assert.ok(html.includes(label), `missing localized interface label: ${label}`);
  }

  for (const dynamicLabel of [
    '尚無 Target',
    'Node 已啟用',
    '尚無模組。',
    '尚無 Checkpoint。',
    '尚無事件。',
    '已要求停止',
    '已確認 / 剩餘',
    'Multi-Agent 待命。',
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
