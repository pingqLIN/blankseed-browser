# Validation Report

Date: 2026-07-18 Asia/Taipei

## Current validation contract

Run from `starter/`:

```powershell
npm run verify
npm run verify:runtime
npm run verify:wp11
```

`verify` covers JavaScript syntax, configuration, required Traditional Chinese
document companions and unit tests. `verify:runtime` additionally launches the
Windows Electron candidate against loopback-only fixtures, exercises the
Traditional Chinese control surface through its actual DOM event handlers,
verifies page/CDP cancellation and the local OpenAI-compatible model transport,
then closes the application and fixture server.

`verify:wp11` additionally runs a deterministic OpenAI-compatible tool loop in
an isolated workspace. It verifies observable candidate failure, model-driven
correction, commit/activation/invocation, a complete correlated run manifest,
reuse from a second Electron session and process/port cleanup.

## Current result

The current automated-evolution result is recorded in
`starter/reports/wp-11-automated-evolution-loop.md`. That report is the durable
command/output evidence for the latest run. The WP-10 report remains the
authoritative cancellation/CDP-recovery evidence.

Latest result:

```text
Checked 33 project JavaScript files.
Checked 18 required Traditional Chinese document companions.
43 tests passed, 0 failed.
WP-11 Windows runtime smoke exited 0.
9 model turns; 8 raw actions; 1 expected failed action.
Second-session module reuse passed; runtime remaining 0; CDP port reusable.
Ephemeral CDP ownership nonce verified.
```

## 2026-07-18 control-surface runtime verification

- Launch command: `npm run verify:runtime`; its runtime step launches
  `electron.exe --remote-debugging-port=<ephemeral> --user-data-dir=<temporary> .`.
- Tested URL: loopback `basic-page.html` fixture on an ephemeral port.
- Actions performed: entered the fixture URL through the navigation form,
  selected **檢查 Snapshot**, traversed Page/CDP/Node/Module tabs with
  Arrow/Home/End keyboard events, and completed Candidate → Test → Commit →
  Activate through the visible controls.
- Expected result: Traditional Chinese labels remain visible, tab ARIA state
  follows focus, module states render as 候選／已測試／已提交／已啟用, and no
  button crosses a 420 px viewport.
- Actual result: all assertions passed; the snapshot returned the tested URL,
  the keyboard sequence selected `cdp → module → node → page`, all four module
  labels matched, and the overflow list was empty.
- Relevant evidence: structured stdout from
  `starter/scripts/runtime-wp10-hardening-smoke.mjs` and its correlated
  temporary `<userData>/blankseed-data/events/events.jsonl`. The isolated
  user-data/workspace is removed only after successful process and port cleanup;
  this report is the durable result record.

## Earlier evidence

- `starter/reports/phase-0-baseline.md` records the first successful Windows
  Electron launch and raw primitive verification.
- `starter/reports/wp-01-contracts-events.md` through
  `starter/reports/wp-09-source-evolution.md` record the incremental protocol,
  runtime, module, experiment, model and source-evolution evidence.

The original 2026-07-12 artifact validation could not launch Electron because
its container could not download the Electron binary. That limitation was later
resolved on the target Windows environment and is no longer the current project
status.

## WP-12 protocol boundary

`11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.md` and its Traditional Chinese
companion define the approved 12-trial baseline, evidence schema, loopback-only
profile and pass/hold/stop gates. Their presence is checked by `npm run check`.
No real-model WP-12 trial has run, so this document makes no WP-12 quality or
prompt-injection robustness claim.

## Remaining validation boundary

- Hosted model credentials are not tested or handled.
- CI runs static and unit verification only; Electron runtime smoke remains a
  Windows operator workflow.
- Real local-model quality, prompt-injection robustness and parallel evolution
  runs are not validated by the deterministic fixture.
- WP-09 candidate acceptance remains manual and is not part of `verify:runtime`.
