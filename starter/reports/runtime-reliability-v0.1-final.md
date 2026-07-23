# BlankSeed Agent Runtime Reliability Upgrade v0.1 - Final Gate Report

## Status

**INCOMPLETE.** Runtime Reliability Phases 0-4 passed, and the existing YOUTUBE-AOPass checkpoint was restored successfully. The final live YouTube acceptance gate did not reach the required 3/3 detect/skip/recover cycles because the bounded session exposed one real ad but no native skip control.

## Authority and scope

- Task source: `E:\miles\Downloads\AGED.md` and the operator request dated 2026-07-21.
- Effective governance: global and repository `AGENTS.md`, plus the `dev-workflow-scale-planner` workflow.
- Repository: `D:\OneDrive\Documents_cloud\BlankSeed Browser`.
- Implementation risk: L2 reversible local source/test/documentation changes.
- Runtime recovery risk: L3 confirmed checkpoint restore plus confirmed commit/activation of the pre-existing tested candidate. No public exposure, credential persistence, push, release, or deploy occurred.

## Phase results

| Phase | Result | Evidence |
| --- | --- | --- |
| 0 - Safety Freeze | PASS | Git ref `refs/codex-checkpoints/before-runtime-reliability-v0.1-20260721T143000+0800`, object `14879098a35fbddc5eef1e5000514fedf90eaf73`, and three SHA-256-recorded archives. |
| 1 - Error State Preservation | PASS | Retryable model and returned/thrown action errors preserve `code`, `retryable`, `checkpointId`, `turnId`, `actionId`, and bounded cause metadata; retry decision remains non-automatic. |
| 2 - CDP Session Recovery | PASS | Exact invalid-session matching, broker-owned detach/reattach, one replay only, clean second failure, and fail-closed handling for externally owned attachments. |
| 3 - Observation Compression | PASS | Oversized Node/CDP/DOM feedback is structurally bounded to 4,000 characters, including adversarial metadata; durable evidence remains uncompressed up to the pre-existing 1 MiB result cap. |
| 4 - Adaptive Timeout | PASS | Auditable 30/90/120/180-second policy, explicit override, IPC omission behavior, transcript/event persistence, and no automatic retry. |

Independent low-tier reviews reported no Critical or Warning findings after fixes. Focused tests passed 28/28; the isolated full suite passed 105/105.

## Primary-worktree acceptance

```text
npm run check
Checked 60 project JavaScript files; baseline configuration is valid.
Checked 24 required Traditional Chinese document companions.

npm test
tests 212, pass 212, fail 0
```

The 212 count contains the primary tree's 107 tests plus 105 tests rediscovered in the nested isolated worktree under `starter/workspace`. Both sets passed. `git diff --check` also passed.

## Existing-checkpoint resume

The failed evidence named `chk_c9d31a45-589e-4a36-87f2-dfab034834c2` as the checkpoint labelled `建立 YouTube-AOPass 前`. It was read as `restorable: true`, schema `blankseed-checkpoint/0.2`, state hash `sha256:11b38100410d22cbd8919104abdb406b68e0a635dfab1e8a707e38087d7ad21b`, with restore scope limited to `modules.active`.

The confirmed restore completed as transition `rst_c5b59752-bd27-4f5c-8585-7681ef705ded` and created safety checkpoint `chk_c99a66bf-33ab-46be-8d22-d4747d550797`. It stopped or cancelled zero active operations.

No module was recreated. Existing tested candidate `cand_81bbf172-3125-4099-9ec2-1af1ba399616` was committed once and the immutable version was activated:

- module: `youtube-aopass@1.0.0`
- source hash: `sha256:dd90a4facd06c1ff1657cc030c63f908840164b186a5a1f1cb419a2f351bd8ec`
- final active mapping: `{ "youtube-aopass": "1.0.0" }`

## Live YouTube acceptance

Resume run `evo_e63290de-ac40-41bd-b85a-cf6d30835ff6` completed 6 turns and 5 actions with zero action failures. It confirmed that the active module currently returns `result: null` through `module.invoke`, and the original target session exposed no ad.

The final bounded availability run `evo_dd73f027-5491-4f38-a3cb-8c9124bb28ec` completed 8 turns and 7 actions with zero action failures and no forbidden module mutation actions. Its evidence is:

- path: `starter/workspace/evolution-runs/evo_dd73f027-5491-4f38-a3cb-8c9124bb28ec/run.json`
- SHA-256: `78AFA16DB8B45201241C63F841AC39EB91CF34DA65141182FF0AB3866242788F`
- timeout policy: `blankseed-adaptive-timeout/0.1`; observed decisions included 90,000 ms analysis, 120,000 ms code-generation, and 30,000 ms simple turns.

Observed outcomes:

| Test | Result | Actual evidence |
| --- | --- | --- |
| 1 - detect | PASS | A real ad marker was continuously observed for about 3.1 seconds on `dQw4w9WgXcQ`. |
| 2 - native skip | INCOMPLETE | No visible enabled native skip control appeared; no click was issued. |
| 3 - three detect/skip/recover cycles | INCOMPLETE, 0/3 | One ad ended naturally and original playback continued; the other two bounded URLs exposed no ad. No complete skip cycle occurred. |

An evolution run returning `status: ok` means the run completed without Runtime failure; it does not convert an `UNKNOWN/INCOMPLETE` acceptance conclusion into a pass.

## Manual runtime verification note

- Launch command: Electron from `starter/node_modules/electron/dist/electron.exe` with a random loopback `--remote-debugging-port`, inherited memory-only environment credential, and the default BlankSeed user-data.
- Tested URLs: the restored target plus `dQw4w9WgXcQ`, `9bZkp7q19f0`, and `kJQP7kiw5Fk` watch pages.
- Action: restore checkpoint, activate the existing immutable module, run two bounded evolution validations, observe real ad state, and click only if an enabled native skip control appeared.
- Expected: three real detect/skip/recover cycles.
- Actual: one real ad detection, zero native skip clicks, zero complete cycles; no seeking, playback-rate change, request blocking, element removal, or unrelated click occurred.
- Relevant evidence: the two evolution run manifests above, checkpoint transition `rst_c5b59752-bd27-4f5c-8585-7681ef705ded`, and event sequences 1308-1314.

The pre-existing WP10 runtime smoke reached Electron but timed out on a UI-v2 `committed status label`; the WP11 smoke contained an outdated high-risk allowlist assumption. Temporary diagnostic edits to the WP11 smoke were reverted completely. Neither failure was treated as acceptance evidence.

## Files and state

Source changes are limited to the evolution loop, CDP broker, adaptive timeout policy, IPC/config wiring, contracts, focused tests, decision logs, and paired reports. Pre-existing UI v2 changes were preserved, including the overlapping `ipc-router.cjs` and `contracts.cjs` hunks.

Runtime state now additionally contains the committed `youtube-aopass@1.0.0`, its active mapping, two new evolution run manifests, checkpoint transitions, safety checkpoints, and event records. No files were deleted. No commit, stage, push, PR, release, or deploy was performed.

## Rollback and remaining blocker

- Code rollback: use the Phase 0 Git checkpoint ref and SHA-256-recorded archives after explicit destructive-action approval.
- Active-module rollback to the pre-YOUTUBE mapping: restore `chk_c9d31a45-589e-4a36-87f2-dfab034834c2` with explicit confirmation. Committed module files remain inspectable and are not deleted.
- Remaining blocker: live YouTube ad inventory did not provide a native skip control or three complete cycles within the bounded run, and `module.invoke` currently returns `null` for the existing module source. A later acceptance run needs real skippable ad availability or an explicitly authorized correction to the existing module execution contract; neither may be inferred as passed.
