import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const starterRoot = resolve(import.meta.dirname, '..');
const [i18nSource, scenarioSource] = await Promise.all([
  readFile(resolve(starterRoot, 'src/renderer/i18n.js'), 'utf8'),
  readFile(resolve(starterRoot, 'tutorial/scenarios.js'), 'utf8')
]);
const sandbox = { Intl, globalThis: { navigator: { languages: [] }, localStorage: null } };
vm.runInNewContext(i18nSource, sandbox, { filename: 'i18n.js' });
vm.runInNewContext(scenarioSource, sandbox, { filename: 'scenarios.js' });
const i18n = sandbox.globalThis.BlankSeedI18n;

function visibleCopy(scenarios) {
  return scenarios.flatMap((scenario) => [
    scenario.label,
    scenario.summary,
    ...scenario.steps.flatMap((step) => [step.title, step.body, step.expected, ...(step.safety ? [step.safety] : [])])
  ]);
}

test('every tutorial scenario field is registered in the shared three-language catalog', () => {
  const messages = sandbox.globalThis.blankseedTutorialScenarioMessages;
  const expectedCount = visibleCopy(sandbox.globalThis.blankseedTutorialScenarios).length;
  assert.equal(messages.length, expectedCount);
  for (const [key, tw, cn, en] of messages) {
    assert.match(key, /^tutorial\.scenario\./);
    assert.ok(tw.trim() && cn.trim() && en.trim(), `${key} has incomplete translations`);
  }
});

test('scenario locale refresh changes visible copy but preserves targets, actions, and protocol IDs', () => {
  const before = sandbox.globalThis.blankseedTutorialGetScenario('governance');
  const beforeTarget = before.steps[1].target;
  const beforeAction = before.steps[1].action;

  i18n.setLocale('en');
  sandbox.globalThis.blankseedTutorialRefreshScenarios();
  const english = sandbox.globalThis.blankseedTutorialGetScenario('governance');
  assert.equal(english.label, 'Approve, cancel, and roll back');
  assert.equal(i18n.catalogFor('en')['tutorial.scenario.governance.step.1.body'], english.steps[1].body);
  assert.equal(i18n.catalogFor('zh-CN')['tutorial.scenario.governance.step.1.body'].trim().length > 0, true);
  assert.equal(english.steps[1].target, beforeTarget);
  assert.equal(english.steps[1].action, beforeAction);
  assert.doesNotMatch(english.steps[1].body, /[\u3400-\u9fff]/);

  i18n.setLocale('zh-CN');
  sandbox.globalThis.blankseedTutorialRefreshScenarios();
  const simplified = sandbox.globalThis.blankseedTutorialGetScenario('governance');
  assert.equal(simplified.steps[1].target, beforeTarget);
  assert.notEqual(simplified.label, before.label);
  assert.match(simplified.label, /核准/);

  i18n.setLocale('zh-TW');
  sandbox.globalThis.blankseedTutorialRefreshScenarios();
});

test('Simplified Chinese scenario copy does not retain mapped Traditional Chinese characters', () => {
  i18n.setLocale('zh-TW');
  sandbox.globalThis.blankseedTutorialRefreshScenarios();
  const traditional = visibleCopy(sandbox.globalThis.blankseedTutorialScenarios).join('\n');
  assert.match(traditional, /[請學現擬網設]/);

  i18n.setLocale('zh-CN');
  sandbox.globalThis.blankseedTutorialRefreshScenarios();
  const simplified = visibleCopy(sandbox.globalThis.blankseedTutorialScenarios).join('\n');
  assert.doesNotMatch(simplified, /[請學現擬網設]/);
  assert.doesNotMatch(simplified, /[與個並兩來體側傳僅儀內別剛動務區參員問啟單圍執報塊寬將對導帳後徑從復態憑應換擇據數斷於時會條標機檔檢欄權決沒洩測湊準滾瀏為狀獨環產畫當發確碼種範紀組結給統經線練總繞續習萬藍處號補複視覽觀訊託許診詢試認語論證識議讀變讓資質軸輪輸轉這連週進運過遠適遲選還邊鈕銷錄鍵鑰開間階際隨雜離雲頁項須預頭題類顯驗驟]/);

  i18n.setLocale('zh-TW');
  sandbox.globalThis.blankseedTutorialRefreshScenarios();
});
