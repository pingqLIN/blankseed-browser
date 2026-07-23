'use strict';

const path = require('node:path');
const {
  createProtocolError,
  errorCodes,
  serializeError
} = require('../shared/contracts.cjs');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const MODULE_CONTRACT_INVALID = 'MODULE_CONTRACT_INVALID';

let finished = false;

function postResult(message) {
  if (finished) return;
  finished = true;
  process.parentPort.postMessage(message);
  setImmediate(() => process.exit(message.status === 'ok' ? 0 : 1));
}

function normalizeResult(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw createProtocolError(errorCodes.serializationFailed, 'Generated runtime result is not JSON serializable.', {
      cause: serializeError(error)
    });
  }
}

function createInvocationContext(environment = {}, input = {}) {
  const runtimeEnvironment = environment && typeof environment === 'object' ? environment : {};
  const runtimeInput = input && typeof input === 'object' ? input : {};
  const observation = Object.hasOwn(runtimeInput, 'observation')
    ? runtimeInput.observation
    : (Object.hasOwn(runtimeEnvironment, 'observation') ? runtimeEnvironment.observation : runtimeEnvironment);
  return {
    environment: runtimeEnvironment,
    input: runtimeInput,
    observation
  };
}

function contractError(message, details = {}) {
  return createProtocolError(MODULE_CONTRACT_INVALID, message, {
    contract: 'blankseed-module-runtime/1.1',
    ...details
  });
}

async function resolveModuleResult({ module, returnedValue, environment, input }) {
  const exported = module.exports;
  const context = createInvocationContext(environment, input);
  let entryPoint;
  let value;

  if (exported && typeof exported.execute === 'function') {
    entryPoint = 'execute';
    value = await exported.execute(context);
  } else if (exported && typeof exported.evaluate === 'function') {
    entryPoint = 'evaluate';
    value = await exported.evaluate(context.observation, context.environment);
  } else if (returnedValue !== undefined) {
    entryPoint = 'return';
    value = returnedValue;
  } else {
    throw contractError('Generated module does not provide a supported entry point.', {
      expectedEntryPoints: ['module.exports.execute', 'module.exports.evaluate', 'return value'],
      executeType: typeof exported?.execute,
      evaluateType: typeof exported?.evaluate
    });
  }

  if (value === undefined) {
    throw contractError('Generated module entry point returned undefined.', { entryPoint });
  }
  return value;
}

async function executeSource({ source = '', environment = {}, input = {} } = {}) {
  const module = { exports: {} };
  const exports = module.exports;
  const fn = new AsyncFunction(
    'environment',
    'input',
    'require',
    'process',
    'module',
    'exports',
    '__dirname',
    '__filename',
    `"use strict";\n${source}`
  );
  const returnedValue = await fn(
    environment,
    input,
    require,
    process,
    module,
    exports,
    process.cwd(),
    path.join(process.cwd(), 'source.cjs')
  );
  const value = await resolveModuleResult({
    module,
    returnedValue,
    environment,
    input
  });
  return normalizeResult(value);
}

async function createExecutionMessage(message) {
  const executionId = message?.executionId;
  try {
    const source = typeof message.source === 'string' ? message.source : '';
    const result = await executeSource({
      source,
      environment: message.environment || {},
      input: message.input || {}
    });
    return {
      type: 'result',
      protocol: 'blankseed/0.1',
      executionId,
      status: 'ok',
      result
    };
  } catch (error) {
    return {
      type: 'result',
      protocol: 'blankseed/0.1',
      executionId,
      status: 'error',
      error: serializeError(error, 'GENERATED_RUNTIME_ERROR')
    };
  }
}

async function execute(message) {
  if (!message || message.type !== 'execute') return;
  postResult(await createExecutionMessage(message));
}

if (process.parentPort) {
  process.on('uncaughtException', (error) => {
    postResult({
      type: 'result',
      protocol: 'blankseed/0.1',
      status: 'error',
      error: serializeError(error, 'GENERATED_RUNTIME_ERROR')
    });
  });

  process.on('unhandledRejection', (reason) => {
    postResult({
      type: 'result',
      protocol: 'blankseed/0.1',
      status: 'error',
      error: serializeError(reason, 'GENERATED_RUNTIME_ERROR')
    });
  });

  process.parentPort.on('message', (event) => {
    void execute(event.data);
  });
}

module.exports = {
  MODULE_CONTRACT_INVALID,
  createExecutionMessage,
  createInvocationContext,
  executeSource,
  normalizeResult,
  resolveModuleResult
};
