# BlankSeed Browser Project Status

> Status date: 2026-07-18 Asia/Taipei. This file is an operational snapshot; the phase specifications and Decision Log remain authoritative for scope and architecture.

## Snapshot

- Stable branch: `main`; the current UI localization slice builds on the WP-11 baseline commit `59a0da3`.
- Work packages WP-00 through WP-11 have evidence reports under `starter/reports/`.
- The WP-09 candidate branch remains local evidence and is intentionally not merged into `main`.
- The trusted control surface uses Traditional Chinese user-facing labels and has an English-authoritative operator guide with a `.zh-tw.md` companion.
- The WP-12 real local-model evaluation protocol is approved; no WP-12 real-model trial has run yet.
- The application remains a local Windows-first research environment, not a release-ready browser product.

## Phase assessment

- Phase 0: complete with Windows Electron runtime evidence.
- Phase 1: deterministic protocol is implemented; the current hardening slice adds explicit page/CDP cancellation and next-command CDP recovery.
- Phase 2: generated Node runtime supervision is implemented.
- Phase 3: versioned module lifecycle and rollback are implemented.
- Phase 4: one manual capability-evolution experiment completed and reused its module after restart.
- Phase 5: the provider-neutral adapter, credential-free loopback transport and bounded model-to-raw-capability evolution loop are implemented. The Phase 4 failure/correction/reuse experiment now runs through automated model turns with equivalent evidence.
- Phase 6: candidate worktree, patch, checks, health probe and rollback were demonstrated. Acceptance remains manual.
- Phase 7: not started because no repeatable Electron engine blocker has been demonstrated.

## Current decisions

- Retain `codex/wp09-source-evolution-1783928693189` as local evidence. Do not merge or delete it without product-owner review.
- Keep hosted-provider credentials out of this slice. The first real model transport is loopback-only and sends no authorization header.
- Keep the fixed tool catalog at raw infrastructure families. Do not add summarize/translate or other semantic task verbs to the Kernel.
- Persist each automated run under `workspace/evolution-runs/<evo_*>/run.json` with a pre-run checkpoint and run/turn/action correlation identities.
- Keep English publishable technical documents authoritative and maintain explicit `.zh-tw.md` companions for the important document set.
- Keep protocol and manifest status values in English while mapping their user-facing renderer labels to Traditional Chinese.
- Run WP-12 on a dedicated `workspace-research-loopback-only` profile before considering hosted credentials, multi-target expansion or automatic source acceptance.

## Remaining risks

- Page JavaScript cancellation terminates the broker result lifecycle but cannot guarantee that Chromium stops already-running JavaScript immediately.
- The deterministic fixture proves transport, dispatch, correction and reuse behavior; real-model quality and prompt-injection robustness remain unproven.
- WP-12 pass/hold evidence is not yet available; the protocol is a plan, not a result.
- Evolution cancellation prevents later dispatch and can cancel the active model request, but does not guarantee immediate termination of already-running Chromium JavaScript.
- Source-evolution dependency changes, merge conflicts and multiple concurrent candidates are not yet proven.
- CI validates syntax, configuration, documentation companions and unit tests. Electron smoke remains a Windows runtime workflow.

## Verification commands

From `starter/`:

```powershell
npm run verify
npm run verify:runtime
npm run verify:wp11
```
