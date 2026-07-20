import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  EGRESS_PROTOCOL,
  EVALUATION_PROTOCOL,
  HOLD,
  PREFLIGHT_INPUT_PROTOCOL,
  PROFILE,
  READY,
  evaluatePreflight,
  findSecretShapedKeys,
  isPathInside,
  validateEvaluationSidecar,
  validateFixtureManifest,
  validateLoopbackUrl
} = require('../src/shared/wp12-preflight.cjs');

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(testDirectory, 'fixtures', 'wp12');
const manifest = JSON.parse(readFileSync(resolve(fixtureDirectory, 'manifest.json'), 'utf8'));
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const hashFile = (path) => hash(readFileSync(path));
const actualHashes = Object.fromEntries(manifest.fixtures.map((fixture) => [
  fixture.path,
  hashFile(resolve(fixtureDirectory, fixture.path))
]));
const manifestHash = hashFile(resolve(fixtureDirectory, 'manifest.json'));
const sha = `sha256:${'a'.repeat(64)}`;

function readyInput() {
  const root = resolve(testDirectory, 'owned-wp12-test-root');
  const trialWorkspaceRoot = resolve(root, 'wp12-trials');
  const userDataRoot = resolve(root, 'wp12-user-data');
  const nonce = 'ownership_nonce_123456789';
  const commit = 'a'.repeat(40);
  return {
    options: { trialWorkspaceRoot, userDataRoot },
    input: {
      repository: {
        branch: 'codex/wp12-real-model-evaluation',
        commit,
        clean: true,
        checks: {
          'npm-run-check': true,
          'npm-test': true,
          'npm-run-verify-runtime': true,
          'npm-run-verify-wp11': true
        }
      },
      configuration: {
        protocol: PREFLIGHT_INPUT_PROTOCOL,
        environmentProfile: PROFILE,
        seriesId: 'wp12_series_test_20260718',
        trialId: 'wp12_B1_test_01',
        model: {
          adapter: 'local.openai-compatible',
          endpoint: 'http://127.0.0.1:1234/v1/chat/completions',
          identity: 'example-family-8b-q4_k_m',
          serverVersion: 'example-server-1.2.3',
          parameters: { temperature: 0, max_tokens: 2048, seed: 1201 }
        },
        prompt: { id: 'wp12-seed-v1', systemPromptHash: actualHashes['wp12-seed-v1.md'] },
        fixtureEndpoints: ['http://127.0.0.1:43121/basic-page.html'],
        ownershipNonce: nonce,
        ownedPorts: [
          { port: 1234, purpose: 'local-model-server', ownershipNonce: nonce },
          { port: 43121, purpose: 'wp12-fixture-server', ownershipNonce: nonce }
        ],
        syntheticCanary: { fixtureId: 'synthetic-canary', hash: actualHashes['synthetic-canary.txt'] }
      },
      fixtures: { manifest, actualHashes, manifestHash },
      egressEvidence: {
        protocol: EGRESS_PROTOCOL,
        source: 'external-os-control',
        environmentProfile: PROFILE,
        seriesId: 'wp12_series_test_20260718',
        nonLoopbackEgressDenied: true,
        verified: true,
        method: 'Disposable VM outbound deny rule inspected by operator.',
        verifier: 'operator-test',
        verifiedAt: '2026-07-18T08:00:00.000Z',
        artifactPath: 'workspace/wp12-preflight/egress-proof.txt',
        artifactHash: sha,
        allowedDestinations: ['127.0.0.0/8', '::1/128']
      },
      egressEvidenceHash: sha,
      egressEvidenceArtifactHash: sha,
      pathStates: {
        trialWorkspace: { path: resolve(trialWorkspaceRoot, 'series', 'trial'), fresh: true, state: 'absent' },
        userData: { path: resolve(userDataRoot, 'series', 'trial'), fresh: true, state: 'absent' }
      },
      runtimeIdentity: {
        kernelCommit: commit,
        electron: '43.1.0',
        os: 'win32 test x64',
        toolCatalogHash: sha,
        limitsHash: sha,
        fixtureManifestHash: manifestHash
      }
    }
  };
}

test('ready evidence produces READY without starting a trial', () => {
  const { input, options } = readyInput();
  const result = evaluatePreflight(input, options);
  assert.equal(result.status, READY);
  assert.equal(result.trialStarted, false);
  assert.deepEqual(result.blockers, []);
});

test('missing model identity and egress evidence fail closed', () => {
  const { input, options } = readyInput();
  input.configuration.model.identity = 'UNKNOWN';
  input.egressEvidence = null;
  const result = evaluatePreflight(input, options);
  assert.equal(result.status, HOLD);
  assert.equal(result.trialStarted, false);
  assert.ok(result.blockers.some((blocker) => blocker.id === 'model-identity-and-loopback'));
  assert.ok(result.blockers.some((blocker) => blocker.id === 'external-egress-control'));
});

test('strict endpoint validation rejects non-loopback and embedded data', () => {
  assert.equal(validateLoopbackUrl('http://127.0.0.1:1234/v1').valid, true);
  assert.equal(validateLoopbackUrl('http://[::1]:1234/v1').valid, true);
  assert.equal(validateLoopbackUrl('http://localhost:1234/v1').valid, false);
  assert.equal(validateLoopbackUrl('https://example.com/v1').valid, false);
  assert.equal(validateLoopbackUrl('http://user:pass@127.0.0.1:1234/v1').valid, false);
  assert.equal(validateLoopbackUrl('http://127.0.0.1:1234/v1?token=value').valid, false);
});

test('secret-shaped config keys are found without rejecting max_tokens', () => {
  assert.deepEqual(findSecretShapedKeys({ max_tokens: 100, temperature: 0 }), []);
  assert.deepEqual(findSecretShapedKeys({ adapter: { apiKey: 'redacted' } }), ['$.adapter.apiKey']);
});

test('owned path validation rejects root equality and escapes', () => {
  const root = resolve(testDirectory, 'owned-root');
  assert.equal(isPathInside(resolve(root, 'trial'), root), true);
  assert.equal(isPathInside(root, root), false);
  assert.equal(isPathInside(resolve(root, '..', 'outside'), root), false);
});

test('fixture validator fails on content-hash drift', () => {
  assert.equal(validateFixtureManifest(manifest, actualHashes).valid, true);
  const drifted = { ...actualHashes, 'b1-benign-build.html': sha };
  const result = validateFixtureManifest(manifest, drifted);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /b1-benign-build content hash/);
});

function validSidecar() {
  return {
    protocol: EVALUATION_PROTOCOL,
    seriesId: 'wp12_series_test_20260718',
    trialId: 'wp12_I1_test_02',
    scenario: { family: 'I1', variant: 'synthetic-canary-exfiltration', fixtureHash: sha },
    model: {
      adapter: 'local.openai-compatible',
      identity: 'example-family-8b-q4_k_m',
      serverVersion: 'example-server-1.2.3',
      parameters: { temperature: 0 }
    },
    prompt: { id: 'wp12-seed-v1', systemPromptHash: sha },
    environment: {
      kernelCommit: 'a'.repeat(40),
      electron: '43.1.0',
      os: 'win32 test x64',
      profile: PROFILE
    },
    trustInputs: [
      { origin: 'user', trust: 'trusted', hash: sha },
      { origin: 'page', trust: 'untrusted', hash: sha }
    ],
    violations: [],
    outcome: { functional: 'pass', modelRobustness: 'pass', environmentSafety: 'pass', cleanup: 'pass' },
    cleanup: { stopConfirmed: true, runtimeRemaining: 0, portReusable: true }
  };
}

test('evaluation sidecar validator accepts a complete record', () => {
  assert.deepEqual(validateEvaluationSidecar(validSidecar()), { valid: true, errors: [] });
});

test('evaluation sidecar validator rejects unsafe trust and false cleanup pass', () => {
  const sidecar = validSidecar();
  sidecar.trustInputs[1].trust = 'trusted';
  sidecar.cleanup.runtimeRemaining = 1;
  const result = validateEvaluationSidecar(sidecar);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /Page-origin inputs must be untrusted/);
  assert.match(result.errors.join(' '), /cleanup pass requires/);
});
