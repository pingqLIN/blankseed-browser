# WP-06 Experiment Console Report

Date: 2026-07-13 Asia/Taipei

## Scope

Implemented the WP-06 experiment console slice: current target/runtime/module
state, tabbed request editors, module browser, checkpoint browser, event
timeline and stop-all status.

This report does not claim the WP-07 manual AI experiment transcript or model
adapter automation.

## Changed Behavior

- Reworked the local trusted control panel into a compact research console.
- Added top status cells for session, target, generated runtime and active
  modules.
- Added tabbed workbench views:
  - Page
  - CDP
  - Node
  - Module
- Added module store controls for:
  - candidate creation;
  - candidate test;
  - commit;
  - activation;
  - invocation;
  - rollback.
- Added module browser with active and committed state.
- Added checkpoint browser populated from ordered events.
- Added timeline renderer with status rails for completed, warning and failed
  event classes.
- Added Stop All status that distinguishes requested and confirmed stop state.
- Added a console readiness hook used by runtime smoke verification.
- Added runtime screenshot:

```text
reports/wp-06-console.png
```

## Design Notes

The console intentionally uses a dense operational-tool layout rather than a
marketing page. The visual direction is a graphite research console with amber,
green, red and blue status accents. Controls remain code-native HTML/CSS/JS with
no framework or remote assets.

Anti-attractors avoided:

- no landing-page hero;
- no decorative card grid;
- no remote CDN assets;
- no remote renderer Node integration;
- no task-specific semantic action whitelist;
- no hidden module behavior outside the module store.

## Commands and Results

```powershell
npm run check
```

Result:

```text
Checked 22 project JavaScript files; baseline configuration is valid.
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
node scripts\runtime-wp06-smoke.mjs
```

Result:

```text
exit code 0
```

## Runtime Evidence

Runtime console smoke:

```json
{
  "moduleId": "generated.wp06.console.1783927369713",
  "candidateId": "cand_cabc3f98-a7c4-46e2-9208-5485108c35ff",
  "activeTab": "module",
  "statusText": "node on",
  "targetSummary": "https://example.com/ | Example Domain",
  "checkpointId": "chk_12e56bc4-386b-4db1-a5b2-2ba83dda529a",
  "stopText": "confirmed / remaining 0",
  "moduleRows": 8,
  "checkpointRows": 2,
  "timelineRows": 80,
  "hasModuleTimeline": true
}
```

Module invocation through the console UI:

```json
{
  "requestKind": "module.invoke",
  "status": "ok",
  "result": {
    "module": "wp06",
    "value": 42
  }
}
```

Screenshot verification:

```text
D:\OneDrive\Documents_cloud\BlankSeed Browser\starter\reports\wp-06-console.png
```

Visual sanity check performed with `view_image`:

- left console crop is readable at 430px width;
- no observed overlap between controls;
- tab state, module browser, status cells and target summary render correctly;
- module list uses internal scroll instead of expanding the page indefinitely;
- long module IDs and JSON environment input stay inside their fields.

After shutdown delay, no `electron` process remained and no `127.0.0.1:9333`
listener remained.

## Tests Added

- `scripts/runtime-wp06-smoke.mjs`
  - waits for console readiness;
  - switches to the Module tab;
  - creates, tests, commits, activates and invokes a module through UI controls;
  - creates a checkpoint through UI controls;
  - presses Stop All and verifies confirmed stop state;
  - verifies module browser, checkpoint browser and timeline rows;
  - captures `reports/wp-06-console.png`.

## Known Limits

- Stop All currently terminates generated utility runtime activity. Page/CDP
  cancellation controls remain future work.
- The checkpoint browser is event-tail based, not a full checkpoint index.
- The module browser is compact and local-control-panel scoped; richer module
  browsing can be extended after WP-07 evidence.
- No generated visual assets or external UI framework were added.

## Next Smallest Executable Step

Begin WP-07 / Manual AI experiment:

1. Prepare a seed prompt and current capability summary.
2. Start from no task-specific module.
3. Use the console to generate, test, commit and reuse one small module.
4. Preserve transcript, module source, execution event evidence and metrics.
