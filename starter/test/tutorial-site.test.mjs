import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createTutorialServer, resolveTutorialPath } from '../scripts/serve-tutorial.mjs';
import '../tutorial/scenarios.js';

const scenarios = globalThis.blankseedTutorialScenarios;

const starterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('tutorial reuses the authoritative renderer markup and stylesheet', async () => {
  const html = await readFile(path.join(starterRoot, 'tutorial/index.html'), 'utf8');
  const app = await readFile(path.join(starterRoot, 'tutorial/app.js'), 'utf8');
  assert.match(html, /href="\.\.\/src\/renderer\/styles\.css"/);
  assert.match(html, /data-renderer-source="\.\.\/src\/renderer\/index\.html"/);
  assert.match(app, /fetch\(rendererSource/);
  assert.match(app, /parsed\.querySelector\('main'\)/);
  assert.match(app, /if \(tutorialState\.moduleAutomationRunning\) return/);
  assert.match(app, /query\('#module-auto-run', consoleRoot\)\.disabled = true/);
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

  const traversal = await fetch(`${origin}/%2e%2e%2f%2e%2e%2fAGENTS.md`);
  assert.equal(traversal.status, 403);
});
