import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const starterRoot = resolve(import.meta.dirname, '..');

test('renderer binds UI copy through catalog keys without binding evidence payloads', async () => {
  const [html, app, i18n, tutorial] = await Promise.all([
    readFile(resolve(starterRoot, 'src/renderer/index.html'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/app.js'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/i18n.js'), 'utf8'),
    readFile(resolve(starterRoot, 'tutorial/app.js'), 'utf8')
  ]);

  assert.match(html, /data-i18n="console\.title"/);
  for (const key of ['console.title', 'target.snapshot', 'advanced.governance', 'module.status.candidate', 'checkpoint.none', 'agent.emptyTitle']) {
    assert.ok(i18n.includes(`'${key}'`), `missing catalog key: ${key}`);
  }
  assert.match(i18n, /translateTextNodes/);
  assert.match(i18n, /script, style, code, pre, textarea/);
  assert.match(i18n, /sourceKeyFor\(source\)/);
  assert.match(app, /t\(`module\.status\.\$\{status\}`/);
  assert.match(app, /moduleStatusLabel\(manifest\.status\)/);
  assert.match(html, /id="timeline"[^>]+data-i18n="event\.none"/);
  assert.match(app, /row\.dataset\.i18nSkip = 'true';[\s\S]*message\.content/);
  assert.match(app, /row\.dataset\.i18nSkip = 'true';[\s\S]*summarizeEvent\(event\)/);
  assert.match(tutorial, /row\.dataset\.i18nSkip = 'true';[\s\S]*message\.content/);
  assert.match(tutorial, /row\.dataset\.i18nSkip = 'true';[\s\S]*detail/);
});

test('renderer ships a no-privilege Traditional Chinese, Simplified Chinese, and English locale architecture', async () => {
  const [html, app, i18n, tutorial] = await Promise.all([
    readFile(resolve(starterRoot, 'src/renderer/index.html'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/app.js'), 'utf8'),
    readFile(resolve(starterRoot, 'src/renderer/i18n.js'), 'utf8'),
    readFile(resolve(starterRoot, 'tutorial/app.js'), 'utf8')
  ]);

  assert.match(html, /id="ui-locale"/);
  assert.match(html, /<option value="zh-TW"/);
  assert.match(html, /<option value="zh-CN"/);
  assert.match(html, /<option value="en"/);
  assert.match(html, /<script src="i18n\.js"><\/script>[\s\S]*<script src="app\.js"><\/script>/);
  assert.match(i18n, /SUPPORTED_LOCALES = Object\.freeze\(\['zh-TW', 'zh-CN', 'en'\]\)/);
  assert.match(i18n, /LOCALE_STORAGE_KEY = 'blankseed\.ui\.locale'/);
  assert.match(i18n, /return DEFAULT_LOCALE/);
  assert.match(i18n, /const translated = t\(element\.dataset\.i18n\)/);
  assert.match(i18n, /if \(element\.textContent !== translated\) element\.textContent = translated/);
  assert.match(app, /globalThis\.BlankSeedI18n/);
  assert.match(app, /\$\('ui-locale'\)\.addEventListener\('change'/);
  assert.match(tutorial, /globalThis\.BlankSeedI18n/);
  assert.match(tutorial, /id="tutorial-locale"|tutorial-locale/);
  assert.match(tutorial, /function refreshTutorialLocale\(\)[\s\S]*buildScenarioNavigation\(\)[\s\S]*renderStep\(\)/);
  assert.doesNotMatch(tutorial, /setLocale\(event\.target\.value\);\s*location\.reload\(\)/);
  assert.doesNotMatch(i18n, /window\.blankseed|ipc|fetch\(/i);
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
  assert.match(app, /await window\.blankseed\.target\.setOverlayActive\(true/);
  assert.match(app, /finally \{[\s\S]*await window\.blankseed\.target\.setOverlayActive\(false/);
  assert.match(app, /allowedTools: \[\.\.\.uiAgentTools\]/);
  assert.match(app, /'module_candidate_page_test'/);
  assert.match(app, /createCandidate[\s\S]*testCandidate[\s\S]*commitCandidate[\s\S]*activate[\s\S]*invoke/);
  assert.match(app, /tested\.passed !== true/);
  assert.match(app, /invocation\.status !== 'ok'/);
  assert.match(preload, /setOpenAICredential/);
  assert.match(preload, /commitCandidate:[^\n]+confirmed: options\?\.confirmed === true/);
  assert.match(preload, /activate:[^\n]+confirmed: options\?\.confirmed === true/);
  assert.match(preload, /rollback:[^\n]+confirmed: options\?\.confirmed === true/);
  assert.match(preload, /setOverlayActive/);
  assert.match(contracts, /targetOverlaySet: 'blankseed:target:overlay:set'/);
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
