import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const starterRoot = resolve(import.meta.dirname, '..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'blankseed-ui-v2-verification-'));
const runRecordPath = join(temporaryRoot, 'run-record.json');
const npmCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
const npmArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npm.cmd', 'run', 'verify']
  : ['run', 'verify'];

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function matchCount(output, pattern, label) {
  const match = output.match(pattern);
  if (!match) throw new Error(`Unable to derive ${label} from retained command output.`);
  return Number(match[1]);
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: starterRoot,
      env: process.env,
      shell: false,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.once('error', rejectRun);
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.once('close', (exitCode, signal) => resolveRun({ command, args, exitCode, signal, stdout, stderr }));
  });
}

try {
  const verify = await run(npmCommand, npmArgs);
  if (verify.exitCode !== 0) throw new Error(`npm run verify failed with exit code ${verify.exitCode}.`);

  const runtimeSmoke = await run(process.execPath, ['scripts/runtime-ui-agent-workspace-smoke.mjs']);
  if (runtimeSmoke.exitCode !== 0) throw new Error(`Runtime smoke failed with exit code ${runtimeSmoke.exitCode}.`);

  const runtimeSmokeBytes = await readFile(resolve(starterRoot, 'reports/ui-v2/runtime-smoke.json'));
  const combinedVerifyOutput = `${verify.stdout}\n${verify.stderr}`;
  const record = {
    schema: 'blankseed-ui-v2-run-record/1',
    command: 'npm run verify:ui:agent',
    exitCode: 0,
    commands: [
      { command: 'npm run verify', exitCode: verify.exitCode, signal: verify.signal },
      { command: 'node scripts/runtime-ui-agent-workspace-smoke.mjs', exitCode: runtimeSmoke.exitCode, signal: runtimeSmoke.signal }
    ],
    checks: {
      projectCheck: 'passed',
      tests: 'passed',
      runtimeSmoke: 'passed',
      projectJavaScriptFiles: matchCount(combinedVerifyOutput, /Checked (\d+) project JavaScript files/, 'project JavaScript count'),
      documentationCompanions: matchCount(combinedVerifyOutput, /Checked (\d+) required Traditional Chinese document companions/, 'documentation companion count'),
      testCount: matchCount(combinedVerifyOutput, /tests (\d+)/, 'test count'),
      passedTests: matchCount(combinedVerifyOutput, /pass (\d+)/, 'passed test count'),
      failedTests: matchCount(combinedVerifyOutput, /fail (\d+)/, 'failed test count')
    },
    runtimeSmokeSha256: digest(runtimeSmokeBytes)
  };
  if (record.checks.testCount !== record.checks.passedTests || record.checks.failedTests !== 0) {
    throw new Error('Derived test counts do not prove a complete passing run.');
  }
  await writeFile(runRecordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  const writer = await run(process.execPath, ['scripts/write-ui-v2-verification.mjs', runRecordPath]);
  if (writer.exitCode !== 0) throw new Error(`Verification evidence writer failed with exit code ${writer.exitCode}.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
