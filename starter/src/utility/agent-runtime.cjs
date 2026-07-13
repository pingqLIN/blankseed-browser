'use strict';

const path = require('node:path');
const {
  createProtocolError,
  errorCodes,
  serializeError
} = require('../shared/contracts.cjs');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let finished = false;

function postResult(message) {
  if (finished) return;
  finished = true;
  process.parentPort.postMessage(message);
  setImmediate(() => process.exit(message.status === 'ok' ? 0 : 1));
}

function normalizeResult(value) {
  const result = value === undefined ? null : value;
  try {
    return JSON.parse(JSON.stringify(result));
  } catch (error) {
    throw createProtocolError(errorCodes.serializationFailed, 'Generated runtime result is not JSON serializable.', {
      cause: serializeError(error)
    });
  }
}

async function execute(message) {
  if (!message || message.type !== 'execute') return;
  try {
    const source = typeof message.source === 'string' ? message.source : '';
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
    const value = await fn(
      message.environment || {},
      message.input || {},
      require,
      process,
      module,
      exports,
      process.cwd(),
      path.join(process.cwd(), 'source.cjs')
    );
    postResult({
      type: 'result',
      protocol: 'blankseed/0.1',
      executionId: message.executionId,
      status: 'ok',
      result: normalizeResult(value)
    });
  } catch (error) {
    postResult({
      type: 'result',
      protocol: 'blankseed/0.1',
      executionId: message.executionId,
      status: 'error',
      error: serializeError(error, 'GENERATED_RUNTIME_ERROR')
    });
  }
}

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
