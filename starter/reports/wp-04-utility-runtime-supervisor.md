# WP-04 Utility Runtime Supervisor Report

Date: 2026-07-13 Asia/Taipei

## Scope

Implemented the WP-04 generated Node runtime supervisor. Generated source now
runs in a disposable Electron `utilityProcess`, outside the main process and
outside remote target renderers.

This report does not claim module-store commit/rollback behavior; that remains
WP-05.

## Changed Behavior

- Added `src/main/process-supervisor.cjs`.
- Replaced the Phase 0 ping-only utility probe with a supervised per-execution
  runtime.
- Added `src/utility/agent-runtime.cjs` support for generated source execution.
- Added IPC/preload channels:
  - `blankseed:utility:execute`
  - `blankseed:utility:stop`
- `utility.ping` now runs through the same supervisor path.
- Added generated runtime config:
  - `generatedNodeRuntimeEnabled`
  - `generatedNodeRuntimeTimeoutMs`
  - `generatedRuntimeMaxLogBytes`
  - `generatedRuntimeKillGraceMs`
- Added process error codes:
  - `PROCESS_EXITED`
  - `PROCESS_KILL_FAILED`
- Generated execution artifacts are written under:

```text
workspace/experiments/<executionId>/
├─ input.json
├─ runtime.json
├─ source.cjs
├─ stdout.log
├─ stderr.log
└─ result.json
```

- Baseline syntax checks now exclude `workspace/` because it contains generated
  snippets and runtime artifacts, not fixed Kernel source.
- Added a minimal UI control for generated Node execution and stop.
- Added ADR-005 to record the disposable utility runtime and Windows process
  tree termination decision.

## Commands and Results

```powershell
npm run check
```

Result:

```text
Checked 18 project JavaScript files; baseline configuration is valid.
```

```powershell
npm test
```

Result:

```text
tests 25
pass 25
fail 0
```

Runtime verification used:

```powershell
node scripts\runtime-wp04-smoke.mjs
```

Result:

```text
exit code 0
```

## Runtime Evidence

Runtime session:

```text
sessionId: ses_111ea884-1a34-4066-8ba6-c342a5c36341
```

Successful generated Node execution:

```json
{
  "requestId": "req_wp04_success",
  "executionId": "exe_223721fb-ad7d-4e73-8c9f-8273ca398e4e",
  "requestKind": "node.execute",
  "status": "ok",
  "sourceHash": "sha256:87b5c5b70b8741082bddaa1ce97698657ad978879dbbc45cfa50c12985557397",
  "result": {
    "platform": "win32",
    "marker": "success"
  }
}
```

Thrown generated error:

```json
{
  "requestId": "req_wp04_throw",
  "executionId": "exe_a4bc4a10-7f2f-4d04-a0ea-60800eb6722f",
  "requestKind": "node.execute",
  "status": "error",
  "error": {
    "code": "GENERATED_RUNTIME_ERROR",
    "message": "wp04 thrown"
  }
}
```

Timeout and Windows descendant process recovery:

```json
{
  "requestId": "req_wp04_timeout",
  "executionId": "exe_78bc6b87-3e0b-4aa6-95e4-bd5e534c5b74",
  "requestKind": "node.execute",
  "status": "error",
  "error": {
    "code": "EXECUTION_TIMEOUT",
    "details": {
      "timeoutMs": 1000,
      "pid": 45516,
      "kill": {
        "method": "taskkill",
        "ok": true,
        "code": 0
      }
    }
  }
}
```

Generated source spawned descendant PID `68176`. The smoke script read the PID
from the execution directory and verified:

```json
{
  "childPid": 68176,
  "aliveAfterKill": false
}
```

Operator stop:

```json
{
  "requestId": "req_wp04_stop",
  "executionId": "exe_ee2fb2dd-4e2c-4df8-b690-53ed89f835fc",
  "status": "error",
  "error": {
    "code": "EXECUTION_CANCELLED",
    "details": {
      "pid": 70972,
      "kill": {
        "method": "taskkill",
        "ok": true,
        "code": 0
      }
    }
  }
}
```

Stop control result:

```json
{
  "stopped": 1,
  "remaining": 0
}
```

Runtime crash and recovery:

```json
{
  "crash": {
    "requestId": "req_wp04_crash",
    "status": "error",
    "error": {
      "code": "PROCESS_EXITED",
      "details": {
        "code": 23
      }
    }
  },
  "recovery": {
    "requestId": "req_wp04_recovery",
    "status": "ok",
    "result": {
      "afterCrash": true
    }
  },
  "statusAlive": true
}
```

Observed runtime event types:

```text
node.execution.started
node.runtime.spawned
node.runtime.stdout
node.runtime.stderr
node.execution.completed
node.execution.failed
node.execution.timeout
node.runtime.kill.requested
node.runtime.kill.completed
node.runtime.stop.requested
node.runtime.stop.confirmed
node.runtime.exited
```

After shutdown delay, no `electron` process remained. Port `127.0.0.1:9333`
only showed `TIME_WAIT` entries and no listener.

## Tests Added

- `test/process-supervisor.test.mjs`
  - success envelope and stream events;
  - hung runtime timeout and kill request;
  - runtime exit without result as `PROCESS_EXITED`.
- `scripts/runtime-wp04-smoke.mjs`
  - successful generated Node execution;
  - thrown generated error;
  - infinite loop timeout;
  - descendant process termination on Windows;
  - operator stop;
  - runtime crash recovery;
  - app status responsiveness after crash.

## Known Limits

- The utility runtime is an observability and recovery boundary, not a security
  sandbox.
- The environment payload is passed to generated source but redacted in stored
  metadata and events.
- The current UI exposes a minimal source textarea and stop button; the richer
  experiment console remains WP-06.
- Generated artifacts under `workspace/experiments/` are ignored by Git and
  excluded from baseline syntax checks; module validation belongs to WP-05.

## Next Smallest Executable Step

Begin WP-05 / Module store:

1. Define and validate immutable module manifests.
2. Add candidate, test, commit, activation and rollback lifecycle states.
3. Link module provenance to execution IDs, source hashes and checkpoints.
4. Preserve module source and metadata in inspectable workspace paths.
