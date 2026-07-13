import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const starterRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(starterRoot, '..');
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const runId = `wp09-${runStamp}`;
const branchName = `codex/wp09-source-evolution-${Date.now()}`;
const sourceEvolutionRoot = resolve(starterRoot, 'workspace', 'source-evolution');
const worktreeRoot = resolve(sourceEvolutionRoot, 'worktrees');
const worktreePath = resolve(worktreeRoot, runId);
const runRoot = resolve(sourceEvolutionRoot, 'runs', runId);
const reportPath = resolve(starterRoot, 'reports', 'wp-09-source-evolution.md');
const patchPath = resolve(starterRoot, 'reports', 'wp-09-candidate.patch');
const cdpPort = Number(process.env.BLANKSEED_WP09_CDP_PORT || 9343);
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tail(value, limit = 5000) {
  if (!value) return '';
  return value.length > limit ? value.slice(value.length - limit) : value;
}

function formatCommand(command, args) {
  return [command, ...args].join(' ');
}

function run(command, args, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeoutMs ?? 120000,
    env: { ...process.env, ...(options.env ?? {}) }
  });
  const record = {
    command: formatCommand(command, args),
    cwd: relative(repoRoot, cwd) || '.',
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    stdout: tail(result.stdout?.trim() ?? ''),
    stderr: tail(result.stderr?.trim() ?? '')
  };
  if (result.error) {
    const error = new Error(`${record.command} failed: ${result.error.message}`);
    error.record = record;
    throw error;
  }
  if (result.status !== 0) {
    const error = new Error(`${record.command} exited with ${result.status}`);
    error.record = record;
    throw error;
  }
  return record;
}

function git(args, options = {}) {
  return run('git', args, { cwd: options.cwd ?? repoRoot, timeoutMs: options.timeoutMs ?? 120000 });
}

function buildCandidatePatch() {
  return `diff --git a/starter/src/renderer/index.html b/starter/src/renderer/index.html
--- a/starter/src/renderer/index.html
+++ b/starter/src/renderer/index.html
@@ -29,6 +29,10 @@
       <div class="status-cell">
         <span>Modules</span>
         <strong id="stat-modules">0 active</strong>
       </div>
+      <div class="status-cell" id="source-evolution-health" data-source-evolution="candidate">
+        <span>Source</span>
+        <strong>candidate ok</strong>
+      </div>
     </section>
 
     <section class="panel">
`;
}

async function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForJson(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: resolveSend, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolveSend(message.result);
    }
  });
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveSend, reject) => pending.set(id, { resolve: resolveSend, reject }));
    },
    sendAndForget(method, params = {}) {
      ws.send(JSON.stringify({ id: nextId++, method, params }));
    },
    close() {
      ws.close();
    }
  };
}

async function closeElectron(electron) {
  try {
    const browser = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((response) => response.json());
    if (browser?.webSocketDebuggerUrl) {
      const cdp = await connect(browser.webSocketDebuggerUrl);
      cdp.sendAndForget('Browser.close');
      cdp.close();
    }
  } catch {
    // Best effort cleanup; the caller also checks for leftover processes.
  }
  await sleep(3000);
  if (electron?.exitCode === null) electron.kill();
}

async function launchCandidateHealth() {
  const electronPath = process.env.ELECTRON_PATH || resolve(starterRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  assert(existsSync(electronPath), `Electron binary not found: ${electronPath}`);
  const candidateStarter = resolve(worktreePath, 'starter');
  const electron = spawn(electronPath, [`--remote-debugging-port=${cdpPort}`, '.'], {
    cwd: candidateStarter,
    stdio: ['ignore', 'ignore', 'pipe']
  });

  let stderr = '';
  electron.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const targets = await waitForJson(`http://127.0.0.1:${cdpPort}/json/list`);
    const control = targets.find((target) => target.url.startsWith('file:///') && target.url.includes('/src/renderer/index.html'));
    assert(control, `Control page target not found. Targets: ${JSON.stringify(targets)}`);
    const cdp = await connect(control.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    const expression = `
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (window.blankseedConsoleReady) break;
    await sleep(100);
  }
  const marker = document.getElementById('source-evolution-health');
  return {
    ready: window.blankseedConsoleReady === true,
    title: document.title,
    marker: marker?.dataset?.sourceEvolution || null,
    markerText: marker?.textContent?.replace(/\\s+/g, ' ').trim() || null,
    statusCellCount: document.querySelectorAll('.status-cell').length
  };
})()
`;
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 45000
    });
    cdp.close();
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    const value = result.result.value;
    assert(value.ready === true, 'Candidate console readiness flag was not set.');
    assert(value.marker === 'candidate', 'Candidate source evolution marker was not present.');
    assert(value.statusCellCount >= 5, 'Candidate UI did not include the added status cell.');
    return {
      ...value,
      stderr: tail(stderr.trim(), 2000)
    };
  } finally {
    await closeElectron(electron);
  }
}

function makeMarkdown({ stableCommit, candidateCommit, commands, health, worktreeRemoved, worktreeList }) {
  const commandLines = commands.map((record) => `- \`${record.command}\` in \`${record.cwd}\` -> ${record.exitCode} (${record.durationMs} ms)`).join('\n');
  return `# WP-09 Git Source Evolution Report

Date: 2026-07-13 Asia/Taipei

## Scope

Demonstrated a Git-backed source self-modification prototype using a stable
baseline commit, a candidate branch/worktree, an inspectable patch, candidate
checks/tests, candidate Electron launch health and rollback by removing the
candidate worktree. The candidate branch is retained as local evidence and is
not merged into \`main\`.

## Stable Checkpoint

\`\`\`text
stableCommit: ${stableCommit}
candidateBranch: ${branchName}
candidateCommit: ${candidateCommit}
worktreePath: ${worktreePath}
patchPath: ${patchPath}
\`\`\`

## Candidate Change

The candidate patch adds a visible source-evolution health status cell to the
trusted console UI. It does not alter the remote target renderer settings and
does not enable Node integration for remote pages.

Patch evidence:

\`\`\`text
starter/reports/wp-09-candidate.patch
\`\`\`

## Commands

${commandLines}

## Candidate Health

\`\`\`json
${JSON.stringify(health, null, 2)}
\`\`\`

## Rollback Result

\`\`\`text
worktreeRemoved: ${worktreeRemoved}
remainingWorktrees:
${worktreeList.stdout || '(none)'}
\`\`\`

Rollback state: \`main\` remains at the stable source evolution implementation
lineage and the candidate patch is not merged. To accept the candidate later,
review and merge \`${branchName}\`; to discard it, delete that local branch.

## Manual Verification Note

Launch command:

\`\`\`powershell
node scripts\\runtime-wp09-source-evolution.mjs
\`\`\`

Tested URL:

\`\`\`text
https://example.com/
\`\`\`

Action performed:

\`\`\`text
Create candidate Git worktree, apply UI patch, run candidate check/test, launch
candidate Electron, verify console readiness and the candidate source-evolution
health marker, then remove the candidate worktree.
\`\`\`

Expected result:

\`\`\`text
Candidate checks and tests pass; candidate Electron reports console readiness;
the source-evolution marker exists; stable main is not modified by the
candidate patch after rollback.
\`\`\`

Actual result:

\`\`\`text
Candidate checks and tests passed, candidate Electron health returned ready=true
and marker=candidate, and the candidate worktree was removed.
\`\`\`

Relevant log/checkpoint path:

\`\`\`text
starter/reports/wp-09-source-evolution.md
starter/reports/wp-09-candidate.patch
\`\`\`

## Residual Risk

- The prototype keeps acceptance manual by design; it does not auto-merge
  candidate source into \`main\`.
- Dependency installation policy is not exercised because the candidate patch
  adds no dependency.
- Future source-evolution runs should add conflict handling before merging
  candidate branches into the stable line.
`;
}

await mkdir(runRoot, { recursive: true });
await mkdir(worktreeRoot, { recursive: true });

const commands = [];
const rootCheck = git(['rev-parse', '--show-toplevel']);
commands.push(rootCheck);
assert(resolve(rootCheck.stdout) === repoRoot, 'Script is not running from the expected Git repository.');

const stable = git(['rev-parse', '--verify', 'HEAD']);
commands.push(stable);
const stableCommit = stable.stdout.trim();

const status = git(['status', '--porcelain']);
commands.push(status);
assert(status.stdout.trim() === '', `Stable worktree must be clean before source evolution. Status: ${status.stdout}`);

const patch = buildCandidatePatch();
await writeFile(resolve(runRoot, 'candidate.patch'), patch, 'utf8');
await writeFile(patchPath, patch, 'utf8');

const addWorktree = git(['worktree', 'add', '-b', branchName, worktreePath, stableCommit], { timeoutMs: 120000 });
commands.push(addWorktree);

try {
  commands.push(git(['apply', patchPath], { cwd: worktreePath }));
  commands.push(run(npmBin, ['run', 'check'], { cwd: resolve(worktreePath, 'starter'), timeoutMs: 120000 }));
  commands.push(run(npmBin, ['test'], { cwd: resolve(worktreePath, 'starter'), timeoutMs: 120000 }));
  commands.push(git(['status', '--short'], { cwd: worktreePath }));
  commands.push(git(['add', 'starter/src/renderer/index.html'], { cwd: worktreePath }));
  commands.push(git(['commit', '-m', 'WP09 candidate source evolution health marker'], { cwd: worktreePath }));
  const candidate = git(['rev-parse', '--verify', 'HEAD'], { cwd: worktreePath });
  commands.push(candidate);
  const candidateCommit = candidate.stdout.trim();
  const health = await launchCandidateHealth();
  const removeWorktree = git(['worktree', 'remove', '--force', worktreePath], { timeoutMs: 120000 });
  commands.push(removeWorktree);
  await rm(worktreePath, { recursive: true, force: true });
  const worktreeList = git(['worktree', 'list']);
  commands.push(worktreeList);
  const report = makeMarkdown({
    stableCommit,
    candidateCommit,
    commands,
    health,
    worktreeRemoved: !existsSync(worktreePath),
    worktreeList
  });
  await writeFile(reportPath, report, 'utf8');
  console.log(JSON.stringify({
    stableCommit,
    candidateBranch: branchName,
    candidateCommit,
    patchPath,
    reportPath,
    health,
    worktreeRemoved: !existsSync(worktreePath)
  }, null, 2));
} catch (error) {
  const failurePath = resolve(runRoot, 'failure.json');
  await writeFile(failurePath, JSON.stringify({
    message: error.message,
    record: error.record ?? null,
    commands
  }, null, 2), 'utf8');
  throw error;
}
