# Workflow UI V2 — Runtime Verification

English is authoritative. See [README.zh-tw.md](README.zh-tw.md) for the Traditional Chinese companion.

## Scope

This evidence covers the workflow-first renderer redesign, readable overflow behavior, guarded execution flow, advanced-tool reachability, and the empty Runtime baseline.

## Manual / Runtime Verification

- Launch command: `npm run verify:ui:agent`
- Tested URL: `https://example.com/` through an isolated temporary Electron profile and loopback fixture model
- Actions performed:
  - opened model settings through the header shortcut;
  - configured and cleared a synthetic session credential without logging its value;
  - executed an Agent task through `Ctrl+Enter`;
  - navigated an owned loopback target and completed successful Page JS, CDP, and generated Node capability calls;
  - traversed all five advanced workbench tabs by keyboard and verified focus, selected state, and visible panels;
  - completed a hash-bound Proposer-to-Reviewer Multi-Agent handoff with a visible governance decision;
  - cancelled a running Agent task and verified a consistent warning/stopped presentation;
  - exercised automated and manual Module create/test, rejected manual Commit, Activate, and Rollback with `NO`, then verified exactly one mutation after each `YES`;
  - verified the Main Process rejects Module Commit and Rollback without explicit confirmation;
  - scrolled the complete left rail;
  - checked 500×920, 390×844, and 430×600 layouts;
  - injected a long error/identifier layout fixture to verify wrapping without ellipsis.
- Expected result: six ordered steps remain readable; context stays visible; blocked actions explain missing prerequisites; every advanced capability remains keyboard-reachable and produces explicit evidence; no horizontal overflow; the short-height primary action remains visible; Module confirmation gates remain effective.
- Actual result: all expectations passed in the Electron/CDP smoke run. Unit and static checks passed separately.
- Relevant evidence:
  - `qa-workflow-desktop-500.png`
  - `qa-agent-workspace-390.png`
  - `qa-workflow-short-430x600.png`
  - `runtime-smoke.json` — structured Electron/CDP result
  - `verification.json` — command-derived check counts, versions, byte-complete scoped-content identity, hashes, inventories, and measured cleanup result
  - `runtime-reset-manifest.json` — hash-linked recoverable reset manifest, reproducible digest canonicalization, and rollback procedure

`verification.json` intentionally excludes itself from its `artifacts` array to
avoid recursive self-reference. The report records this policy explicitly;
committed Git object identity, packet-level SHA-256 provenance, and an
independent top-level hash provide the external integrity controls.

## Runtime Base State

Before final validation, generated Runtime data was moved recoverably to timestamped `.del` directories. The following were verified empty or absent:

- Module Store and candidates;
- active Module mapping;
- evolution runs, experiments, source-evolution runs, and WP12 preflight data;
- checkpoints and event journal in the application Runtime data root.

Browser profile, login, cookies, credentials, tracked source, and tracked historical reports were not reset.

## Concept-to-Implementation Comparison

The implementation was visually checked against the generated desktop, narrow, and failure/recovery concepts on five material points:

1. ordered numbered workflow;
2. persistent session/target/Runtime context;
3. wrapped long messages and identifiers;
4. clear blocked/ready/error states with a visible next action;
5. advanced Page JS, CDP, Node, Module, and Multi-Agent tools behind one disclosure.

The concepts are layout references only. Runtime screenshots are the implementation evidence.

Concept assets retained for independent comparison:

- `concept-desktop.png`
- `concept-narrow.png`
- `concept-failure-recovery.png`

Known, intentional differences:

- The concept desktop image shows the complete split window. CDP captures the control renderer only; the real Electron window continues to place the isolated `WebContentsView` to the right of the 500px rail.
- Concept copy is illustrative and contains image-generated text artifacts. The implementation uses code-native Traditional Chinese labels and is authoritative.
- The concept uses five coarse stages; the authoritative, testable UI contract is `prepare → target-context → describe-task → system-check → execute-confirm → evidence-recovery`. It separates preparation from target/context so tasks that do not need a webpage can explicitly skip that prerequisite.
