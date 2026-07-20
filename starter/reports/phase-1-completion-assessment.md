# Phase 1 Completion-Condition Assessment

Date: 2026-07-18 Asia/Taipei

## Assessment target and decision

“Phase 1” means **Phase 1 — Deterministic Kernel protocol** in the authoritative
`03_EXECUTION_PLAN_v0.1.md`; it does not mean the WP-12 trial series.

Decision: `IMPLEMENTATION PRESENT / COMPLETION EVIDENCE INCOMPLETE`.

The Phase 1 task surface is implemented, and current tests verify most of it.
The phase should not yet be labeled evidence-complete because two explicit test
conditions do not have current automated regression coverage: duplicate IPC
request ID rejection and navigation while an operation is actively executing.
Both have implementation or historical evidence, but historical evidence is not
a substitute for a current repeatable completion gate.

## Evidence reviewed

### VERIFIED in current source and tests

- Runtime contract validation, stable identifiers, payload-size limits,
  structured errors and deterministic execution envelopes exist in
  `src/shared/contracts.cjs` and current contract tests.
- `src/main/ipc-router.cjs` records process-local request IDs and emits
  `DUPLICATE_REQUEST_ID` on reuse.
- `src/main/capability-broker.cjs` records start/completion/failure events,
  applies timeout/cancel handling, normalizes result serialization, and checks
  target freshness both before execution and after the asynchronous operation.
- Current broker tests cover timeout, cancellation, stale target before
  execution, result serialization, CDP lifecycle and recovery.
- Console and navigation events are emitted by the target lifecycle and are
  represented in current contracts/localization tests.
- `npm run check` and `npm test` currently pass with 51 tests.

### VERIFIED historical runtime artifacts

- `starter/reports/wp-01-contracts-events.md` records an actual duplicate
  request rejection and complete success/failure IPC event chains.
- `starter/reports/wp-02-target-lifecycle.md` records target generation change
  and stale request rejection after navigation.
- `starter/reports/wp-10-operational-hardening.md` records page/CDP
  cancellation and CDP recovery runtime evidence.

### UNKNOWN / current evidence gaps

- No current automated test invokes the IPC wrapper twice with the same
  `requestId` and asserts the deterministic second failure/event chain.
- No current automated test starts an asynchronous broker operation, changes
  `documentGeneration` before the operation resolves, and asserts the postflight
  `TARGET_NAVIGATED` failure with no completed-success event.

The code contains both controls. The gap is repeatable acceptance evidence, not
an observed functional regression.

## Required Phase 1 completion conditions

All conditions below are mandatory; one missing condition keeps the phase open.

| Gate | Completion condition | Current state |
| --- | --- | --- |
| P1-C1 | Malformed and oversized payloads return schema-stable structured errors. | VERIFIED |
| P1-C2 | Session/request/execution IDs correlate a complete ordered event chain. | VERIFIED |
| P1-C3 | Stale target tokens fail before execution. | VERIFIED |
| P1-C4 | Navigation during an active operation fails postflight as `TARGET_NAVIGATED`, with no successful completion claim. | EVIDENCE GAP |
| P1-C5 | Reusing an IPC `requestId` deterministically returns `DUPLICATE_REQUEST_ID` and records the failed request. | EVIDENCE GAP |
| P1-C6 | Non-JSON-serializable results return `SERIALIZATION_FAILED` without breaking the event store. | VERIFIED |
| P1-C7 | Page/CDP timeout and cancellation return stable errors and leave no active broker execution; CDP can recover. | VERIFIED |
| P1-C8 | Console/navigation events and target destruction remain observable through shutdown. | VERIFIED by source plus historical runtime evidence |
| P1-C9 | From one clean recorded commit, `npm run check`, `npm test`, and the relevant Windows runtime smoke pass without weakened assertions. | PENDING clean-commit evidence for this slice |

The authoritative exit statement is satisfied only when the same request
produces a deterministic result/error **and** a complete event chain under every
listed negative case. A passing aggregate test count alone is insufficient if a
named Phase 1 case is absent.

## Smallest closure slice

1. Extract or inject the process-local request-ID registry so the IPC wrapper
   can be tested without broad Electron mocking; add a duplicate-ID event-chain
   regression test.
2. Add a broker test whose execution promise stays pending while the target
   generation changes, then assert `TARGET_NAVIGATED`, a failure event and no
   completion event.
3. Run the focused tests, full `npm run verify`, and the Windows runtime smoke
   from a clean recorded commit.
4. Update this assessment to `PHASE 1 VERIFIED COMPLETE` only if P1-C1 through
   P1-C9 are all current and reproducible.

No architecture, permission philosophy or research-scope change is required for
that closure slice, so no new Decision Log entry is currently indicated.
