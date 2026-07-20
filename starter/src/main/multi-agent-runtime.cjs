'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertIdentifier,
  assertPlainObject,
  assertString,
  createProtocolError,
  errorCodes,
  serializeError,
  sha256
} = require('../shared/contracts.cjs');

const MULTI_AGENT_SCHEMA = 'blankseed-multi-agent-run/0.1';
const GOVERNANCE_SCHEMA = 'blankseed-governance-decision/0.1';
const GOVERNED_TOOLS = Object.freeze(['page_snapshot', 'module_list']);

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

function evidenceHash(decision) {
  return sha256(JSON.stringify({
    multiAgentRunId: decision.multiAgentRunId,
    proposal: decision.proposal,
    handoff: decision.handoff,
    review: decision.review,
    activation: decision.activation
  }));
}

function parseReview(content, proposalHash) {
  const normalized = String(content || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let value;
  try {
    value = JSON.parse(normalized);
  } catch (error) {
    throw createProtocolError(errorCodes.invalidRequest, 'Reviewer output must be one JSON object.', {
      cause: serializeError(error)
    });
  }
  assertPlainObject(value, 'review');
  const verdict = assertString(value.verdict, 'review.verdict', { max: 20 });
  if (!['approve', 'reject'].includes(verdict)) {
    throw createProtocolError(errorCodes.invalidRequest, 'Reviewer verdict must be approve or reject.', { verdict });
  }
  if (value.proposalHash !== proposalHash) {
    throw createProtocolError(errorCodes.invalidRequest, 'Reviewer proposalHash does not match the handoff.', {
      expected: proposalHash,
      actual: value.proposalHash ?? null
    });
  }
  return {
    verdict,
    proposalHash,
    reason: assertString(value.reason, 'review.reason', { max: 2000 })
  };
}

class MultiAgentRuntime {
  constructor({ eventStore, evolutionRunManager, checkpointStore, moduleStore, workspaceRoot }) {
    this.eventStore = eventStore;
    this.evolutionRunManager = evolutionRunManager;
    this.checkpointStore = checkpointStore;
    this.moduleStore = moduleStore;
    this.root = path.join(path.resolve(workspaceRoot), 'multi-agent-runs');
    this.decisionsRoot = path.join(path.resolve(workspaceRoot), 'governance', 'decisions');
    this.active = new Map();
    this.pending = new Map();
    fs.mkdirSync(this.root, { recursive: true });
    fs.mkdirSync(this.decisionsRoot, { recursive: true });
  }

  async run(payload = {}, context = {}) {
    const task = assertString(payload.task, 'task', { max: 12000 }).trim();
    const proposerAdapter = assertString(payload.proposerAdapter || 'local.manual', 'proposerAdapter', { max: 120 });
    const reviewerAdapter = assertString(payload.reviewerAdapter || proposerAdapter, 'reviewerAdapter', { max: 120 });
    const activation = this.#normalizeActivation(payload.activation);
    const multiAgentRunId = `mar_${crypto.randomUUID()}`;
    const proposerAgentId = `agt_${crypto.randomUUID()}`;
    const reviewerAgentId = `agt_${crypto.randomUUID()}`;
    const controller = new AbortController();
    const directory = path.join(this.root, multiAgentRunId);
    const evidencePath = path.join(directory, 'run.json');
    const runContext = { ...context, multiAgentRunId };
    const evidence = {
      schema: MULTI_AGENT_SCHEMA,
      multiAgentRunId,
      sessionId: context.sessionId ?? null,
      requestId: context.requestId ?? null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: 'running',
      task,
      agents: [
        { agentId: proposerAgentId, role: 'proposer', adapter: proposerAdapter, allowedTools: GOVERNED_TOOLS },
        { agentId: reviewerAgentId, role: 'reviewer', adapter: reviewerAdapter, allowedTools: GOVERNED_TOOLS }
      ],
      activation,
      proposalRun: null,
      handoff: null,
      reviewRun: null,
      decision: null,
      error: null
    };
    this.active.set(multiAgentRunId, { controller });
    writeJsonAtomic(evidencePath, evidence);
    this.eventStore.append('multi_agent.run.started', {
      multiAgentRunId,
      proposerAgentId,
      reviewerAgentId,
      proposerAdapter,
      reviewerAdapter,
      activation,
      evidencePath
    }, runContext);

    try {
      const proposalRun = await this.evolutionRunManager.run({
        adapter: proposerAdapter,
        allowedTools: [...GOVERNED_TOOLS],
        maxTurns: payload.maxTurns,
        maxActions: payload.maxActions,
        timeoutMs: payload.timeoutMs,
        options: payload.options || {},
        messages: [{
          role: 'user',
          content: [
            'You are the Proposer in a governed sequential Multi-Agent review.',
            'Use only the offered observation tools. Do not Commit, Activate, Rollback, or modify state.',
            'Produce a concise proposal for the operator and Reviewer.',
            `Task: ${task}`,
            activation ? `Requested activation: ${activation.moduleId}@${activation.version}` : 'Requested activation: none.'
          ].join('\n')
        }]
      }, {
        ...runContext,
        agentId: proposerAgentId,
        agentRole: 'proposer'
      }, { signal: controller.signal });
      evidence.proposalRun = proposalRun;
      this.#assertEvolutionSuccess(proposalRun, 'Proposer');
      const proposalContent = assertString(proposalRun.output?.content, 'proposal content', { max: 12000 });
      const handoffId = `hnd_${crypto.randomUUID()}`;
      const proposalHash = sha256(proposalContent);
      const handoff = {
        handoffId,
        fromAgentId: proposerAgentId,
        toAgentId: reviewerAgentId,
        parentEvolutionRunId: proposalRun.evolutionRunId,
        checkpointId: proposalRun.checkpointId,
        proposalHash,
        proposalContent
      };
      evidence.handoff = handoff;
      writeJsonAtomic(evidencePath, evidence);
      this.eventStore.append('multi_agent.handoff.created', {
        handoffId,
        fromAgentId: proposerAgentId,
        toAgentId: reviewerAgentId,
        proposalHash,
        parentEvolutionRunId: proposalRun.evolutionRunId
      }, { ...runContext, agentId: proposerAgentId, handoffId });

      const reviewRun = await this.evolutionRunManager.run({
        adapter: reviewerAdapter,
        allowedTools: [...GOVERNED_TOOLS],
        maxTurns: payload.maxTurns,
        maxActions: payload.maxActions,
        timeoutMs: payload.timeoutMs,
        options: payload.options || {},
        messages: [{
          role: 'user',
          content: [
            'You are the Reviewer in a governed sequential Multi-Agent review.',
            'Use only the offered observation tools. Do not Commit, Activate, Rollback, or modify state.',
            'Return exactly one JSON object with keys verdict, proposalHash, and reason.',
            'verdict must be approve or reject. Echo the exact proposalHash.',
            `Task: ${task}`,
            `Handoff: ${JSON.stringify(handoff)}`,
            activation ? `Requested activation: ${JSON.stringify(activation)}` : 'Requested activation: none.'
          ].join('\n')
        }]
      }, {
        ...runContext,
        agentId: reviewerAgentId,
        agentRole: 'reviewer',
        parentAgentId: proposerAgentId,
        handoffId
      }, { signal: controller.signal });
      evidence.reviewRun = reviewRun;
      this.#assertEvolutionSuccess(reviewRun, 'Reviewer');
      const parsedReview = parseReview(reviewRun.output?.content, proposalHash);
      const review = {
        reviewerAgentId,
        adapter: reviewerAdapter,
        evolutionRunId: reviewRun.evolutionRunId,
        handoffId,
        ...parsedReview
      };
      review.reviewHash = sha256(JSON.stringify(review));
      const decision = this.#createDecision({
        multiAgentRunId,
        proposal: {
          proposerAgentId,
          adapter: proposerAdapter,
          evolutionRunId: proposalRun.evolutionRunId,
          content: proposalContent,
          proposalHash
        },
        handoff,
        review,
        activation
      }, runContext);
      evidence.decision = decision;
      evidence.status = 'ok';
      evidence.finishedAt = new Date().toISOString();
      writeJsonAtomic(evidencePath, evidence);
      this.eventStore.append('multi_agent.run.completed', {
        multiAgentRunId,
        governanceDecisionId: decision.decisionId,
        verdict: review.verdict,
        decisionStatus: decision.status,
        evidencePath
      }, { ...runContext, governanceDecisionId: decision.decisionId });
      return {
        multiAgentRunId,
        status: 'ok',
        evidencePath,
        handoff,
        decision
      };
    } catch (error) {
      evidence.status = 'error';
      evidence.finishedAt = new Date().toISOString();
      evidence.error = serializeError(error);
      writeJsonAtomic(evidencePath, evidence);
      this.eventStore.append('multi_agent.run.failed', {
        multiAgentRunId,
        evidencePath,
        error: evidence.error
      }, runContext);
      return { multiAgentRunId, status: 'error', evidencePath, error: evidence.error };
    } finally {
      this.active.delete(multiAgentRunId);
    }
  }

  list() {
    const decisions = fs.readdirSync(this.decisionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^gov_[A-Za-z0-9_-]+\.json$/.test(entry.name))
      .map((entry) => {
        try { return JSON.parse(fs.readFileSync(path.join(this.decisionsRoot, entry.name), 'utf8')); } catch { return null; }
      })
      .filter(Boolean)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return { activeRunIds: [...this.active.keys()], decisions };
  }

  cancel({ multiAgentRunId } = {}, context = {}) {
    const records = multiAgentRunId
      ? [[multiAgentRunId, this.active.get(multiAgentRunId)]]
      : [...this.active.entries()];
    const active = records.filter(([, record]) => record);
    for (const [, record] of active) record.controller.abort('cancel');
    this.eventStore.append('multi_agent.run.cancelled', {
      requestedRunId: multiAgentRunId ?? null,
      cancelled: active.length,
      activeRunIds: active.map(([id]) => id)
    }, context);
    return { cancelled: active.length };
  }

  apply(decisionId, { confirmed = false, operatorId = 'operator.local' } = {}, context = {}) {
    const governanceDecisionId = assertIdentifier(decisionId, 'governanceDecisionId', 'gov');
    const anchor = this.pending.get(governanceDecisionId);
    if (!anchor) {
      throw createProtocolError(errorCodes.invalidRequest, 'Governance decision is not anchored in this Main Process session.', {
        governanceDecisionId
      });
    }
    const persistedDecision = this.#readDecision(governanceDecisionId);
    const persistedHash = sha256(JSON.stringify(persistedDecision));
    if (persistedHash !== anchor.fileHash) {
      throw createProtocolError(errorCodes.invalidRequest, 'Governance decision file does not match the Main Process anchor.', {
        governanceDecisionId,
        expectedFileHash: anchor.fileHash,
        actualFileHash: persistedHash
      });
    }
    const decision = anchor.decision;
    if (!confirmed) throw createProtocolError(errorCodes.invalidRequest, 'Governance apply requires explicit operator confirmation.');
    if (decision.status !== 'awaiting_operator') {
      throw createProtocolError(errorCodes.invalidRequest, 'Governance decision is not awaiting operator confirmation.', {
        governanceDecisionId,
        status: decision.status
      });
    }
    if (decision.proposal.proposerAgentId === decision.review.reviewerAgentId) {
      throw createProtocolError(errorCodes.invalidRequest, 'An Agent cannot review its own proposal.', { governanceDecisionId });
    }
    if (decision.review.verdict !== 'approve' || decision.review.proposalHash !== decision.proposal.proposalHash) {
      throw createProtocolError(errorCodes.invalidRequest, 'Governance review does not approve the immutable proposal.', { governanceDecisionId });
    }
    const reviewWithoutHash = { ...decision.review };
    delete reviewWithoutHash.reviewHash;
    const recalculatedReviewHash = sha256(JSON.stringify(reviewWithoutHash));
    if (recalculatedReviewHash !== decision.review.reviewHash || evidenceHash(decision) !== decision.evidenceHash) {
      throw createProtocolError(errorCodes.invalidRequest, 'Governance decision evidence hash does not match.', {
        governanceDecisionId,
        recalculatedReviewHash
      });
    }
    if (!decision.activation) {
      throw createProtocolError(errorCodes.invalidRequest, 'Governance decision has no activation target.', { governanceDecisionId });
    }
    const current = this.moduleStore.list();
    const manifest = current.modules.find((entry) => entry.id === decision.activation.moduleId && entry.version === decision.activation.version);
    if (!manifest || manifest.sourceHash !== decision.activation.sourceHash) {
      throw createProtocolError(errorCodes.moduleVersionConflict, 'Governance activation target no longer matches committed evidence.', {
        governanceDecisionId,
        moduleId: decision.activation.moduleId,
        version: decision.activation.version
      });
    }
    const applying = {
      ...decision,
      status: 'applying',
      operator: { operatorId: assertString(operatorId, 'operatorId', { max: 120 }), confirmedAt: new Date().toISOString() }
    };
    writeJsonAtomic(this.#decisionPath(governanceDecisionId), applying);
    let activationAttempted = false;
    let safetyCheckpoint = null;
    try {
      safetyCheckpoint = this.checkpointStore.create(`before governance apply ${governanceDecisionId}`, {
        ...context,
        governanceDecisionId
      });
      activationAttempted = true;
      const activation = this.moduleStore.activate({
        id: decision.activation.moduleId,
        version: decision.activation.version,
        expectedActiveVersion: decision.activation.expectedActiveVersion
      }, { ...context, governanceDecisionId, kind: 'governance.activate' });
      const applied = {
        ...applying,
        status: 'applied',
        appliedAt: new Date().toISOString(),
        safetyCheckpointId: safetyCheckpoint.id,
        activationResult: activation
      };
      writeJsonAtomic(this.#decisionPath(governanceDecisionId), applied);
      this.pending.delete(governanceDecisionId);
      this.eventStore.append('governance.decision.applied', {
        governanceDecisionId,
        multiAgentRunId: decision.multiAgentRunId,
        moduleId: decision.activation.moduleId,
        version: decision.activation.version,
        sourceHash: decision.activation.sourceHash,
        safetyCheckpointId: safetyCheckpoint.id,
        operatorId
      }, { ...context, governanceDecisionId, multiAgentRunId: decision.multiAgentRunId });
      return applied;
    } catch (error) {
      const activeAfterFailure = this.moduleStore.list().active[decision.activation.moduleId] ?? null;
      const activationStateUnknown = activationAttempted && activeAfterFailure === decision.activation.version;
      const failed = {
        ...decision,
        status: activationStateUnknown ? 'applied_unknown' : 'awaiting_operator',
        safetyCheckpointId: safetyCheckpoint?.id ?? null,
        lastApplyFailure: {
          at: new Date().toISOString(),
          error: serializeError(error),
          activationAttempted,
          observedActiveVersion: activeAfterFailure
        }
      };
      writeJsonAtomic(this.#decisionPath(governanceDecisionId), failed);
      if (activationStateUnknown) this.pending.delete(governanceDecisionId);
      else this.#anchorDecision(failed);
      this.eventStore.append('governance.decision.apply_failed', {
        governanceDecisionId,
        status: failed.status,
        activationAttempted,
        observedActiveVersion: activeAfterFailure,
        error: failed.lastApplyFailure.error
      }, { ...context, governanceDecisionId, multiAgentRunId: decision.multiAgentRunId });
      throw error;
    }
  }

  getActiveCount() {
    return this.active.size;
  }

  #normalizeActivation(value) {
    if (value === undefined || value === null || value.id === '' || value.version === '') return null;
    const input = assertPlainObject(value, 'activation');
    const moduleId = assertString(input.id, 'activation.id', { max: 120 });
    const version = assertString(input.version, 'activation.version', { max: 80 });
    const state = this.moduleStore.list();
    const manifest = state.modules.find((entry) => entry.id === moduleId && entry.version === version);
    if (!manifest) {
      throw createProtocolError(errorCodes.invalidRequest, 'Governance activation target is not a committed Module version.', {
        moduleId,
        version
      });
    }
    return {
      moduleId,
      version,
      sourceHash: manifest.sourceHash,
      expectedActiveVersion: state.active[moduleId] ?? null
    };
  }

  #createDecision({ multiAgentRunId, proposal, handoff, review, activation }, context) {
    const decisionId = `gov_${crypto.randomUUID()}`;
    const decision = {
      schema: GOVERNANCE_SCHEMA,
      decisionId,
      multiAgentRunId,
      createdAt: new Date().toISOString(),
      proposal,
      handoff,
      review,
      activation,
      status: review.verdict === 'approve' && activation ? 'awaiting_operator' : review.verdict === 'approve' ? 'reviewed' : 'rejected'
    };
    decision.evidenceHash = evidenceHash(decision);
    writeJsonAtomic(this.#decisionPath(decisionId), decision);
    if (decision.status === 'awaiting_operator') this.#anchorDecision(decision);
    this.eventStore.append('governance.decision.created', {
      governanceDecisionId: decisionId,
      multiAgentRunId,
      verdict: review.verdict,
      status: decision.status,
      proposalHash: proposal.proposalHash,
      reviewHash: review.reviewHash,
      evidenceHash: decision.evidenceHash,
      activation
    }, { ...context, governanceDecisionId: decisionId });
    return decision;
  }

  #assertEvolutionSuccess(result, label) {
    if (result?.status !== 'ok' || typeof result.output?.content !== 'string' || !result.output.content.trim()) {
      throw createProtocolError(errorCodes.modelAdapterFailed, `${label} Agent Run did not produce reviewable content.`, {
        evolutionRunId: result?.evolutionRunId ?? null,
        status: result?.status ?? null,
        error: result?.error ?? null
      });
    }
  }

  #readDecision(decisionId) {
    const filePath = this.#decisionPath(decisionId);
    if (!fs.existsSync(filePath)) {
      throw createProtocolError(errorCodes.invalidRequest, 'Governance decision does not exist.', { governanceDecisionId: decisionId });
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  #anchorDecision(decision) {
    const serialized = JSON.stringify(decision);
    this.pending.set(decision.decisionId, {
      decision: JSON.parse(serialized),
      fileHash: sha256(serialized)
    });
  }

  #decisionPath(decisionId) {
    return path.join(this.decisionsRoot, `${decisionId}.json`);
  }
}

module.exports = {
  GOVERNANCE_SCHEMA,
  GOVERNED_TOOLS,
  MULTI_AGENT_SCHEMA,
  MultiAgentRuntime,
  evidenceHash,
  parseReview
};
