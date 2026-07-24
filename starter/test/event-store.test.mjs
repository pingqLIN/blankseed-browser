import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EventStore } = require('../src/main/event-store.cjs');

function withStore(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'blankseed-events-'));
  try {
    return fn(new EventStore(directory, { sessionId: 'ses_12345678' }), directory);
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

test('EventStore persists external page evidence only after de-identification', () => withStore((store, directory) => {
  const event = store.append('page.snapshot.completed', {
    url: 'https://private-site.example/landing',
    title: 'Sensitive page title',
    text: 'Sensitive page body',
    elements: [{ tag: 'button', name: 'Sensitive control label' }]
  });
  const fixture = store.append('page.snapshot.completed', {
    url: 'https://example.org/fixture',
    title: 'Fixture title',
    text: 'Fixture text'
  });
  const raw = readFileSync(join(directory, 'events', 'events.jsonl'), 'utf8');

  assert.equal(event.data.url, '[redacted:external-target]');
  assert.equal(event.data.title, '[redacted:external-page-content]');
  assert.equal(event.data.text, '[redacted:external-page-content]');
  assert.equal(event.data.elements[0].name, '[redacted:external-page-content]');
  assert.equal(event.data.persistenceRedaction.status, 'redacted');
  assert.equal(fixture.data.url, 'https://example.org/fixture');
  assert.equal(fixture.data.title, 'Fixture title');
  assert.equal(fixture.data.persistenceRedaction, undefined);
  assert.equal(raw.includes('private-site.example'), false);
  assert.equal(raw.includes('Sensitive page'), false);
  assert.equal(raw.includes('Sensitive control'), false);
}));

test('EventStore fails closed when a value cannot be inspected for redaction', () => withStore((store, directory) => {
  const unsafe = {};
  Object.defineProperty(unsafe, 'url', {
    enumerable: true,
    get() {
      throw new Error('must not serialize this value');
    }
  });

  const event = store.append('page.snapshot.completed', unsafe);
  const raw = readFileSync(join(directory, 'events', 'events.jsonl'), 'utf8');

  assert.equal(event.data.persistenceRedaction.status, 'failed_closed');
  assert.equal(raw.includes('must not serialize this value'), false);
}));
