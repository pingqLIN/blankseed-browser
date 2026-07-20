import assert from 'node:assert/strict';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOOP_SCHEMA = 'blankseed-development-loop/0.1';

export function parseArguments(argv) {
  const [command = 'status', ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    assert(token.startsWith('--'), `Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = tokens[index + 1];
    assert(value && !value.startsWith('--'), `Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

export function defaultStatePath() {
  return resolve(
    process.env.BLANKSEED_LOOP_STATE_PATH
      || resolve(import.meta.dirname, '../workspace/state/project-development-loop.json')
  );
}

export async function readState(filePath = defaultStatePath()) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeState(state, filePath = defaultStatePath()) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
  return state;
}

function required(options, name) {
  const value = options[name]?.trim();
  assert(value, `--${name} is required`);
  return value;
}

function validDeadline(value) {
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp), `Invalid --deadline: ${value}`);
  assert(timestamp > Date.now(), `--deadline must be in the future: ${value}`);
  return new Date(timestamp).toISOString();
}

export async function updateLoop(command, options, filePath = defaultStatePath(), now = new Date()) {
  const current = await readState(filePath);
  if (command === 'status') return current;

  if (command === 'start') {
    const state = {
      schema: LOOP_SCHEMA,
      profile: options.profile || 'yolo-timeboxed',
      status: 'active',
      startedAt: now.toISOString(),
      deadline: validDeadline(required(options, 'deadline')),
      activeBatch: required(options, 'batch'),
      lastCompletedCheckpoint: options.checkpoint || null,
      nextIntendedAction: required(options, 'next'),
      updatedAt: now.toISOString(),
      checkpoints: current?.schema === LOOP_SCHEMA ? current.checkpoints || [] : []
    };
    return writeState(state, filePath);
  }

  assert(current?.schema === LOOP_SCHEMA, 'No development loop state exists. Run start first.');
  assert(current.status === 'active', `Development loop is ${current.status}.`);

  if (command === 'checkpoint') {
    const label = required(options, 'label');
    const checkpoint = {
      label,
      completedAt: now.toISOString(),
      result: options.result || 'completed'
    };
    const state = {
      ...current,
      activeBatch: options.batch || current.activeBatch,
      lastCompletedCheckpoint: label,
      nextIntendedAction: required(options, 'next'),
      updatedAt: now.toISOString(),
      checkpoints: [...current.checkpoints, checkpoint]
    };
    return writeState(state, filePath);
  }

  if (command === 'finish') {
    const state = {
      ...current,
      status: options.status || 'complete',
      finishedAt: now.toISOString(),
      result: required(options, 'result'),
      nextIntendedAction: options.next || null,
      updatedAt: now.toISOString()
    };
    return writeState(state, filePath);
  }

  throw new Error(`Unknown command: ${command}`);
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArguments(argv);
  const state = await updateLoop(command, options);
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
