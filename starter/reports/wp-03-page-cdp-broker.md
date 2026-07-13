# WP-03 Page and CDP Broker Report

Date: 2026-07-13 Asia/Taipei

## Scope

Implemented the WP-03 execution broker slice: page execution, page snapshot,
raw CDP command execution, source hashing, result envelopes, timeout handling,
CDP attach/detach events, and fixture-backed runtime smoke coverage.

This report does not claim WP-04 generated capability runtime supervision or
module-store rollback behavior.

## Changed Behavior

- Added `src/main/capability-broker.cjs` as the single broker for:
  - `page.snapshot`
  - `page.execute`
  - `cdp.send`
- `TargetView` now delegates page execution, snapshots, and CDP commands to the
  broker instead of directly touching WebContents execution primitives.
- Broker requests return structured `execution.result` envelopes with:
  - `sessionId`
  - `requestId`
  - `executionId`
  - `requestKind`
  - `sourceHash`
  - `status`
  - serialized `result` or `error`
- Broker records inspectable execution events:
  - `page.snapshot.started`
  - `page.snapshot.completed`
  - `page.snapshot.failed`
  - `page.execution.started`
  - `page.execution.completed`
  - `page.execution.failed`
  - `cdp.command.started`
  - `cdp.command.completed`
  - `cdp.command.failed`
  - `cdp.attach.started`
  - `cdp.attach.completed`
  - `cdp.attach.failed`
  - `cdp.detach.started`
  - `cdp.detach.completed`
  - `cdp.detach.failed`
  - `cdp.detached`
- CDP attach/detach is owned by the broker and detached after the command result
  event is recorded.
- Page execution runs in the configured isolated world and rejects non-JSON
  serializable results with `SERIALIZATION_FAILED`.
- Timeout handling returns retryable `EXECUTION_TIMEOUT` failures.
- Added fixture-backed runtime smoke script:
  - `scripts/runtime-wp03-smoke.mjs`
  - `test/fixtures/basic-page.html`

## Commands and Results

```powershell
npm run check
```

Result:

```text
Checked 43 project files; JavaScript syntax and baseline configuration are valid.
```

```powershell
npm test
```

Result:

```text
tests 22
pass 22
fail 0
```

Runtime verification used:

```powershell
node scripts\runtime-wp03-smoke.mjs
```

Result:

```text
exit code 0
```

## Runtime Evidence

Runtime session:

```text
sessionId: ses_89d97a28-5241-478c-a7b5-68905d0704f2
fixtureUrl: http://127.0.0.1:2204/basic-page.html
targetId: 2
documentGeneration: 2
```

Page execution result:

```json
{
  "requestId": "req_wp03_page_fixture",
  "executionId": "exe_ad17f548-e69c-45ac-9532-afe59a8697a3",
  "requestKind": "page.execute",
  "status": "ok",
  "sourceHash": "sha256:f274080b954aa7f793d6e664f9f7acb5526e8432b354286fec8943440accbf0a",
  "result": {
    "title": "BlankSeed Fixture",
    "heading": "BlankSeed Fixture",
    "nodeType": "undefined",
    "requireType": "undefined"
  }
}
```

The runtime result confirms the page broker executed against the fixture and the
isolated world did not expose Node globals.

CDP result:

```json
{
  "requestId": "req_wp03_cdp_fixture",
  "executionId": "exe_28be2bce-1000-4f5d-add3-5cb2984e9072",
  "requestKind": "cdp.send",
  "status": "ok",
  "sourceHash": "sha256:8cb4612aebf9fe4e5328c6b268295963b972354103ba2b51827ac19478d7fe1f",
  "result": {
    "result": {
      "type": "object",
      "value": {
        "clicked": 1,
        "title": "BlankSeed Fixture"
      }
    }
  }
}
```

Observed broker event order:

```text
page.execution.started
page.execution.completed
cdp.command.started
cdp.attach.started
cdp.attach.completed
cdp.command.completed
cdp.detach.started
cdp.detached
cdp.detach.completed
```

After shutdown, no `electron` process remained. Port `127.0.0.1:9333` only
showed `TIME_WAIT` entries and no listener.

## Tests Added

- Broker unit coverage for page execution envelopes.
- Broker timeout coverage.
- Broker stale-target rejection coverage.
- Broker non-JSON-serializable result coverage.
- Broker CDP attach, command, detach lifecycle coverage.
- Broker CDP attach-failure coverage.
- Fixture-backed runtime smoke for page execution and raw CDP command execution.

## Known Limits

- Timeout handling is local to broker promises; no user-facing cancel API exists
  yet.
- CDP detach failures are captured, but there is not yet a recovery policy for
  repeated debugger detach failures.
- Broker output is inspectable in the event store, but generated capability
  provenance and rollback are still WP-04/WP-05 work.

## Next Smallest Executable Step

Begin WP-04 / Utility runtime supervisor:

1. Add a minimal supervised utility-process execution path behind the broker.
2. Record module identity, input, output, error, timeout, and exit metadata.
3. Guarantee process termination on timeout or app shutdown.
4. Add tests and runtime evidence for a successful utility run and a timeout
   termination.
