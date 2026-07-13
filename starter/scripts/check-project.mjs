import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const extensions = new Set(['.js', '.cjs', '.mjs']);
const ignored = new Set(['node_modules', 'workspace']);
let failed = false;
let checked = 0;

function walk(directory) {
  const output = [];
  for (const name of readdirSync(directory)) {
    if (ignored.has(name)) continue;
    const full = join(directory, name);
    const stat = statSync(full);
    if (stat.isDirectory()) output.push(...walk(full));
    else output.push(full);
  }
  return output;
}

const files = walk(root);
for (const file of files) {
  const dot = file.lastIndexOf('.');
  const extension = dot >= 0 ? file.slice(dot) : '';
  if (!extensions.has(extension)) continue;
  checked += 1;
  const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (run.status !== 0) {
    failed = true;
    console.error(`Syntax check failed: ${relative(root, file)}`);
    console.error(run.stderr || run.stdout);
  }
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const defaults = JSON.parse(readFileSync(join(root, 'config', 'defaults.json'), 'utf8'));
if (packageJson.main !== 'src/main/main.cjs') {
  failed = true;
  console.error('package.json main entry is unexpected.');
}
if (!Number.isInteger(defaults.pageWorldId) || defaults.pageWorldId <= 0) {
  failed = true;
  console.error('pageWorldId must be a positive integer.');
}
if (!Number.isInteger(defaults.generatedNodeRuntimeTimeoutMs) || defaults.generatedNodeRuntimeTimeoutMs <= 0) {
  failed = true;
  console.error('generatedNodeRuntimeTimeoutMs must be a positive integer.');
}
if (!Number.isInteger(defaults.generatedRuntimeKillGraceMs) || defaults.generatedRuntimeKillGraceMs <= 0) {
  failed = true;
  console.error('generatedRuntimeKillGraceMs must be a positive integer.');
}
if (!Number.isInteger(defaults.modelTurnTimeoutMs) || defaults.modelTurnTimeoutMs <= 0) {
  failed = true;
  console.error('modelTurnTimeoutMs must be a positive integer.');
}
if (!Number.isInteger(defaults.modelContextEventLimit) || defaults.modelContextEventLimit <= 0) {
  failed = true;
  console.error('modelContextEventLimit must be a positive integer.');
}

if (failed) process.exit(1);
console.log(`Checked ${checked} project JavaScript files; baseline configuration is valid.`);
