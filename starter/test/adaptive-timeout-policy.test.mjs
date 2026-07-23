import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_TIMEOUTS_MS,
  POLICY_VERSION,
  classifyEvolutionTurn,
  selectEvolutionTurnTimeout
} = require('../src/main/adaptive-timeout-policy.cjs');

test('adaptive timeout policy selects the four governed timeout classes', () => {
  assert.deepEqual(DEFAULT_TIMEOUTS_MS, {
    simple: 30000,
    analysis: 90000,
    codeGeneration: 120000,
    verification: 180000
  });
  assert.equal(classifyEvolutionTurn({ turnSequence: 1 }), 'analysis');
  assert.equal(classifyEvolutionTurn({ turnSequence: 2, previousAction: { actionKind: 'target.navigate', status: 'ok' } }), 'simple');
  assert.equal(classifyEvolutionTurn({ turnSequence: 2, previousAction: { actionKind: 'page.snapshot', status: 'ok' } }), 'codeGeneration');
  assert.equal(classifyEvolutionTurn({ turnSequence: 3, previousAction: { actionKind: 'node.execute', status: 'ok' } }), 'verification');
  assert.equal(classifyEvolutionTurn({ turnSequence: 3, previousAction: { actionKind: 'module.candidate.test', status: 'error' } }), 'verification');
  assert.equal(classifyEvolutionTurn({ turnSequence: 3, previousAction: { actionKind: 'cdp.send', status: 'error' } }), 'codeGeneration');
});

test('adaptive timeout policy preserves an explicit bounded operator override', () => {
  const selected = selectEvolutionTurnTimeout({ explicitTimeoutMs: 45000, turnSequence: 1 });
  assert.deepEqual(selected, {
    policyVersion: POLICY_VERSION,
    timeoutClass: 'explicit',
    timeoutMs: 45000,
    source: 'operator-override'
  });
  assert.throws(() => selectEvolutionTurnTimeout({ explicitTimeoutMs: 300001 }), /1 to 300000/);
});

test('adaptive timeout policy validates configured budgets', () => {
  assert.throws(
    () => selectEvolutionTurnTimeout({ policy: { verification: 0 }, turnSequence: 1 }),
    /verification/
  );
});
