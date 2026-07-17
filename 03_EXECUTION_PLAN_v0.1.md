# Execution Plan v0.1

> Current implementation status is maintained in `PROJECT_STATUS.md`. This plan
> remains the authoritative phase definition and exit-criteria reference.

## Phase 0 — Baseline and scaffold verification

### Objective

Prove the starter package launches and its supplied primitives behave as documented.

### Tasks

- Install dependencies.
- Run syntax/project checks and tests.
- Launch Electron.
- Navigate target view.
- Run page snapshot.
- execute an isolated page script.
- send a harmless CDP command such as `Runtime.evaluate` or `Page.getNavigationHistory`.
- create a checkpoint.
- verify JSONL events.
- verify target webContents is destroyed at shutdown.

### Deliverable

`reports/phase-0-baseline.md` with commands, actual results and deviations.

### Exit criteria

All supplied scaffold features work or documented starter defects are fixed with tests.

---

## Phase 1 — Deterministic Kernel protocol

### Objective

Make every raw capability request/result observable, cancellable where applicable and schema-stable.

### Tasks

- Define runtime validation for contracts in `06_PROTOCOL_AND_DATA_CONTRACTS.md`.
- Add session/execution identifiers.
- Add request size limits and structured errors.
- Add target navigation invalidation.
- Stream console/navigation events.
- Implement a unified execution timeline.
- Add stop/cancel control for page and CDP operations where possible.

### Tests

- malformed payload rejection;
- stale target detection;
- duplicate execution ID rejection;
- result serialization;
- timeout behavior;
- navigation during execution.

### Exit criteria

The same request produces a deterministically shaped result or error and a complete event chain.

---

## Phase 2 — Generated Node runtime

### Objective

Run arbitrary AI-generated Node.js code outside the main process and reliably observe/terminate it.

### Tasks

- Build utilityProcess-based runtime supervisor.
- Define candidate source package format.
- Stream logs and structured result.
- Implement timeout and process-tree termination.
- Create per-execution working directory.
- Record environment identity.
- Make explicit that this is not a secure sandbox.

### Required demonstrations

1. Successful script.
2. Script throwing an error.
3. Infinite loop terminated by supervisor.
4. Child process started by generated code and terminated with its parent.
5. App remains responsive after runtime crash.

### Exit criteria

A generated runtime can fail catastrophically without taking down the Kernel, and all processes are reclaimable.

---

## Phase 3 — Versioned module store

### Objective

Turn successful one-off code into reusable, inspectable capabilities.

### Tasks

- Implement module manifest.
- Candidate → test → commit lifecycle.
- Content hash and immutable versions.
- Dependency declarations.
- Activate/deactivate.
- Rollback.
- Provenance linking conversation/executions/checkpoints.
- Module API for page, Node and hybrid modules.

### Exit criteria

A module can be committed, reloaded after application restart, invoked again and rolled back to an earlier version.

---

## Phase 4 — Manual AI evolution experiment

### Objective

Demonstrate the research loop without model API integration.

### Procedure

- Start from an empty generated module store.
- Give an AI the Seed Prompt and current capability description.
- Use manual copy/paste for requests/results.
- Select an underspecified real task.
- Allow discussion, execution, failure and correction.
- Commit the resulting module.
- Use it again in a separate session.

### Deliverables

- complete transcript;
- execution event archive;
- generated source history;
- committed module;
- user evaluation;
- metric summary based on Research Charter.

### Exit criteria

At least one new capability reaches verified reuse.

---

## Phase 5 — Provider-neutral model adapter

### Objective

Automate turns without binding the Kernel to one provider.

### Tasks

- Common model turn contract.
- Adapter plugin interface.
- Cancellation and timeout.
- Context packaging.
- Tool/execution result serialization.
- Secret storage design.
- One external API adapter or local model adapter.

### Exit criteria

The Phase 4 experiment can run with automated model turns while producing equivalent evidence.

---

## Phase 6 — Source self-modification prototype

### Objective

Allow the AI to propose and test changes to BlankSeed application source through a recoverable pipeline.

### Preconditions

- Phase 2 process termination proven.
- Phase 3 module rollback proven.
- automated checks and launch health probe exist.

### Tasks

- Git repository checkpoint.
- Candidate branch/worktree.
- agent-generated patch.
- dependency policy.
- install/check/test.
- candidate application launch.
- health handshake.
- user/model evaluation.
- accept or rollback.

### Exit criteria

A nontrivial UI or Kernel extension is applied, restarted, verified and reversible.

---

## Phase 7 — Engine boundary review

### Objective

Determine whether Electron blocks the research.

### Evidence required before migration

- exact Electron/Chromium limitation;
- minimal reproduction;
- failed alternatives;
- capability expected from CEF or Chromium fork;
- maintenance and build cost;
- migration plan preserving experiment data.

### Exit criteria

A written decision either retains Electron or authorizes a bounded CEF/Chromium investigation.
