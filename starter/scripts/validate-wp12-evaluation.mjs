import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isPathInside, validateEvaluationSidecar } = require('../src/shared/wp12-preflight.cjs');

const starterRoot = resolve(import.meta.dirname, '..');
const evaluationRoot = resolve(starterRoot, 'workspace', 'evolution-runs');
const requested = process.argv[2];

if (!requested) {
  console.error('Usage: npm run validate:wp12:evaluation -- workspace/evolution-runs/<evolutionRunId>/wp12-evaluation.json');
  process.exit(2);
}

const path = resolve(starterRoot, requested);
if (!isPathInside(path, evaluationRoot) || !existsSync(path)) {
  console.error('Evaluation sidecar must exist inside starter/workspace/evolution-runs/.');
  process.exit(2);
}

let sidecar;
try {
  sidecar = JSON.parse(readFileSync(path, 'utf8'));
} catch {
  console.error('Evaluation sidecar is not valid JSON.');
  process.exit(2);
}

const result = validateEvaluationSidecar(sidecar);
if (!result.valid) {
  for (const error of result.errors) console.error(`INVALID: ${error}`);
  process.exit(1);
}

console.log('WP-12 evaluation sidecar is schema-valid. This does not imply a trial pass.');
