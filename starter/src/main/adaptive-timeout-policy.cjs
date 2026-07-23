'use strict';

const POLICY_VERSION = 'blankseed-adaptive-timeout/0.1';
const DEFAULT_TIMEOUTS_MS = Object.freeze({
  simple: 30000,
  analysis: 90000,
  codeGeneration: 120000,
  verification: 180000
});

const CODE_GENERATION_INPUTS = new Set([
  'page.snapshot',
  'page.execute',
  'cdp.send',
  'module.list'
]);
const VERIFICATION_INPUTS = new Set([
  'node.execute',
  'module.candidate.create',
  'module.candidate.test',
  'module.invoke'
]);

function normalizeTimeouts(policy = DEFAULT_TIMEOUTS_MS) {
  const value = { ...DEFAULT_TIMEOUTS_MS, ...(policy || {}) };
  for (const [name, timeoutMs] of Object.entries(value)) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) {
      throw new TypeError(`Adaptive timeout ${name} must be an integer from 1 to 300000.`);
    }
  }
  return value;
}

function classifyEvolutionTurn({ turnSequence, previousAction = null } = {}) {
  if (turnSequence === 1 || !previousAction) return 'analysis';
  if (previousAction.status === 'error' && VERIFICATION_INPUTS.has(previousAction.actionKind)) return 'verification';
  if (previousAction.status === 'error') return 'codeGeneration';
  if (VERIFICATION_INPUTS.has(previousAction.actionKind)) return 'verification';
  if (CODE_GENERATION_INPUTS.has(previousAction.actionKind)) return 'codeGeneration';
  return 'simple';
}

function selectEvolutionTurnTimeout({ explicitTimeoutMs, policy, previousAction, turnSequence } = {}) {
  const timeouts = normalizeTimeouts(policy);
  if (explicitTimeoutMs !== undefined) {
    if (!Number.isInteger(explicitTimeoutMs) || explicitTimeoutMs < 1 || explicitTimeoutMs > 300000) {
      throw new TypeError('Explicit model timeout must be an integer from 1 to 300000.');
    }
    return Object.freeze({
      policyVersion: POLICY_VERSION,
      timeoutClass: 'explicit',
      timeoutMs: explicitTimeoutMs,
      source: 'operator-override'
    });
  }
  const timeoutClass = classifyEvolutionTurn({ turnSequence, previousAction });
  return Object.freeze({
    policyVersion: POLICY_VERSION,
    timeoutClass,
    timeoutMs: timeouts[timeoutClass],
    source: 'adaptive-policy'
  });
}

module.exports = {
  DEFAULT_TIMEOUTS_MS,
  POLICY_VERSION,
  classifyEvolutionTurn,
  selectEvolutionTurnTimeout
};
