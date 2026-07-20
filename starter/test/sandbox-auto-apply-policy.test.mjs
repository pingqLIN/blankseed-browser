import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  POLICY_ID,
  createSandboxAutoApplyPolicy
} = require('../src/main/sandbox-auto-apply-policy.cjs');

test('sandbox auto-apply policy requires colocated ephemeral roots and loopback model egress', () => {
  const temporaryRoot = join('C:', 'Temp');
  const sandboxRoot = join(temporaryRoot, 'blankseed-sandbox-fixture');
  const policy = createSandboxAutoApplyPolicy({
    requested: true,
    workspaceRoot: join(sandboxRoot, 'workspace'),
    dataRoot: join(sandboxRoot, 'data'),
    localModelEndpoint: 'http://127.0.0.1:1234/v1/chat/completions',
    temporaryRoot
  });
  assert.equal(policy.metadata.id, POLICY_ID);
  assert.equal(policy.metadata.isolationClaims.securitySandbox, false);
  assert.equal(policy.metadata.isolationClaims.modelEgress, 'loopback-only');

  assert.throws(() => createSandboxAutoApplyPolicy({
    requested: true,
    workspaceRoot: join('D:', 'project', 'workspace'),
    dataRoot: join(sandboxRoot, 'data'),
    localModelEndpoint: 'http://127.0.0.1:1234/v1/chat/completions',
    temporaryRoot
  }), /same ephemeral/);

  assert.throws(() => createSandboxAutoApplyPolicy({
    requested: true,
    workspaceRoot: join(sandboxRoot, 'workspace'),
    dataRoot: join(sandboxRoot, 'data'),
    localModelEndpoint: 'https://api.example.com/v1',
    temporaryRoot
  }), /loopback/);
});

test('sandbox auto-apply policy authorizes only an approved activation decision', () => {
  const temporaryRoot = join('C:', 'Temp');
  const sandboxRoot = join(temporaryRoot, 'blankseed-sandbox-authority');
  const policy = createSandboxAutoApplyPolicy({
    requested: true,
    workspaceRoot: join(sandboxRoot, 'workspace'),
    dataRoot: join(sandboxRoot, 'data'),
    localModelEndpoint: 'http://localhost:8765/v1/chat/completions',
    temporaryRoot
  });
  const decision = {
    decisionId: 'gov_fixture',
    status: 'awaiting_operator',
    activation: { moduleId: 'generated.fixture', version: '1.0.0' },
    proposal: { proposerAgentId: 'agt_proposer' },
    review: { reviewerAgentId: 'agt_reviewer', verdict: 'approve' }
  };
  const authority = policy.authorize(decision);
  assert.equal(authority.kind, 'agent-sandbox-policy');
  assert.equal(authority.authorityId, POLICY_ID);
  assert.throws(() => policy.authorize({ ...decision, status: 'rejected' }), /approved decision/);
});
