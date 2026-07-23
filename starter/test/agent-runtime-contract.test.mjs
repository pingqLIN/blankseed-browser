import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  MODULE_CONTRACT_INVALID,
  createExecutionMessage,
  executeSource
} = require('../src/utility/agent-runtime.cjs');

test('Module Runtime Contract A preserves a direct return value', async () => {
  const result = await executeSource({
    source: 'return { status: "ok" };'
  });

  assert.deepEqual(result, { status: 'ok' });
});

test('Module Runtime Contract B invokes an async execute export with context', async () => {
  const result = await executeSource({
    source: `
module.exports.execute = async (context) => ({
  action: 'test',
  observation: context.observation,
  environmentMarker: context.environment.marker
});`,
    environment: {
      marker: 'environment',
      observation: { adShowing: true }
    }
  });

  assert.deepEqual(result, {
    action: 'test',
    observation: { adShowing: true },
    environmentMarker: 'environment'
  });
});

test('Module Runtime Contract C invokes a legacy evaluate export', async () => {
  const result = await executeSource({
    source: `
module.exports.evaluate = (observation, runtimeEnvironment) => ({
  action: 'legacy',
  adShowing: observation.adShowing,
  stateMarker: runtimeEnvironment.stateMarker
});`,
    environment: {
      observation: { adShowing: true },
      stateMarker: 'legacy-state'
    }
  });

  assert.deepEqual(result, {
    action: 'legacy',
    adShowing: true,
    stateMarker: 'legacy-state'
  });
});

test('Module Runtime rejects a source with no supported entry point', async () => {
  const message = await createExecutionMessage({
    type: 'execute',
    executionId: 'exe_contract_invalid',
    source: 'const internalOnly = { status: "unused" };'
  });

  assert.equal(message.status, 'error');
  assert.equal(message.executionId, 'exe_contract_invalid');
  assert.equal(message.error.code, MODULE_CONTRACT_INVALID);
  assert.match(message.error.message, /does not provide a supported entry point/);
  assert.deepEqual(message.error.details.expectedEntryPoints, [
    'module.exports.execute',
    'module.exports.evaluate',
    'return value'
  ]);
});

test('Module Runtime uses execute before evaluate and direct return', async () => {
  const result = await executeSource({
    source: `
module.exports.evaluate = () => ({ selected: 'evaluate' });
module.exports.execute = async () => ({ selected: 'execute' });
return { selected: 'return' };`
  });

  assert.deepEqual(result, { selected: 'execute' });
});

test('Module Runtime rejects an exported entry point that returns undefined', async () => {
  await assert.rejects(
    executeSource({ source: 'module.exports.execute = async () => undefined;' }),
    (error) => {
      assert.equal(error.code, MODULE_CONTRACT_INVALID);
      assert.equal(error.details.entryPoint, 'execute');
      return true;
    }
  );
});
