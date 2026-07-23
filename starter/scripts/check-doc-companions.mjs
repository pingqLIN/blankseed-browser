import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const starterRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(starterRoot, '..');
const authoritativeFiles = [
  'AGENTS.md',
  'PRODUCT.md',
  'PROJECT_STATUS.md',
  '00_EXTERNAL_AGENT_MASTER_PROMPT.md',
  '01_RESEARCH_CHARTER.md',
  '02_ARCHITECTURE_SPECIFICATION_v0.1.md',
  '03_EXECUTION_PLAN_v0.1.md',
  '04_ACCEPTANCE_AND_STOP_CONDITIONS.md',
  '05_EXPERIMENT_GOVERNANCE_AND_RECOVERY.md',
  '06_PROTOCOL_AND_DATA_CONTRACTS.md',
  '11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.md',
  '08_AGENT_WORK_PACKAGES.md',
  '09_DECISION_LOG.md',
  'MODULE_RUNTIME_CONTRACT.md',
  'USER_GUIDE.md',
  'docs/ARCHITECTURE.md',
  'docs/AGENT_CAPABILITY_LIFECYCLE.md',
  'docs/SECURITY_MODEL.md',
  'VALIDATION_REPORT.md',
  'starter/README.md',
  'starter/reports/phase-1-completion-assessment.md',
  'starter/reports/wp-10-operational-hardening.md',
  'starter/reports/wp-11-automated-evolution-loop.md',
  'starter/reports/sandbox-ten-task-agent-auto-apply.md',
  'starter/reports/wp-12-preflight-foundation.md',
  'starter/reports/module-runtime-contract-phase-0.md',
  'starter/reports/module-runtime-contract-v1.1-final.md'
];

let failed = false;
for (const relativeSource of authoritativeFiles) {
  const relativeCompanion = relativeSource.replace(/\.md$/, '.zh-tw.md');
  const sourcePath = resolve(repoRoot, relativeSource);
  const companionPath = resolve(repoRoot, relativeCompanion);
  if (!existsSync(sourcePath)) {
    failed = true;
    console.error(`Authoritative document is missing: ${relativeSource}`);
    continue;
  }
  if (!existsSync(companionPath)) {
    failed = true;
    console.error(`Traditional Chinese companion is missing: ${relativeCompanion}`);
    continue;
  }
  const companion = readFileSync(companionPath, 'utf8');
  if (!companion.includes('英文原檔為權威來源')) {
    failed = true;
    console.error(`Companion authority marker is missing: ${relativeCompanion}`);
  }
}

const indexPath = resolve(repoRoot, 'KEY_DOCUMENTS.zh-tw.md');
if (!existsSync(indexPath)) {
  failed = true;
  console.error('Traditional Chinese key-document index is missing: KEY_DOCUMENTS.zh-tw.md');
}

if (failed) process.exit(1);
console.log(`Checked ${authoritativeFiles.length} required Traditional Chinese document companions.`);
