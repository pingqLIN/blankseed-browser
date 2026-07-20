import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MultiAgentRuntime, evidenceHash } = require('../src/main/multi-agent-runtime.cjs');
const { createProtocolError, errorCodes, sha256 } = require('../src/shared/contracts.cjs');

class MemoryEventStore {
  constructor() { this.events = []; this.failOn = null; }
  append(type, data = {}, context = {}) {
    if (this.failOn === type) throw new Error(`Injected event failure: ${type}`);
    const event = { type, data, ...context };
    this.events.push(event);
    return event;
  }
}

class FixtureEvolutionManager {
  constructor({ badProposalHash = false } = {}) {
    this.calls = [];
    this.badProposalHash = badProposalHash;
  }

  async run(payload, context) {
    this.calls.push({ payload, context });
    assert.deepEqual(payload.allowedTools, ['page_snapshot', 'module_list']);
    if (context.agentRole === 'proposer') {
      return {
        status: 'ok',
        evolutionRunId: 'evo_proposer_12345678',
        checkpointId: 'chk_proposer_12345678',
        output: { content: 'Activate the committed fixture after independent review.' }
      };
    }
    const prompt = payload.messages[0].content;
    const proposalHash = /"proposalHash":"([^"]+)"/.exec(prompt)?.[1];
    return {
      status: 'ok',
      evolutionRunId: 'evo_reviewer_12345678',
      checkpointId: 'chk_reviewer_12345678',
      output: {
        content: JSON.stringify({
          verdict: 'approve',
          proposalHash: this.badProposalHash ? 'sha256:wrong' : proposalHash,
          reason: 'Committed source identity and bounded scope are consistent.'
        })
      }
    };
  }
}

class FixtureModuleStore {
  constructor() {
    this.active = {};
    this.activations = [];
    this.manifest = {
      id: 'generated.governed',
      version: '1.0.0',
      sourceHash: 'sha256:governed-source',
      status: 'committed'
    };
  }

  list() {
    return { active: { ...this.active }, modules: [this.manifest], candidates: [] };
  }

  activate({ id, version, expectedActiveVersion }) {
    const current = this.active[id] ?? null;
    if (current !== expectedActiveVersion) {
      throw createProtocolError(errorCodes.moduleVersionConflict, 'Active Module version changed before activation.', {
        expectedActiveVersion,
        current
      }, true);
    }
    this.active[id] = version;
    this.activations.push({ id, version, expectedActiveVersion });
    return { moduleId: id, version, previousVersion: current, active: { ...this.active } };
  }
}

function createHarness(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'blankseed-multi-agent-'));
  const eventStore = new MemoryEventStore();
  const evolutionRunManager = new FixtureEvolutionManager(options);
  const moduleStore = new FixtureModuleStore();
  let checkpoints = 0;
  const checkpointStore = {
    create(label) {
      checkpoints += 1;
      return { id: `chk_safety_${String(checkpoints).padStart(8, '0')}`, label };
    }
  };
  const runtime = new MultiAgentRuntime({
    eventStore,
    evolutionRunManager,
    checkpointStore,
    moduleStore,
    workspaceRoot: join(root, 'workspace')
  });
  return { root, eventStore, evolutionRunManager, moduleStore, runtime };
}

test('MultiAgentRuntime anchors hash-bound handoff/review evidence and requires operator apply', async () => {
  const harness = createHarness();
  try {
    const result = await harness.runtime.run({
      task: 'Review activation of a committed capability.',
      proposerAdapter: 'openai.gpt-5.6-terra',
      reviewerAdapter: 'openai.gpt-5.6-sol',
      activation: { id: 'generated.governed', version: '1.0.0' }
    }, { sessionId: 'ses_multi_12345678', requestId: 'req_multi_12345678' });
    assert.equal(result.status, 'ok');
    assert.equal(result.decision.status, 'awaiting_operator');
    assert.notEqual(result.decision.proposal.proposerAgentId, result.decision.review.reviewerAgentId);
    assert.equal(result.handoff.proposalHash, result.decision.review.proposalHash);
    assert.equal(harness.moduleStore.activations.length, 0);
    assert.throws(() => harness.runtime.apply(result.decision.decisionId), /operator confirmation/);

    const applied = harness.runtime.apply(result.decision.decisionId, { confirmed: true });
    assert.equal(applied.status, 'applied');
    assert.equal(applied.activationResult.active['generated.governed'], '1.0.0');
    assert.equal(harness.moduleStore.activations.length, 1);
    assert.ok(harness.eventStore.events.some((event) => event.type === 'multi_agent.handoff.created'));
    assert.ok(harness.eventStore.events.some((event) => event.type === 'governance.decision.applied'));
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('MultiAgentRuntime rejects tampered evidence and stale activation state', async () => {
  const harness = createHarness();
  try {
    const first = await harness.runtime.run({
      task: 'Review self-approval prevention.',
      activation: { id: 'generated.governed', version: '1.0.0' }
    });
    const decisionPath = join(harness.root, 'workspace', 'governance', 'decisions', `${first.decision.decisionId}.json`);
    const tampered = JSON.parse(readFileSync(decisionPath, 'utf8'));
    tampered.review.reviewerAgentId = tampered.proposal.proposerAgentId;
    writeFileSync(decisionPath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
    assert.throws(() => harness.runtime.apply(first.decision.decisionId, { confirmed: true }), /does not match the Main Process anchor/);
    assert.equal(harness.moduleStore.activations.length, 0);

    const second = await harness.runtime.run({
      task: 'Review compare-and-swap protection.',
      activation: { id: 'generated.governed', version: '1.0.0' }
    });
    harness.moduleStore.active['generated.governed'] = '0.9.0';
    assert.throws(() => harness.runtime.apply(second.decision.decisionId, { confirmed: true }), /changed before activation/);
    assert.equal(harness.moduleStore.activations.length, 0);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('MultiAgentRuntime rejects forged rehashed decisions and decisions from an earlier Main Process session', async () => {
  const harness = createHarness();
  try {
    const result = await harness.runtime.run({
      task: 'Review a forged-decision boundary.',
      activation: { id: 'generated.governed', version: '1.0.0' }
    });
    const decisionPath = join(harness.root, 'workspace', 'governance', 'decisions', `${result.decision.decisionId}.json`);
    const forged = JSON.parse(readFileSync(decisionPath, 'utf8'));
    forged.proposal.content = 'Forged proposal content.';
    forged.proposal.proposalHash = sha256(forged.proposal.content);
    forged.handoff.proposalContent = forged.proposal.content;
    forged.handoff.proposalHash = forged.proposal.proposalHash;
    forged.review.proposalHash = forged.proposal.proposalHash;
    const reviewWithoutHash = { ...forged.review };
    delete reviewWithoutHash.reviewHash;
    forged.review.reviewHash = sha256(JSON.stringify(reviewWithoutHash));
    forged.evidenceHash = evidenceHash(forged);
    writeFileSync(decisionPath, `${JSON.stringify(forged, null, 2)}\n`, 'utf8');
    assert.throws(() => harness.runtime.apply(result.decision.decisionId, { confirmed: true }), /does not match the Main Process anchor/);

    const restarted = new MultiAgentRuntime({
      eventStore: harness.eventStore,
      evolutionRunManager: harness.evolutionRunManager,
      checkpointStore: { create() { throw new Error('must not reach checkpoint'); } },
      moduleStore: harness.moduleStore,
      workspaceRoot: join(harness.root, 'workspace')
    });
    assert.throws(() => restarted.apply(result.decision.decisionId, { confirmed: true }), /not anchored in this Main Process session/);
    assert.equal(harness.moduleStore.activations.length, 0);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('MultiAgentRuntime retains applied_unknown when evidence completion fails after activation', async () => {
  const harness = createHarness();
  try {
    const result = await harness.runtime.run({
      task: 'Review post-activation evidence failure handling.',
      activation: { id: 'generated.governed', version: '1.0.0' }
    });
    harness.eventStore.failOn = 'governance.decision.applied';
    assert.throws(() => harness.runtime.apply(result.decision.decisionId, { confirmed: true }), /Injected event failure/);
    const decisionPath = join(harness.root, 'workspace', 'governance', 'decisions', `${result.decision.decisionId}.json`);
    const retained = JSON.parse(readFileSync(decisionPath, 'utf8'));
    assert.equal(retained.status, 'applied_unknown');
    assert.equal(retained.lastApplyFailure.activationAttempted, true);
    assert.equal(retained.lastApplyFailure.observedActiveVersion, '1.0.0');
    assert.throws(() => harness.runtime.apply(result.decision.decisionId, { confirmed: true }), /not anchored/);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});

test('MultiAgentRuntime fails closed when Reviewer does not bind to proposalHash', async () => {
  const harness = createHarness({ badProposalHash: true });
  try {
    const result = await harness.runtime.run({ task: 'Reject an unbound review.' });
    assert.equal(result.status, 'error');
    assert.match(result.error.message, /proposalHash/);
    assert.equal(harness.runtime.list().decisions.length, 0);
  } finally {
    rmSync(harness.root, { recursive: true, force: true });
  }
});
