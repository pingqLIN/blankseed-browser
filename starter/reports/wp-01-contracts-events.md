# WP-01 Contracts and Event Store Report

Date: 2026-07-13 Asia/Taipei

## Scope

Implemented the first WP-01 slice: runtime contract helpers, request identity,
structured IPC errors, payload-size checks, execution result envelopes, and
ordered event context.

This report intentionally does not claim WP-02 target lifecycle invalidation or
WP-03 page/CDP timeout/cancel broker behavior.

## Changed Behavior

- Added shared protocol helpers:
  - identifier validation for `req_*`, `exe_*`, `ses_*`, `chk_*`;
  - JSON payload byte measurement and `ipcPayloadLimitBytes`;
  - structured protocol errors with `code`, `details`, and `retryable`;
  - SHA-256 source/command hashes;
  - `execution.result` success/failure envelope helpers.
- IPC requests now receive or accept a `requestId`.
- Duplicate `requestId` values are rejected with `DUPLICATE_REQUEST_ID`.
- Oversized payloads are rejected with `INVALID_REQUEST` and byte-count details.
- IPC success/failure responses include `protocol` and `requestId`.
- The preload API remains backward compatible while allowing optional
  `{ requestId }`.
- Event records now include default `sessionId`, optional `requestId`, and
  optional `executionId`.
- Event serialization failures are retained as `event.serialization.failed`
  records instead of crashing the event pipeline.
- Page snapshot, page execution, and CDP commands now return the shared
  `execution.result` envelope and write request/execution context into events.

## Commands and Results

```powershell
npm run check
```

Result:

```text
Checked 35 project files; JavaScript syntax and baseline configuration are valid.
```

```powershell
npm test
```

Result:

```text
tests 14
pass 14
fail 0
```

Runtime verification used:

```powershell
node_modules\electron\dist\electron.exe --remote-debugging-port=9333 .
```

## Runtime Evidence

Runtime session:

```text
sessionId: ses_8ff2f1d6-db42-4969-b7b1-7b0dec3397cb
dataRoot: C:\Users\miles\AppData\Roaming\blankseed-browser-starter\blankseed-data
```

Successful page execution returned:

```json
{
  "protocol": "blankseed/0.1",
  "requestId": "req_wp01_page_0001",
  "executionId": "exe_33518695-4bd0-4489-95b3-825af02913af",
  "kind": "execution.result",
  "requestKind": "page.execute",
  "status": "ok",
  "sourceHash": "sha256:d5389f6910aaace489af216315e860abdfc7aeca4a057b284a2a2eb7dc4743e8"
}
```

Duplicate request rejection returned to the renderer:

```json
{
  "code": "DUPLICATE_REQUEST_ID",
  "requestId": "req_wp01_err_0001",
  "protocol": "blankseed/0.1"
}
```

Oversized payload rejection returned to the renderer:

```json
{
  "code": "INVALID_REQUEST",
  "requestId": "req_wp01_err_big1",
  "details": {
    "bytes": 1050061,
    "maxBytes": 1048576
  }
}
```

Observed event chain for a successful page request:

```text
ipc.request.started -> page.execution.started -> page.execution.completed -> ipc.request.completed
```

Observed failure events:

```text
ipc.request.failed requestId=req_wp01_err_0001 code=DUPLICATE_REQUEST_ID
ipc.request.failed requestId=req_wp01_err_big1 code=INVALID_REQUEST
```

Shutdown evidence:

```text
app.window.closing recorded; no Electron process or port 9333 listener remained after shutdown delay.
```

## Tests Added

- Contract helper tests for identifier validation, payload limits, structured
  protocol errors, hashing, and execution result envelope shape.
- Event store tests for sequence/context preservation and serialization failure
  fallback.

## Decision Log

No new ADR was added. The changes implement the existing Phase 1 protocol and
event-store plan without changing research scope, trust boundaries, or platform
selection.

## Known Limits

- Navigation invalidation and stale target rejection remain WP-02.
- Page/CDP timeout, cancellation, and broker lifecycle hardening remain WP-03.
- Event payloads still include full page execution source for inspectability;
  future retention/rotation policy belongs in later governance work.
- Request IDs are process-local duplicate checks only; persistence across app
  restarts is not implemented.
- The utility runtime is still a Phase 0 ping/pong probe, not arbitrary generated
  Node execution.

## Next Smallest Executable Step

Begin WP-02 / Target lifecycle:

1. Add explicit target document generation checks to request envelopes.
2. Reject stale target requests deterministically.
3. Strengthen target console/crash/unresponsive event coverage.
4. Add focused tests or runtime fixtures for navigation during execution.
