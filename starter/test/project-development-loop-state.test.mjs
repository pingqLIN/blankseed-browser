import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  LOOP_SCHEMA,
  parseArguments,
  readState,
  updateLoop
} from '../scripts/project-development-loop-state.mjs';

test('project development loop persists a resumable external checkpoint trail', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blankseed-loop-state-'));
  const filePath = join(root, 'loop.json');
  const startedAt = new Date('2026-07-20T10:00:00.000Z');
  try {
    const started = await updateLoop('start', {
      deadline: '2030-07-20T13:00:00.000Z',
      batch: 'agent-ui',
      next: 'run ten sandbox tasks'
    }, filePath, startedAt);
    assert.equal(started.schema, LOOP_SCHEMA);
    assert.equal(started.status, 'active');
    assert.equal(started.activeBatch, 'agent-ui');

    const checkpointed = await updateLoop('checkpoint', {
      label: 'agent-ui-verified',
      batch: 'sandbox-tasks',
      next: 'run task 1',
      result: '68 tests and UI smoke passed'
    }, filePath, new Date('2026-07-20T10:30:00.000Z'));
    assert.equal(checkpointed.lastCompletedCheckpoint, 'agent-ui-verified');
    assert.equal(checkpointed.checkpoints.length, 1);
    assert.equal(checkpointed.activeBatch, 'sandbox-tasks');
    assert.deepEqual(await readState(filePath), checkpointed);
    assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), checkpointed);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('project development loop parses command options without positional ambiguity', () => {
  assert.deepEqual(parseArguments([
    'checkpoint', '--label', 'ui-pass', '--next', 'task-1'
  ]), {
    command: 'checkpoint',
    options: { label: 'ui-pass', next: 'task-1' }
  });
});
