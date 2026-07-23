# Module Runtime Contract Upgrade v1.1 — Phase 0 Safety Baseline

## Evidence state

- `VERIFIED`: Git branch `codex/ui-v2-hardening` at `2fe07a107086f47157eb893472ff3dd08cd9f4ed`.
- `VERIFIED`: the pre-existing dirty worktree was inventoried before this task changed files. Those changes are preserved and are not treated as this task's output.
- `VERIFIED`: `starter/workspace/state/active-modules.json` maps `youtube-aopass` to `1.0.0`.
- `VERIFIED`: 16 existing application checkpoints were present under the BlankSeed application data root. No checkpoint was changed or replaced.
- `VERIFIED`: `youtube-aopass@1.0.0` is a committed Module Store version whose manifest and source both identify the source hash below.

```text
sha256:dd90a4facd06c1ff1657cc030c63f908840164b186a5a1f1cb419a2f351bd8ec
```

## Current runtime contract

The generated Node runtime evaluates source with `AsyncFunction` and uses only the function's direct return value. An implicit `undefined` is currently normalized to `null`. The runtime supplies CommonJS-shaped `module` and `exports` objects, but it does not inspect or invoke their exported entry points after source evaluation.

## Current module contract

`youtube-aopass@1.0.0` assigns an object containing `evaluate`, `normalize`, and `metadata` to `module.exports`. It does not directly return a value and does not export `execute`. Its `evaluate(observation, state)` function contains the existing ad detection and native-skip proposal behavior.

The resulting mismatch is:

```text
module.invoke -> source loaded -> source returns undefined -> undefined normalized to null
```

## Immutability assessment

`youtube-aopass@1.0.0` is logically immutable through the Module Store:

- it resides in `modules/youtube-aopass/versions/1.0.0` with status `committed`;
- `commitCandidate` rejects an already existing version directory;
- invocation verifies the persisted source against the manifest hash;
- the measured source hash matches the manifest;
- this task will not edit the version directory, its manifest, its source, or its originating checkpoint.

Filesystem permissions are not being claimed as an immutability boundary. The verified Module Store checks and the preserved hash are the applicable evidence.

## Risk assessment

- Risk level: L2 for scoped runtime source, test, and documentation changes.
- Risk level: L3 for Module Store candidate/test/commit/activate operations and any application runtime restart, if a restart proves necessary.
- Primary compatibility risk: changing direct-return behavior or passing the wrong arguments to legacy `evaluate` modules.
- Governance risk: activating `1.0.1` without a successful candidate test or without preserving `1.0.0` as the rollback target.
- Evidence risk: treating synthetic observations as live YouTube acceptance. Synthetic fixtures are permitted only for contract regression tests, not Phase 6 acceptance.

## Rollback method

1. Preserve `youtube-aopass@1.0.0` and all existing checkpoints unchanged.
2. Use the pre-task Git blobs as the rollback baseline for files that were clean before this task; reverse only this task's scoped additions for files that already contained user changes.
3. Before activation, create a new application checkpoint recording the active mapping `{ "youtube-aopass": "1.0.0" }`.
4. If `1.0.1` activation or invocation fails, use the governed Module Store rollback operation to reactivate `1.0.0`, with the pre-activation checkpoint as a secondary active-mapping recovery path.
5. Do not delete a committed `1.0.1`; keep immutable version history and record any superseding correction as a new version.

## Phase 0 decision

`PASS` for analysis and pre-change safety. Runtime source mutation may proceed while preserving all enumerated pre-existing work and avoiding any change to `youtube-aopass@1.0.0`.
