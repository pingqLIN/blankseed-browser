'use strict';

const PROTOCOL = 'blankseed/0.1';
const DEFAULT_IPC_PAYLOAD_LIMIT_BYTES = 1_048_576;
const ID_PATTERN = /^(req|exe|ses|chk|evo|act|mar|agt|hnd|gov|rst)_[A-Za-z0-9][A-Za-z0-9_-]{7,}$/;

const errorCodes = Object.freeze({
  invalidRequest: 'INVALID_REQUEST',
  duplicateRequestId: 'DUPLICATE_REQUEST_ID',
  targetUnavailable: 'TARGET_UNAVAILABLE',
  targetNavigated: 'TARGET_NAVIGATED',
  serializationFailed: 'SERIALIZATION_FAILED',
  executionTimeout: 'EXECUTION_TIMEOUT',
  executionCancelled: 'EXECUTION_CANCELLED',
  processExited: 'PROCESS_EXITED',
  processKillFailed: 'PROCESS_KILL_FAILED',
  cdpAttachFailed: 'CDP_ATTACH_FAILED',
  cdpDetached: 'CDP_DETACHED',
  modelAdapterFailed: 'MODEL_ADAPTER_FAILED',
  checkpointFailed: 'CHECKPOINT_FAILED',
  moduleVersionConflict: 'MODULE_VERSION_CONFLICT'
});

const channels = Object.freeze({
  statusGet: 'blankseed:status:get',
  targetNavigate: 'blankseed:target:navigate',
  targetBack: 'blankseed:target:back',
  targetForward: 'blankseed:target:forward',
  targetReload: 'blankseed:target:reload',
  targetSnapshot: 'blankseed:target:snapshot',
  pageExecute: 'blankseed:page:execute',
  cdpSend: 'blankseed:cdp:send',
  executionCancel: 'blankseed:execution:cancel',
  checkpointCreate: 'blankseed:checkpoint:create',
  checkpointList: 'blankseed:checkpoint:list',
  checkpointRead: 'blankseed:checkpoint:read',
  checkpointRestore: 'blankseed:checkpoint:restore',
  eventsTail: 'blankseed:events:tail',
  utilityPing: 'blankseed:utility:ping',
  utilityExecute: 'blankseed:utility:execute',
  utilityStop: 'blankseed:utility:stop',
  moduleList: 'blankseed:module:list',
  moduleCreateCandidate: 'blankseed:module:candidate:create',
  moduleTestCandidate: 'blankseed:module:candidate:test',
  moduleCommitCandidate: 'blankseed:module:candidate:commit',
  moduleActivate: 'blankseed:module:activate',
  moduleDeactivate: 'blankseed:module:deactivate',
  moduleRollback: 'blankseed:module:rollback',
  moduleInvoke: 'blankseed:module:invoke',
  modelTurn: 'blankseed:model:turn',
  modelCancel: 'blankseed:model:cancel',
  modelConfigurationGet: 'blankseed:model:configuration:get',
  modelConfigurationLocalUpdate: 'blankseed:model:configuration:local:update',
  modelConfigurationOpenAISet: 'blankseed:model:configuration:openai:set',
  modelConfigurationOpenAIClear: 'blankseed:model:configuration:openai:clear',
  evolutionRun: 'blankseed:evolution:run',
  evolutionCancel: 'blankseed:evolution:cancel',
  multiAgentRun: 'blankseed:multi-agent:run',
  multiAgentCancel: 'blankseed:multi-agent:cancel',
  multiAgentList: 'blankseed:multi-agent:list',
  governanceApply: 'blankseed:governance:apply',
  eventPush: 'blankseed:event:push'
});

function assertPlainObject(value, name = 'value') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be a plain object.`);
  }
  return value;
}

function assertString(value, name, { min = 1, max = 1_000_000 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new TypeError(`${name} must be a string with length ${min}..${max}.`);
  }
  return value;
}

function assertInteger(value, name, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} must be an integer in range ${min}..${max}.`);
  }
  return value;
}

function assertIdentifier(value, name, prefix) {
  const input = assertString(value, name, { min: 8, max: 120 });
  if (!ID_PATTERN.test(input) || (prefix && !input.startsWith(`${prefix}_`))) {
    throw createProtocolError(errorCodes.invalidRequest, `${name} is not a valid ${prefix ?? 'BlankSeed'} identifier.`);
  }
  return input;
}

function measureJsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  } catch (error) {
    throw createProtocolError(errorCodes.serializationFailed, 'Payload is not JSON serializable.', {
      cause: serializeError(error)
    });
  }
}

function assertPayloadSize(value, maxBytes = DEFAULT_IPC_PAYLOAD_LIMIT_BYTES) {
  const bytes = measureJsonBytes(value);
  if (bytes > maxBytes) {
    throw createProtocolError(errorCodes.invalidRequest, `Payload exceeds ${maxBytes} bytes.`, { bytes, maxBytes });
  }
  return bytes;
}

function normalizeUrl(value) {
  const input = assertString(value, 'url', { min: 1, max: 8192 }).trim();
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(input);
  const withScheme = hasScheme ? input : `https://${input}`;
  const parsed = new URL(withScheme);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError('Only http and https URLs are supported by the starter.');
  }
  return parsed.toString();
}

function createProtocolError(code, message, details = {}, retryable = false) {
  return Object.assign(new Error(message), {
    code,
    details,
    retryable
  });
}

function assertFreshTarget(current, expected = {}) {
  if (!expected || typeof expected !== 'object') return current;
  const expectedTargetId = expected.targetId;
  const expectedDocumentGeneration = expected.documentGeneration;
  if (expectedTargetId !== undefined && current.targetId !== expectedTargetId) {
    throw createProtocolError(errorCodes.targetNavigated, 'Target identity changed before execution.', {
      expectedTargetId,
      currentTargetId: current.targetId
    }, true);
  }
  if (expectedDocumentGeneration !== undefined && current.documentGeneration !== expectedDocumentGeneration) {
    throw createProtocolError(errorCodes.targetNavigated, 'Target document generation changed before execution.', {
      expectedDocumentGeneration,
      currentDocumentGeneration: current.documentGeneration
    }, true);
  }
  return current;
}

function serializeError(error, fallbackCode = 'INTERNAL_ERROR') {
  return {
    code: typeof error?.code === 'string' ? error.code : fallbackCode,
    name: typeof error?.name === 'string' ? error.name : 'Error',
    message: typeof error?.message === 'string' ? error.message : String(error),
    stack: typeof error?.stack === 'string' ? error.stack : null,
    details: error?.details && typeof error.details === 'object' ? error.details : {},
    retryable: Boolean(error?.retryable)
  };
}

function sha256(value) {
  const crypto = require('node:crypto');
  return `sha256:${crypto.createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}

function createExecutionResult({
  sessionId,
  requestId,
  executionId,
  kind,
  startedAt,
  finishedAt = new Date().toISOString(),
  sourceHash = null,
  result = null
}) {
  return {
    protocol: PROTOCOL,
    sessionId,
    requestId,
    executionId,
    kind: 'execution.result',
    requestKind: kind,
    status: 'ok',
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    sourceHash,
    result,
    error: null
  };
}

function createExecutionFailure({
  sessionId,
  requestId,
  executionId,
  kind,
  startedAt,
  finishedAt = new Date().toISOString(),
  sourceHash = null,
  error
}) {
  return {
    protocol: PROTOCOL,
    sessionId,
    requestId,
    executionId,
    kind: 'execution.result',
    requestKind: kind,
    status: 'error',
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    sourceHash,
    result: null,
    error: serializeError(error)
  };
}

function normalizeConsoleMessage(details, legacyLevel, legacyMessage, legacyLineNumber, legacySourceId) {
  const level = details?.level ?? legacyLevel;
  const legacyLevelNames = ['debug', 'info', 'warning', 'error'];
  return {
    level: typeof level === 'number' ? legacyLevelNames[level] ?? String(level) : level ?? null,
    message: details?.message ?? legacyMessage ?? '',
    lineNumber: Number.isInteger(details?.lineNumber) ? details.lineNumber : legacyLineNumber ?? null,
    sourceId: details?.sourceId ?? legacySourceId ?? null,
    frameUrl: details?.frame?.url ?? null
  };
}

module.exports = {
  PROTOCOL,
  DEFAULT_IPC_PAYLOAD_LIMIT_BYTES,
  channels,
  errorCodes,
  assertIdentifier,
  assertInteger,
  assertFreshTarget,
  assertPayloadSize,
  assertPlainObject,
  assertString,
  createExecutionFailure,
  createExecutionResult,
  createProtocolError,
  measureJsonBytes,
  normalizeUrl,
  normalizeConsoleMessage,
  serializeError,
  sha256
};
