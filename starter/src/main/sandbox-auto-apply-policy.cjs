'use strict';

const path = require('node:path');
const os = require('node:os');
const {
  createProtocolError,
  errorCodes
} = require('../shared/contracts.cjs');

const POLICY_ID = 'blankseed-sandbox-agent-auto-apply/0.1';

function invalid(message, details = {}) {
  return createProtocolError(errorCodes.invalidRequest, message, details);
}

function rootWithinTemporarySandbox(rootPath, temporaryRoot) {
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  const resolvedRoot = path.resolve(rootPath);
  const scoped = path.relative(resolvedTemporaryRoot, resolvedRoot);
  if (!scoped || path.isAbsolute(scoped) || scoped === '..' || scoped.startsWith(`..${path.sep}`)) return null;
  const sandboxDirectory = scoped.split(path.sep)[0];
  if (!/^blankseed-sandbox-[A-Za-z0-9_-]+$/.test(sandboxDirectory)) return null;
  return {
    sandboxRoot: path.join(resolvedTemporaryRoot, sandboxDirectory),
    resolvedRoot
  };
}

function assertLoopbackEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw invalid('Sandbox Agent auto-apply requires a valid loopback model endpoint.', { endpoint });
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (url.protocol !== 'http:' || !loopbackHosts.has(url.hostname)) {
    throw invalid('Sandbox Agent auto-apply requires an HTTP loopback model endpoint.', {
      origin: url.origin
    });
  }
  return url.origin;
}

function createSandboxAutoApplyPolicy({
  requested = false,
  workspaceRoot,
  dataRoot,
  localModelEndpoint,
  temporaryRoot = os.tmpdir()
} = {}) {
  if (!requested) return null;
  const workspace = rootWithinTemporarySandbox(workspaceRoot, temporaryRoot);
  const data = rootWithinTemporarySandbox(dataRoot, temporaryRoot);
  if (!workspace || !data || workspace.sandboxRoot !== data.sandboxRoot) {
    throw invalid('Sandbox Agent auto-apply requires workspace and data roots inside the same ephemeral blankseed-sandbox-* directory.', {
      workspaceRoot: path.resolve(workspaceRoot || '.'),
      dataRoot: path.resolve(dataRoot || '.'),
      temporaryRoot: path.resolve(temporaryRoot)
    });
  }
  const modelOrigin = assertLoopbackEndpoint(localModelEndpoint);
  const metadata = Object.freeze({
    id: POLICY_ID,
    enabled: true,
    sandboxRoot: workspace.sandboxRoot,
    workspaceRoot: workspace.resolvedRoot,
    dataRoot: data.resolvedRoot,
    modelOrigin,
    isolationClaims: Object.freeze({
      workspace: 'ephemeral-temporary-root',
      data: 'ephemeral-temporary-root',
      modelEgress: 'loopback-only',
      remoteContent: 'electron-sandboxed-renderer',
      hostFilesystem: 'not-isolated',
      securitySandbox: false
    })
  });

  return Object.freeze({
    metadata,
    authorize(decision) {
      if (decision?.status !== 'awaiting_operator' || !decision.activation) {
        throw invalid('Sandbox Agent auto-apply requires an approved decision with a committed activation target.', {
          decisionId: decision?.decisionId ?? null,
          status: decision?.status ?? null
        });
      }
      if (decision.review?.verdict !== 'approve') {
        throw invalid('Sandbox Agent auto-apply requires Reviewer approval.', {
          decisionId: decision.decisionId,
          verdict: decision.review?.verdict ?? null
        });
      }
      if (decision.proposal?.proposerAgentId === decision.review?.reviewerAgentId) {
        throw invalid('Sandbox Agent auto-apply requires distinct Proposer and Reviewer identities.', {
          decisionId: decision.decisionId
        });
      }
      return Object.freeze({
        kind: 'agent-sandbox-policy',
        authorityId: POLICY_ID,
        policyId: POLICY_ID,
        sandboxRoot: metadata.sandboxRoot,
        authorizedAt: new Date().toISOString(),
        isolationClaims: metadata.isolationClaims
      });
    }
  });
}

module.exports = {
  POLICY_ID,
  assertLoopbackEndpoint,
  createSandboxAutoApplyPolicy,
  rootWithinTemporarySandbox
};
