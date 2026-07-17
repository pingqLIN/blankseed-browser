# Agent Work Packages

Each package should be completed as an independently reviewable change.

## WP-00 Baseline

- Run starter.
- Fix only reproducible starter defects.
- Produce Phase 0 report.

## WP-01 Contracts and event store

- Implement runtime payload validation.
- Add session/request/execution IDs.
- Replace ad-hoc logs with ordered event records.
- Unit-test error shapes.

## WP-02 Target lifecycle

- Track navigation/document generation.
- Invalidate stale requests.
- Capture target console/crash/unresponsive events.
- Explicitly destroy view resources.

## WP-03 Page and CDP execution broker

- Centralize source wrapping, timeout, hashes and result serialization.
- CDP attach/detach lifecycle.
- Raw method/params transport.
- Tests against fixture page.

## WP-04 Utility runtime supervisor

- Fork runtime.
- Send source/config.
- Stream logs.
- Timeout/kill.
- descendant process handling on Windows.
- runtime crash recovery.

## WP-05 Module store

- Manifest validation.
- immutable versions.
- candidate/test/commit lifecycle.
- activation and rollback.
- provenance.

## WP-06 Experiment console

- Code/request editor.
- current target/environment view.
- timeline.
- stop-all status.
- module browser.
- checkpoint browser.

## WP-07 Manual AI experiment

- Prepare Seed Prompt.
- Run one capability evolution experiment.
- Preserve transcript/evidence.
- Calculate initial metrics.

## WP-08 Model adapter interface

- Provider-neutral interfaces.
- one adapter.
- cancellation.
- context/evidence packaging.
- secret handling.

## WP-09 Git source evolution

- stable/candidate worktree.
- patch application.
- checks/tests.
- candidate launch and health handshake.
- accept/rollback.

## WP-10 Operational hardening

- explicit page/CDP broker cancellation;
- next-command recovery after unexpected CDP detach;
- credential-free loopback OpenAI-compatible adapter;
- important-document Traditional Chinese companion gate;
- one-command static/unit verification and a scoped Windows runtime smoke.

## Parallelism guidance

After WP-00:

- WP-01 and UI mock work may run in parallel.
- WP-02 and WP-03 are tightly coupled; coordinate schemas.
- WP-04 may proceed after WP-01 contracts stabilize.
- WP-05 depends on WP-01 and WP-04.
- WP-07 depends on WP-03 through WP-06.
- WP-09 remains the last source-evolution package. WP-10 may harden the stable
  Kernel without accepting the WP-09 candidate branch.

## Review checklist per work package

- scope matches package;
- no task-level whitelist introduced;
- remote content isolation retained;
- generated source not executed in main process;
- tests and manual evidence supplied;
- event and rollback impact addressed;
- Decision Log updated where required.
