# BlankSeed Agent Runtime Reliability Upgrade v0.1 - Phase 4 Report

## Goal

Replace the fixed 30-second evolution model-turn timeout with a bounded, auditable policy appropriate to long Agent work.

## Current-state finding

The direct model and evolution paths both defaulted to `modelTurnTimeoutMs: 30000`. The evolution IPC inserted that value even when the caller omitted a timeout, so the run manager had no opportunity to select a longer analysis, code-generation, or verification budget.

## Minimal change

- Added pure policy module `src/main/adaptive-timeout-policy.cjs`.
- Added validated Runtime configuration:
  - simple: 30,000 ms;
  - analysis: 90,000 ms;
  - code generation/correction: 120,000 ms;
  - verification: 180,000 ms.
- The first evolution turn is analysis. The next turn is classified from the previous action kind/status.
- Every decision emits `evolution.turn.timeout.selected` and is stored with the transcript turn.
- An explicit operator `timeoutMs` remains authoritative within 1–300,000 ms.
- The evolution IPC now leaves an omitted timeout absent so the policy can operate.
- Direct model calls and Page/CDP/Node action timeouts remain unchanged; no automatic retry was added.
- ADR-024 records the policy and rollback triggers.

## Tests and acceptance

```text
node --test test/adaptive-timeout-policy.test.mjs test/evolution-loop.test.mjs
tests 16, pass 16, fail 0

npm run check
Checked 59 project JavaScript files; baseline configuration is valid.
Checked 24 required Traditional Chinese document companions.

git diff --check
PASS
```

The integration fixture verifies that three consecutive model turns receive 90,000, 120,000, and 180,000 ms, rather than the old 30,000-ms default, and that event/evidence metadata matches. It does not spend 180 seconds waiting on a wall clock.

Phase 4 result: **PASS**.

## Rollback

Remove the policy module/config/tests and transcript metadata, restore the IPC default injection, and revert ADR-024. Direct-model behavior needs no rollback because it was not changed.
