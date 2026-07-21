import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createTutorialServer, resolveTutorialPath } from '../scripts/serve-tutorial.mjs';
import '../tutorial/launch-guard.js';
import '../tutorial/scenarios.js';

const scenarios = globalThis.blankseedTutorialScenarios;
const launchGuard = globalThis.blankseedTutorialLaunchGuard;

const starterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('tutorial reuses the authoritative renderer markup and stylesheet', async () => {
  const html = await readFile(path.join(starterRoot, 'tutorial/index.html'), 'utf8');
  const app = await readFile(path.join(starterRoot, 'tutorial/app.js'), 'utf8');
  assert.match(html, /href="\.\.\/src\/renderer\/styles\.css"/);
  assert.match(html, /data-renderer-source="\.\.\/src\/renderer\/index\.html"/);
  assert.match(html, /<script src="launch-guard\.js"><\/script>[\s\S]*<script src="scenarios\.js"><\/script>/);
  assert.doesNotMatch(html, /<script type="module" src="app\.js"><\/script>/);
  assert.match(await readFile(path.join(starterRoot, 'tutorial/launch-guard.js'), 'utf8'), /if \(!assessment\.allowed[\s\S]*renderRecovery\(assessment\)/);
  assert.match(await readFile(path.join(starterRoot, 'tutorial/launch-guard.js'), 'utf8'), /script\.type = 'module'[\s\S]*script\.src = 'app\.js'/);
  assert.match(app, /fetch\(rendererSource/);
  assert.match(app, /parsed\.querySelector\('main'\)/);
  assert.match(app, /if \(tutorialState\.moduleAutomationRunning\) return/);
  assert.match(app, /query\('#module-auto-run', consoleRoot\)\.disabled = true/);
});

test('tutorial blocks file and non-loopback loading with an actionable launcher path', () => {
  assert.equal(launchGuard.assessLocation('file:///D:/workspace/starter/tutorial/index.html?scenario=model').allowed, false);
  assert.equal(launchGuard.assessLocation('file:///D:/workspace/starter/tutorial/index.html').reason, 'file-protocol');
  assert.equal(launchGuard.assessLocation('https://example.com/tutorial/').reason, 'non-loopback');
  assert.equal(launchGuard.assessLocation('http://127.0.0.1:4173/tutorial/').allowed, true);
  assert.equal(launchGuard.assessLocation('http://localhost:4173/tutorial/').allowed, true);
  const details = launchGuard.launcherDetails(new URL('file:///D:/workspace/starter/tutorial/index.html'));
  assert.match(details.launcherPath, /D:\\workspace\\啟動操作教學\.cmd$/);
  assert.match(details.command, /Start-Process -FilePath/);
  assert.equal(
    launchGuard.recoveryUrl(new URL('file:///D:/workspace/starter/tutorial/index.html?scenario=model')),
    'http://127.0.0.1:4173/tutorial/?scenario=model'
  );
});

test('Windows launch shortcuts and managed tutorial lifecycle scripts are present', async () => {
  const repositoryRoot = path.resolve(starterRoot, '..');
  const [packageText, launchTutorial, stopTutorial, launchApp, tutorialShortcut, appShortcut] = await Promise.all([
    readFile(path.join(starterRoot, 'package.json'), 'utf8'),
    readFile(path.join(starterRoot, 'scripts', 'launch-tutorial.ps1'), 'utf8'),
    readFile(path.join(starterRoot, 'scripts', 'stop-tutorial.ps1'), 'utf8'),
    readFile(path.join(starterRoot, 'scripts', 'launch-blankseed.ps1'), 'utf8'),
    readFile(path.join(repositoryRoot, '啟動操作教學.cmd'), 'utf8'),
    readFile(path.join(repositoryRoot, '啟動 BlankSeed Browser.cmd'), 'utf8')
  ]);
  assert.match(packageText, /"tutorial:open"/);
  assert.match(packageText, /"tutorial:stop"/);
  assert.match(launchTutorial, /__blankseed_tutorial_health/);
  assert.match(launchTutorial, /Start-Process[\s\S]*-WindowStyle Hidden/);
  assert.match(stopTutorial, /不是這個工作區的 BlankSeed 教學伺服器/);
  assert.match(launchApp, /Get-BlankSeedElectronProcess/);
  assert.match(tutorialShortcut, /launch-tutorial\.ps1/);
  assert.match(appShortcut, /launch-blankseed\.ps1/);
});

test('tutorial covers the required browsing, module, governance and model workflows', () => {
  const scenarioIds = scenarios.map((scenario) => scenario.id);
  assert.deepEqual(scenarioIds, ['overview', 'navigate', 'login', 'agent', 'module', 'governance', 'model']);
  const content = JSON.stringify(scenarios);
  for (const requiredText of [
    '開啟網站',
    '登入／登出網站',
    '產生與測試模組',
    '核准、取消與回滾',
    '接入 AI 模型',
    '一鍵完成候選',
    'YES／NO',
    '取消受控審核',
    '操作員'
  ]) {
    assert.ok(content.includes(requiredText), `missing tutorial coverage: ${requiredText}`);
  }
});

test('tutorial page documents both supported model environment boundaries', async () => {
  const html = await readFile(path.join(starterRoot, 'tutorial/index.html'), 'utf8');
  assert.match(html, /BLANKSEED_LOCAL_MODEL_ENDPOINT/);
  assert.match(html, /BLANKSEED_LOCAL_MODEL_NAME/);
  assert.match(html, /OPENAI_API_KEY/);
  assert.doesNotMatch(html, /sk-[A-Za-z0-9_-]{16,}/);
  assert.match(html, /正式程式可在 Agent 分頁輸入暫時 OpenAI API 金鑰/);
});

test('tutorial server is loopback-ready and blocks traversal outside starter', async (context) => {
  assert.equal(resolveTutorialPath('/tutorial/', starterRoot), path.join(starterRoot, 'tutorial', 'index.html'));
  assert.equal(resolveTutorialPath('/%2e%2e%2f%2e%2e%2fAGENTS.md', starterRoot), null);

  const server = createTutorialServer({ root: starterRoot });
  context.after(() => server.close());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  const page = await fetch(`${origin}/tutorial/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') || '', /^text\/html/);
  assert.match(await page.text(), /BlankSeed Browser 操作教學/);

  const renderer = await fetch(`${origin}/src/renderer/index.html`);
  assert.equal(renderer.status, 200);
  assert.match(await renderer.text(), /id="tab-button-agent"/);

  const health = await fetch(`${origin}/__blankseed_tutorial_health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'blankseed-tutorial' });

  const traversal = await fetch(`${origin}/%2e%2e%2f%2e%2e%2fAGENTS.md`);
  assert.equal(traversal.status, 403);
});
