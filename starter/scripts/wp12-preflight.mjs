import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  HOLD,
  REQUIRED_CHECKS,
  evaluatePreflight,
  isPathInside
} = require('../src/shared/wp12-preflight.cjs');

const starterRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(starterRoot, '..');
const workspaceRoot = resolve(starterRoot, 'workspace');
const fixtureManifestPath = resolve(starterRoot, 'test', 'fixtures', 'wp12', 'manifest.json');
const defaultInputPath = resolve(workspaceRoot, 'wp12-preflight', 'input.json');
const defaultOutputPath = resolve(workspaceRoot, 'wp12-preflight', 'preflight.json');

function hashBuffer(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashFile(path) {
  return hashBuffer(readFileSync(path));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function inspectFreshPath(path) {
  if (!existsSync(path)) return { path, fresh: true, state: 'absent' };
  try {
    const stat = statSync(path);
    if (!stat.isDirectory()) return { path, fresh: false, state: 'not-a-directory' };
    const empty = readdirSync(path).length === 0;
    return { path, fresh: empty, state: empty ? 'empty' : 'not-empty' };
  } catch {
    return { path, fresh: false, state: 'unreadable' };
  }
}

function parseArguments(argv) {
  const output = { allowHold: false, inputPath: defaultInputPath, outputPath: defaultOutputPath, verifiedChecks: new Set() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-hold') output.allowHold = true;
    else if (argument === '--input') output.inputPath = resolve(starterRoot, argv[++index]);
    else if (argument === '--output') output.outputPath = resolve(starterRoot, argv[++index]);
    else if (argument === '--verified-check') output.verifiedChecks.add(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return output;
}

function loadConfiguration(inputPath) {
  if (!existsSync(inputPath)) return { configuration: null, inputError: 'Preflight input file is missing.' };
  if (!isPathInside(inputPath, workspaceRoot)) return { configuration: null, inputError: 'Preflight input must remain inside starter/workspace.' };
  try {
    return { configuration: readJson(inputPath), inputError: null };
  } catch {
    return { configuration: null, inputError: 'Preflight input is not valid JSON.' };
  }
}

function loadFixtures() {
  const manifest = readJson(fixtureManifestPath);
  const directory = dirname(fixtureManifestPath);
  const actualHashes = {};
  for (const fixture of Array.isArray(manifest.fixtures) ? manifest.fixtures : []) {
    if (typeof fixture.path !== 'string') continue;
    const fixturePath = resolve(directory, fixture.path);
    if (!isPathInside(fixturePath, directory) || !existsSync(fixturePath)) continue;
    actualHashes[fixture.path] = hashFile(fixturePath);
  }
  return { manifest, actualHashes, manifestHash: hashFile(fixtureManifestPath) };
}

function loadEgressEvidence(configuration) {
  const requested = configuration?.egressEvidencePath;
  if (typeof requested !== 'string' || requested.length === 0) return { evidence: null, hash: null, artifactHash: null };
  const path = resolve(starterRoot, requested);
  if (!isPathInside(path, workspaceRoot) || !existsSync(path)) return { evidence: null, hash: null, artifactHash: null };
  try {
    const evidence = readJson(path);
    const artifactPath = typeof evidence.artifactPath === 'string' ? resolve(starterRoot, evidence.artifactPath) : null;
    const artifactHash = artifactPath && isPathInside(artifactPath, workspaceRoot) && existsSync(artifactPath)
      ? hashFile(artifactPath)
      : null;
    return { evidence, hash: hashFile(path), artifactHash };
  } catch {
    return { evidence: null, hash: null, artifactHash: null };
  }
}

const args = parseArguments(process.argv.slice(2));
if (!isPathInside(args.outputPath, workspaceRoot)) throw new Error('Preflight output must remain inside starter/workspace.');

const { configuration, inputError } = loadConfiguration(args.inputPath);
const fixtures = loadFixtures();
const egress = loadEgressEvidence(configuration);
const packageJson = readJson(resolve(starterRoot, 'package.json'));
const branch = git('branch', '--show-current');
const commit = git('rev-parse', 'HEAD');
const status = git('status', '--porcelain');
const checks = Object.fromEntries(REQUIRED_CHECKS.map((name) => [name, args.verifiedChecks.has(name)]));
const trialWorkspace = configuration?.trialWorkspacePath ? resolve(starterRoot, configuration.trialWorkspacePath) : '';
const userData = configuration?.userDataPath ? resolve(starterRoot, configuration.userDataPath) : '';

const result = evaluatePreflight({
  repository: { branch, commit, clean: status === '', checks },
  configuration,
  inputError,
  fixtures,
  egressEvidence: egress.evidence,
  egressEvidenceHash: egress.hash,
  egressEvidenceArtifactHash: egress.artifactHash,
  pathStates: {
    trialWorkspace: inspectFreshPath(trialWorkspace),
    userData: inspectFreshPath(userData)
  },
  runtimeIdentity: {
    kernelCommit: commit,
    electron: packageJson.devDependencies?.electron ?? null,
    os: `${platform()} ${release()} ${arch()}`,
    toolCatalogHash: hashFile(resolve(starterRoot, 'src', 'main', 'evolution-loop.cjs')),
    limitsHash: hashFile(resolve(starterRoot, 'config', 'defaults.json')),
    fixtureManifestHash: fixtures.manifestHash
  }
}, {
  trialWorkspaceRoot: resolve(workspaceRoot, 'wp12-trials'),
  userDataRoot: resolve(workspaceRoot, 'wp12-user-data')
});

if (inputError) result.blockers.unshift({ id: 'input-load', details: inputError });
result.inputPath = relative(starterRoot, args.inputPath).replaceAll('\\', '/');
result.outputPath = relative(starterRoot, args.outputPath).replaceAll('\\', '/');

mkdirSync(dirname(args.outputPath), { recursive: true });
writeFileSync(args.outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(`WP-12 preflight status: ${result.status}`);
console.log(`trial started: ${result.trialStarted}`);
console.log(`audit record: ${result.outputPath}`);
for (const blocker of result.blockers) console.log(`HOLD ${blocker.id}: ${blocker.details}`);

if (result.status === HOLD && !args.allowHold) process.exitCode = 2;
