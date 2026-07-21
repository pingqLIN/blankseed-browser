import assert from 'node:assert/strict';
import test from 'node:test';

import { AsyncResourceScope, throwWithCleanupFailures } from '../scripts/async-resource-scope.mjs';

test('resource scope attempts every cleanup in reverse acquisition order', async () => {
  const calls = [];
  const scope = new AsyncResourceScope();
  scope.defer('temporary-root', async () => { calls.push('temporary-root'); });
  scope.defer('server', async () => { calls.push('server'); throw new Error('server close failed'); });
  scope.defer('electron', async () => { calls.push('electron'); throw new Error('termination failed'); });
  scope.defer('cdp', async () => { calls.push('cdp'); });

  const failures = await scope.close();
  assert.deepEqual(calls, ['cdp', 'electron', 'server', 'temporary-root']);
  assert.deepEqual(failures.map((failure) => failure.label), ['electron', 'server']);
  assert.deepEqual(await scope.close(), []);
});

for (const stage of ['pre-spawn', 'spawn', 'CDP', 'assertion']) {
  test(`resource scope preserves cleanup after injected ${stage} failure`, async () => {
    const calls = [];
    const scope = new AsyncResourceScope();
    scope.defer('temporary-root', async () => { calls.push('temporary-root'); });
    scope.defer('server', async () => { calls.push('server'); });
    if (stage !== 'pre-spawn') scope.defer('electron', async () => { calls.push('electron'); });
    if (stage === 'CDP' || stage === 'assertion') scope.defer('cdp', async () => { calls.push('cdp'); });

    const primary = new Error(`${stage} fixture`);
    const failures = await scope.close();
    assert.throws(() => throwWithCleanupFailures(primary, failures), new RegExp(`${stage} fixture`));
    assert(calls.includes('temporary-root'));
    assert(calls.includes('server'));
  });
}

test('termination failure does not hide the primary assertion and later cleanup still runs', async () => {
  const calls = [];
  const scope = new AsyncResourceScope();
  scope.defer('temporary-root', async () => { calls.push('temporary-root'); });
  scope.defer('server', async () => { calls.push('server'); });
  scope.defer('electron', async () => { calls.push('electron'); throw new Error('termination fixture'); });

  const failures = await scope.close();
  assert.deepEqual(calls, ['electron', 'server', 'temporary-root']);
  assert.throws(
    () => throwWithCleanupFailures(new Error('assertion fixture'), failures),
    (error) => error instanceof AggregateError
      && error.errors.some((entry) => entry.message === 'assertion fixture')
      && error.errors.some((entry) => entry.message === 'termination fixture')
  );
});
