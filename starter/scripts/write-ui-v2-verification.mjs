import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';

const starterRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(starterRoot, '..');
const evidenceRoot = resolve(starterRoot, 'reports/ui-v2');
const outputPath = resolve(evidenceRoot, 'verification.json');
const scopedPaths = [
  '09_DECISION_LOG.md',
  '09_DECISION_LOG.zh-tw.md',
  'starter/config/defaults.json',
  'starter/scripts/async-resource-scope.mjs',
  'starter/scripts/runtime-ui-agent-workspace-smoke.mjs',
  'starter/scripts/verify-ui-v2.mjs',
  'starter/scripts/write-ui-v2-verification.mjs',
  'starter/src/main/evolution-loop.cjs',
  'starter/src/main/ipc-router.cjs',
  'starter/src/preload/preload.cjs',
  'starter/src/renderer/app.js',
  'starter/src/renderer/index.html',
  'starter/src/renderer/styles.css',
  'starter/test/async-resource-scope.test.mjs',
  'starter/test/evolution-loop.test.mjs',
  'starter/test/renderer-localization.test.mjs'
];
const statusPaths = ['starter/package.json', ...scopedPaths, 'starter/reports/ui-v2'];

function git(args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileDigest(path) {
  return digest(await readFile(path));
}

async function buildScopeIdentity() {
  const entries = [];
  for (const path of scopedPaths) {
    const bytes = await readFile(resolve(repoRoot, path));
    entries.push({ path, size: bytes.length, sha256: digest(bytes) });
  }
  const packageJson = JSON.parse(await readFile(resolve(starterRoot, 'package.json'), 'utf8'));
  const packageProjection = Buffer.from(JSON.stringify({
    'scripts.verify:ui:agent': packageJson.scripts?.['verify:ui:agent'] ?? null
  }));
  entries.push({
    path: 'starter/package.json#scripts.verify:ui:agent',
    size: packageProjection.length,
    sha256: digest(packageProjection)
  });
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const canonical = entries.map((entry) => `${entry.path}\0${entry.size}\0${entry.sha256}\n`).join('');
  return { entries, sha256: digest(canonical) };
}

async function countGeneratedEntries(path) {
  let count = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === '.gitkeep') continue;
    count += 1;
    if (entry.isDirectory()) count += await countGeneratedEntries(resolve(path, entry.name));
  }
  return count;
}

const evidenceFiles = [];
for (const entry of await readdir(evidenceRoot, { withFileTypes: true })) {
  if (!entry.isFile() || entry.name === basename(outputPath)) continue;
  const path = resolve(evidenceRoot, entry.name);
  const info = await stat(path);
  evidenceFiles.push({
    path: `starter/reports/ui-v2/${entry.name}`,
    size: info.size,
    sha256: await fileDigest(path)
  });
}
evidenceFiles.sort((left, right) => left.path.localeCompare(right.path));

const runtimeSmoke = JSON.parse(await readFile(resolve(evidenceRoot, 'runtime-smoke.json'), 'utf8'));
const runtimeResetManifest = JSON.parse(await readFile(resolve(evidenceRoot, 'runtime-reset-manifest.json'), 'utf8'));
const runRecordPath = process.argv[2];
if (!runRecordPath) throw new Error('A retained verification run record is required.');
const runRecord = JSON.parse(await readFile(resolve(runRecordPath), 'utf8'));
if (runRecord.schema !== 'blankseed-ui-v2-run-record/1' || runRecord.exitCode !== 0) {
  throw new Error('The verification run record is missing or unsuccessful.');
}
if (runRecord.runtimeSmokeSha256 !== await fileDigest(resolve(evidenceRoot, 'runtime-smoke.json'))) {
  throw new Error('Runtime smoke evidence does not match the retained run record.');
}
const electronPackage = JSON.parse(await readFile(resolve(starterRoot, 'node_modules/electron/package.json'), 'utf8'));
const workspaceAreas = ['evolution-runs', 'experiments', 'modules', 'source-evolution', 'state', 'wp12-preflight'];
const workspaceResiduals = {};
for (const area of workspaceAreas) {
  workspaceResiduals[area] = await countGeneratedEntries(resolve(starterRoot, 'workspace', area));
}

const scopeIdentity = await buildScopeIdentity();
const scopedStatusOutput = git(['status', '--short', '--', ...statusPaths]).trimEnd();
const verification = {
  schema: 'blankseed-ui-v2-verification/2',
  generatedAt: new Date().toISOString(),
  command: runRecord.command,
  exitCode: runRecord.exitCode,
  baseline: {
    head: git(['rev-parse', 'HEAD']).trim(),
    scopedContentSha256: scopeIdentity.sha256,
    scopeDigestCanonicalization: 'UTF-8 path + NUL + decimal size + NUL + lowercase SHA-256 + LF for each scopeFiles record sorted by path',
    scopeFiles: scopeIdentity.entries,
    scopedStatus: scopedStatusOutput ? scopedStatusOutput.split(/\r?\n/) : []
  },
  versions: {
    node: process.version,
    electron: electronPackage.version
  },
  checks: runRecord.checks,
  commandResults: runRecord.commands,
  runtimeSmoke,
  runtimeBaseState: {
    workspaceResiduals,
    activeModulesFileExists: await stat(resolve(starterRoot, 'workspace/state/active-modules.json')).then(() => true, () => false),
    appDataRuntimeRootExists: await stat(resolve(process.env.APPDATA, 'blankseed-browser-starter/blankseed-data')).then(() => true, () => false),
    ownedProcessCleanup: runtimeSmoke.cleanup
  },
  resetManifest: {
    path: 'starter/reports/ui-v2/runtime-reset-manifest.json',
    sha256: await fileDigest(resolve(evidenceRoot, 'runtime-reset-manifest.json')),
    manifestDigest: runtimeResetManifest.quarantine.manifestDigest,
    manifestDigestAlgorithm: runtimeResetManifest.quarantine.manifestDigestAlgorithm,
    manifestDigestCanonicalization: runtimeResetManifest.quarantine.manifestDigestCanonicalization,
    totalFiles: runtimeResetManifest.quarantine.totalFiles,
    rollbackPolicy: runtimeResetManifest.policy
  },
  artifacts: evidenceFiles
};

await writeFile(outputPath, `${JSON.stringify(verification, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: relative(repoRoot, outputPath), scopedContentSha256: verification.baseline.scopedContentSha256, artifacts: evidenceFiles.length }));
