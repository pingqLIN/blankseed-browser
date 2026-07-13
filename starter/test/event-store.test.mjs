import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EventStore } = require('../src/main/event-store.cjs');

function withStore(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'blankseed-events-'));
  try {
    return fn(new EventStore(directory, { sessionId: 'ses_12345678' }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('EventStore appends ordered events with context fields', () => withStore((store) => {
  const first = store.append('example.started', { ok: true }, {
    requestId: 'req_12345678',
    executionId: 'exe_12345678'
  });
  const second = store.append('example.completed');

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(first.sessionId, 'ses_12345678');
  assert.equal(first.requestId, 'req_12345678');
  assert.equal(first.executionId, 'exe_12345678');

  const tail = store.tail(2);
  assert.deepEqual(tail.map((event) => event.sequence), [1, 2]);
  assert.equal(tail[0].type, 'example.started');
}));

test('EventStore records serialization failures as inspectable events', () => withStore((store) => {
  store.append('example.bigint', { value: 1n }, { requestId: 'req_12345678' });
  const [event] = store.tail(1);

  assert.equal(event.type, 'event.serialization.failed');
  assert.equal(event.sessionId, 'ses_12345678');
  assert.equal(event.requestId, 'req_12345678');
  assert.equal(event.data.originalType, 'example.bigint');
  assert.equal(event.data.error.code, 'SERIALIZATION_FAILED');
}));
