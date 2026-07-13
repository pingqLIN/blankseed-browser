# WP-02 Target Lifecycle Report

Date: 2026-07-13 Asia/Taipei

## Scope

Implemented the WP-02 target lifecycle slice: target identity, document
generation freshness checks, stale request failure envelopes, lifecycle events,
and stronger shutdown evidence.

This report does not claim WP-03 timeout/cancel broker behavior or generated
runtime behavior.

## Changed Behavior

- Added target freshness helpers for `targetId` and `documentGeneration`.
- Preload request options can now carry `targetId` and `documentGeneration`.
- IPC validates target freshness hints and passes them as `expectedTarget`.
- Page snapshot, page execution, and CDP send reject stale target requests with
  `TARGET_NAVIGATED` execution-result failures.
- Operations also perform a postflight freshness check against the target token
  captured at operation start.
- Added target lifecycle events:
  - `target.created`
  - `target.navigation.requested`
  - `target.navigation.started`
  - `target.navigation.completed`
  - `target.navigation.in-page`
  - `target.navigation.failed`
  - `target.title.updated`
  - `target.renderer.gone`
  - `target.unresponsive`
  - `target.responsive`
  - `target.destroying`
  - `target.destroyed`
- `target.destroyed` is now recorded from the real WebContents `destroyed`
  event with `isDestroyed: true`.

## Commands and Results

```powershell
npm run check
```

Result:

```text
Checked 38 project files; JavaScript syntax and baseline configuration are valid.
```

```powershell
npm test
```

Result:

```text
tests 16
pass 16
fail 0
```

Runtime verification used:

```powershell
node_modules\electron\dist\electron.exe --remote-debugging-port=9333 .
```

## Runtime Evidence

Runtime session:

```text
sessionId: ses_0ff2a707-b534-48d8-aad9-814a764133dc
```

Freshness token before navigation:

```json
{
  "targetId": 2,
  "documentGeneration": 1
}
```

After navigation to `https://example.org/`:

```json
{
  "targetId": 2,
  "documentGeneration": 2
}
```

Stale request result:

```json
{
  "requestId": "req_wp02_final_stale",
  "kind": "execution.result",
  "requestKind": "page.execute",
  "status": "error",
  "error": {
    "code": "TARGET_NAVIGATED",
    "message": "Target document generation changed before execution.",
    "details": {
      "expectedDocumentGeneration": 1,
      "currentDocumentGeneration": 2
    },
    "retryable": true
  }
}
```

Observed lifecycle events:

```text
target.created
target.navigation.requested
target.navigation.started
target.navigation.completed
page.execution.failed requestId=req_wp02_final_stale
target.destroying
target.destroyed isDestroyed=true
```

Shutdown:

```text
sequence 192: app.window.closing
sequence 193: target.destroying
sequence 194: target.destroyed, isDestroyed=true
```

After shutdown delay, no BlankSeed Electron process or port 9333 listener
remained.

## Tests Added

- Contract tests for integer validation.
- Contract tests for target freshness success and mismatch cases.

## Known Limits

- `documentGeneration` intentionally tracks main-frame cross-document
  navigation only. Same-document route changes are evented but do not currently
  invalidate requests.
- Timeout and cancellation are still WP-03.
- CDP attach/detach recovery is still WP-03.
- The target lifecycle checks are process-local; persisted target session replay
  is not implemented.

## Next Smallest Executable Step

Begin WP-03 / Page and CDP execution broker:

1. Move page/CDP request execution into a small broker module.
2. Centralize source wrapping, command hashing, result serialization, and
   timeout/cancel behavior.
3. Add CDP attach/detach lifecycle handling.
4. Add fixture-backed runtime tests for page execution and raw CDP command
   results.
