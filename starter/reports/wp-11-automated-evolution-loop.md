# WP-11 Automated Local Evolution Loop Report

Date: 2026-07-17 Asia/Taipei

## Goal and scope

Close the Phase 5 exit gap by running the Phase 4 failure/correction/reuse
experiment through automated model turns while preserving the existing Kernel,
remote-renderer isolation, module rollback and evidence boundaries.

This slice is fixture-first and local-only. It does not add hosted credentials,
non-loopback endpoints, task-level action verbs, dependency mutation, automatic
source acceptance or a WP-09 merge.

## Architecture and contract

- Added main-process `EvolutionRunManager` and `RawCapabilityDispatcher`.
- Added narrow `evolution.run` and `evolution.cancel` IPC/preload methods.
- The dispatcher exposes raw infrastructure families: page snapshot/execute,
  CDP, supervised Node execution, module lifecycle and checkpoint creation.
- Unknown or malformed tools become structured `INVALID_REQUEST` results; model
  text never selects an arbitrary IPC channel.
- Every run creates an `evo_*` ID and pre-run checkpoint. Events and generated
  module provenance carry run/turn/action correlation identities.
- Each run persists `workspace/evolution-runs/<evo_*>/run.json` with messages,
  context/input hashes, normalized outputs, action requests/results, source
  hashes, metrics and terminal outcome.
- Action results are capped at 1 MiB and complete run manifests at 16 MiB.
  Budget overflow returns structured size/hash evidence and stops later
  dispatch instead of growing artifacts without bound.
- The OpenAI-compatible encoder now sends packaged context, raw tool
  definitions and correlated tool results; it accepts tool-only responses with
  `content: null` and still sends no Authorization header.
- `BLANKSEED_WORKSPACE_ROOT` provides a non-secret isolated runtime-workspace
  override for deterministic smoke tests. Normal launches keep the existing
  `starter/workspace` default.
- The Windows smoke allocates an ephemeral CDP port and requires a unique
  per-launch nonce in the control-page URL before it can send `Browser.close`.
  Any readiness failure cleans up its own spawned child before rethrowing.

The architectural boundary is recorded by ADR-011. The provider-neutral action
and evidence contracts are recorded in `06_PROTOCOL_AND_DATA_CONTRACTS.md` and
its Traditional Chinese companion.

## Automated experiment evidence

The loopback fixture, not the smoke script, selected this action sequence:

1. `page_snapshot`
2. `module_candidate_create` with a source result containing `BigInt`
3. `module_candidate_test` and observe `SERIALIZATION_FAILED`
4. `module_candidate_create` with corrected serializable source
5. `module_candidate_test`
6. `module_candidate_commit`
7. `module_activate`
8. `module_invoke`
9. terminal assistant response

The smoke script only supplied the user goal, fixture model transport and
assertions. It did not create or correct module source through renderer module
APIs.

## Commands and results

Focused integration tests:

```powershell
node --test test/model-adapter.test.mjs test/evolution-loop.test.mjs
```

Result after malformed/duplicate-call, bounded action cancellation and evidence
budget coverage: 12 passed, 0
failed.

Final static and full unit/integration suite:

```powershell
npm run check
npm test
```

Result:

```text
Checked 32 project JavaScript files.
Checked 16 required Traditional Chinese document companions.
41 tests passed, 0 failed.
```

Windows Electron evolution smoke:

```powershell
node scripts/runtime-wp11-evolution-loop-smoke.mjs
```

Result:

```text
model requests: 9
model turns: 9
raw actions: 8
expected failed actions: 1
active generated module: generated.wp11.runtime@0.1.0
correlated events: 68
second Electron session: distinct session ID
restart reuse: ok
generated runtime remaining: 0
ephemeral CDP ownership nonce verified: true
CDP port reusable after both launches: true
exit code: 0
```

The successful smoke verified the run manifest before deleting its isolated
temporary workspace. No Authorization header was sent, and packaged context
plus raw tool definitions were present in all nine fixture requests.

The completion reviewer initially rejected the runtime claim because the first
version used a fixed CDP port and could lose a child handle during readiness
failure. The final smoke uses an allocated ephemeral port, nonce ownership
proof, launch-local failure cleanup and port-reuse assertions; the revised
runtime passed those checks.

## Preserved first-failure evidence

The first runtime attempt completed the product evolution loop and wrote its
module/run evidence, then the test harness waited indefinitely for a
`Browser.close` CDP response after Electron had already exited. The scoped Node
harness was stopped, and the failed temporary evidence remains at
`%TEMP%\blankseed-wp11-bqnySq`.

The harness was corrected to send `Browser.close` without awaiting a response,
then await the Electron child exit with a scoped kill fallback. The same smoke
was rerun and passed. This failure was not erased or counted as a successful
verification run.

## Manual verification note

- Launch command: `node scripts/runtime-wp11-evolution-loop-smoke.mjs`
- Tested URL: loopback `http://127.0.0.1:<ephemeral>/basic-page.html`
- Action: ask the fixture model to create, test, correct, commit, activate and
  invoke a capability through raw model tools; close Electron; start a second
  isolated Electron session and invoke the persisted active module.
- Expected: one observable serialization failure, model-generated correction,
  immutable committed version, correlated run evidence, restart reuse and
  clean process/port shutdown.
- Actual: matched the expected result in the successful rerun.
- Relevant evidence: per-run `workspace/evolution-runs/<evo_*>/run.json`,
  `<userData>/blankseed-data/events/events.jsonl` and this durable report.

## Boundaries and residual risk

- Fixture evidence proves protocol, dispatch, correction and reuse behavior; it
  does not prove real local-model quality or prompt-injection robustness.
- Evolution cancellation prevents later action dispatch and cancels an active
  model request. Cancellation during an action is tested: after that action
  settles, no later model turn/action is dispatched. **Stop All** additionally
  requests broker and generated-runtime termination. This does not promise
  immediate termination of JavaScript that Chromium has already started.
- Generated Node execution remains an observability/recovery boundary, not a
  secure sandbox.
- Hosted credentials, streaming, non-loopback endpoints, parallel runs,
  dependency changes and automatic source acceptance remain out of scope.
- The WP-09 candidate branch remains unmerged and unchanged.
