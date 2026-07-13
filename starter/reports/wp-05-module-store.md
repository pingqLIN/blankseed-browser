# WP-05 Module Store Report

Date: 2026-07-13 Asia/Taipei

## Scope

Implemented the WP-05 module store slice: manifest validation, candidate/test
commit lifecycle, immutable versions, activation, rollback, provenance links and
module invocation through the WP-04 utility runtime supervisor.

This report does not claim the full WP-06 experiment console or model adapter.

## Changed Behavior

- Added `src/main/module-store.cjs`.
- Added module IPC/preload channels:
  - `blankseed:module:list`
  - `blankseed:module:candidate:create`
  - `blankseed:module:candidate:test`
  - `blankseed:module:candidate:commit`
  - `blankseed:module:activate`
  - `blankseed:module:deactivate`
  - `blankseed:module:rollback`
  - `blankseed:module:invoke`
- Added `MODULE_VERSION_CONFLICT`.
- Module manifests use the `blankseed-module/0.1` shape and validate:
  - `id`
  - `version`
  - `entry`
  - `runtime`
  - `sourceHash`
  - `provenance`
  - `dependencies`
  - `tests`
  - `status`
- Candidate test executions run through the WP-04 process supervisor as
  `module.test`.
- Active module invocation runs through the WP-04 process supervisor as
  `module.invoke`.
- Test execution IDs are added to manifest provenance.
- Commit and invoke recompute the source hash and reject tampered source.
- Committed versions are immutable at:

```text
workspace/modules/<moduleId>/versions/<version>/
├─ index.cjs
└─ manifest.json
```

- Active module pointers are persisted at:

```text
workspace/state/active-modules.json
```

- `workspace/modules/*` and `workspace/state/*` are ignored by Git except
  `.gitkeep`.

## Commands and Results

```powershell
npm run check
```

Result:

```text
Checked 21 project JavaScript files; baseline configuration is valid.
```

```powershell
npm test
```

Result:

```text
tests 27
pass 27
fail 0
```

Runtime verification used:

```powershell
node scripts\runtime-wp05-smoke.mjs
```

Result:

```text
exit code 0
```

## Runtime Evidence

Runtime module:

```text
moduleId: generated.wp05.smoke.1783926574802
first sessionId: ses_7cb2cc67-49cd-426f-b705-fd437e587136
second sessionId: ses_8768e998-42cd-466f-906b-c83023e5a39d
```

Version `0.1.0` candidate:

```json
{
  "candidateId": "cand_bda4926a-4140-4d70-81b0-54acb2c02a96",
  "version": "0.1.0",
  "status": "candidate",
  "sourceHash": "sha256:c3ca30738e41c42173969ecfdef5a88b26cba0e2c494ec876803c2c84a64fdcd"
}
```

Version `0.1.0` test and commit:

```json
{
  "passed": true,
  "testExecutionId": "exe_e6082994-c9b3-4eaa-a754-0ee5167e0f75",
  "committedStatus": "committed",
  "provenanceExecutionIds": [
    "exe_wp05_source",
    "exe_e6082994-c9b3-4eaa-a754-0ee5167e0f75"
  ]
}
```

Duplicate commit conflict:

```json
{
  "code": "MODULE_VERSION_CONFLICT",
  "message": "Module version already exists."
}
```

Activation and invocation of `0.1.0`:

```json
{
  "active": {
    "generated.wp05.smoke.1783926574802": "0.1.0"
  },
  "invoke": {
    "requestId": "req_wp05_invoke_v1",
    "requestKind": "module.invoke",
    "status": "ok",
    "result": {
      "version": "0.1.0",
      "value": 42
    }
  }
}
```

Activation and invocation of `0.2.0`:

```json
{
  "previousVersion": "0.1.0",
  "version": "0.2.0",
  "invoke": {
    "status": "ok",
    "result": {
      "version": "0.2.0",
      "value": 43
    }
  }
}
```

Rollback to `0.1.0` and invoke:

```json
{
  "rollback": {
    "fromVersion": "0.2.0",
    "toVersion": "0.1.0"
  },
  "invokeAfterRollback": {
    "status": "ok",
    "result": {
      "version": "0.1.0",
      "value": 42
    }
  }
}
```

Restart persistence:

```json
{
  "statusAlive": true,
  "activeVersion": "0.1.0",
  "invoked": {
    "status": "ok",
    "result": {
      "version": "0.1.0",
      "value": 42
    }
  }
}
```

Observed module event types:

```text
module.candidate.created
module.candidate.tested
module.version.committed
module.activated
module.invocation.started
module.invocation.completed
module.rollback.completed
```

After shutdown delay, no `electron` process remained. Port `127.0.0.1:9333`
only showed `TIME_WAIT` entries and no listener.

## Tests Added

- `test/module-store.test.mjs`
  - candidate creation, testing, immutable commit, activation and invocation;
  - duplicate version rejection with `MODULE_VERSION_CONFLICT`;
  - rollback to an older version;
  - active state reload after constructing a new store.
- `scripts/runtime-wp05-smoke.mjs`
  - end-to-end module lifecycle through real Electron IPC and utilityProcess;
  - restart persistence proof.

## Known Limits

- Only `node` runtime modules are executable in this slice. Manifest validation
  accepts future runtime values, but `module.invoke` currently runs Node source.
- Candidate testing currently means the source executes successfully. Richer
  declared test cases remain future work.
- Module browser UI is still WP-06.
- Module artifacts are local workspace artifacts and ignored by Git by default.

## Next Smallest Executable Step

Begin WP-06 / Experiment console:

1. Add a compact console for current target, runtime and active module state.
2. Add request/source editors for page, CDP, Node and module operations.
3. Add timeline and checkpoint/module browsers.
4. Add stop-all status that distinguishes requested stop from confirmed stop.
