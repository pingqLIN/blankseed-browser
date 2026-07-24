# BlankSeed Agent Runtime Reliability Upgrade v0.1 - Phase 1 Report

## Goal

Preserve retryability, protocol error identity, and checkpoint provenance when an evolution model turn fails.

## Current-state finding

`ModelTurnManager` already serialized `EXECUTION_TIMEOUT` with `retryable: true`. `EvolutionRunManager` recreated that failure with `createProtocolError(...)` but omitted its fourth `retryable` argument. The run-level catch then serialized the wrapper without checkpoint, turn, or action provenance. This changed a recoverable model timeout into a non-retryable final run error.

## Minimal change

- `src/main/evolution-loop.cjs`
  - Preserves `turn.error.retryable` when recreating a protocol error.
  - Adds the run checkpoint to the post-checkpoint Runtime context.
  - Enriches the final structured error with `checkpointId`, `turnId`, `actionId`, and a bounded structured `cause` while retaining the original `code`, `message`, `details`, and `retryable` fields.
  - Applies the same serializer to returned and thrown action failures before they enter model feedback, durable evidence, and event records.
  - Emits one `evolution.run.retry.decided` event for the terminal error. A retryable error is marked `checkpoint-recovery-eligible`, but `automaticRetry` remains `false`.
- `test/evolution-loop.test.mjs`
  - Adds a regression adapter that throws retryable `EXECUTION_TIMEOUT`.
  - Verifies identical metadata in the returned result, durable `run.json`, failed event, and retry decision event.
  - Verifies checkpoint, turn, and action provenance for both returned and thrown action errors.

No model adapter, Module API, permission policy, activation policy, or automatic retry behavior changed.

## Acceptance

Executed from `starter/` in the isolated worktree:

```text
node --test test/evolution-loop.test.mjs
tests 13, pass 13, fail 0

npm run check
Checked 59 project JavaScript files; baseline configuration is valid.
Checked 24 required Traditional Chinese document companions.

git diff --check
PASS
```

Phase 1 result: **PASS**.

## Rollback

Revert only the Phase 1 hunks in `src/main/evolution-loop.cjs` and remove the corresponding regression test. The Phase 0 Git ref and archives remain the authoritative pre-upgrade recovery handles.
