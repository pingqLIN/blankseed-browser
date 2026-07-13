import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const {
  channels,
  assertFreshTarget,
  assertIdentifier,
  assertInteger,
  assertPayloadSize,
  normalizeUrl,
  assertString,
  createExecutionResult,
  createProtocolError,
  errorCodes,
  normalizeConsoleMessage,
  serializeError,
  sha256
} = require('../src/shared/contracts.cjs');

test('normalizeUrl adds https scheme', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
});

test('normalizeUrl rejects unsupported protocols', () => {
  assert.throws(() => normalizeUrl('file:///tmp/a'), /Only http and https/);
});

test('assertString enforces maximum length', () => {
  assert.throws(() => assertString('abcd', 'value', { max: 3 }), /length/);
});

test('assertInteger enforces integer range', () => {
  assert.equal(assertInteger(3, 'count', { min: 0, max: 3 }), 3);
  assert.throws(() => assertInteger(4, 'count', { min: 0, max: 3 }), /integer/);
});

test('serializeError produces stable fields', () => {
  const result = serializeError(Object.assign(new Error('failure'), { code: 'TEST_FAILURE' }));
  assert.equal(result.code, 'TEST_FAILURE');
  assert.equal(result.name, 'Error');
  assert.equal(result.message, 'failure');
  assert.equal(typeof result.stack, 'string');
  assert.deepEqual(result.details, {});
  assert.equal(result.retryable, false);
});

test('assertIdentifier validates prefixes', () => {
  assert.equal(assertIdentifier('req_12345678', 'requestId', 'req'), 'req_12345678');
  assert.throws(() => assertIdentifier('exe_12345678', 'requestId', 'req'), /requestId/);
});

test('assertFreshTarget rejects stale target identity or generation', () => {
  const current = { targetId: 7, documentGeneration: 2 };
  assert.equal(assertFreshTarget(current, { targetId: 7, documentGeneration: 2 }), current);
  assert.throws(() => assertFreshTarget(current, { targetId: 8 }), /Target identity changed/);
  assert.throws(() => assertFreshTarget(current, { documentGeneration: 1 }), /document generation changed/);
});

test('assertPayloadSize rejects oversized JSON payloads', () => {
  assert.equal(assertPayloadSize({ a: 'ok' }, 20), 10);
  assert.throws(() => assertPayloadSize({ a: 'too long' }, 10), /Payload exceeds/);
});

test('createProtocolError and serializeError keep structured fields', () => {
  const error = createProtocolError(errorCodes.executionTimeout, 'timeout', { timeoutMs: 1 }, true);
  const serialized = serializeError(error);
  assert.equal(serialized.code, 'EXECUTION_TIMEOUT');
  assert.deepEqual(serialized.details, { timeoutMs: 1 });
  assert.equal(serialized.retryable, true);
});

test('sha256 returns stable prefixed hashes', () => {
  assert.equal(
    sha256('abc'),
    'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('createExecutionResult returns deterministic envelope shape', () => {
  const result = createExecutionResult({
    sessionId: 'ses_12345678',
    requestId: 'req_12345678',
    executionId: 'exe_12345678',
    kind: 'page.execute',
    startedAt: '2026-07-12T00:00:00.000Z',
    finishedAt: '2026-07-12T00:00:00.042Z',
    sourceHash: sha256('return 1;'),
    result: { ok: true }
  });
  assert.equal(result.protocol, 'blankseed/0.1');
  assert.equal(result.status, 'ok');
  assert.equal(result.requestKind, 'page.execute');
  assert.equal(result.durationMs, 42);
  assert.deepEqual(result.error, null);
});

test('sandboxed preload avoids local module imports and preserves channel strings', () => {
  const source = readFileSync(resolve(import.meta.dirname, '..', 'src', 'preload', 'preload.cjs'), 'utf8');
  assert.doesNotMatch(source, /require\(['"]\.\./);
  for (const channel of Object.values(channels)) {
    assert.match(source, new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('normalizeConsoleMessage reads Electron details-object events', () => {
  assert.deepEqual(normalizeConsoleMessage({
    level: 'info',
    message: 'hello',
    lineNumber: 12,
    sourceId: 'https://example.com/app.js',
    frame: { url: 'https://example.com/' }
  }), {
    level: 'info',
    message: 'hello',
    lineNumber: 12,
    sourceId: 'https://example.com/app.js',
    frameUrl: 'https://example.com/'
  });
});

test('normalizeConsoleMessage preserves legacy positional events', () => {
  assert.deepEqual(normalizeConsoleMessage({}, 2, 'legacy', 7, 'https://example.org/a.js'), {
    level: 'warning',
    message: 'legacy',
    lineNumber: 7,
    sourceId: 'https://example.org/a.js',
    frameUrl: null
  });
});
