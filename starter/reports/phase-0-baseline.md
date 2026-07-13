# Phase 0 Baseline Report

Date: 2026-07-13 Asia/Taipei

## Scope

WP-00 / Phase 0 baseline verification for the BlankSeed Browser starter.

The goal was to prove the supplied Electron scaffold can install, launch, expose
the documented raw browser primitives, write observable events, create a
checkpoint, and close cleanly. This report does not claim Phase 1 deterministic
protocol, Phase 2 generated Node runtime, or module-store behavior.

## Environment

- OS surface: Windows local desktop.
- Working directory: `D:\OneDrive\Documents_cloud\BlankSeed Browser\starter`.
- Node.js: `v24.14.1`.
- npm: `11.11.0`.
- Electron package: `43.1.0`.
- Runtime Electron: `43.1.0`.
- Runtime Chromium: `150.0.7871.47`.
- Runtime Node inside Electron: `24.18.0`.
- Runtime data root: `C:\Users\miles\AppData\Roaming\blankseed-browser-starter\blankseed-data`.

## Commands and Results

```powershell
npm install
```

Initial result: failed because `package-lock.json` resolved tarballs pointed at
an internal Artifactory host from the artifact creation environment:
`packages.applied-caas-gateway1.internal.api.openai.org`.

Fix applied: rewrote lockfile `resolved` tarball URLs to public
`https://registry.npmjs.org/...` URLs without changing package versions or
integrity values.

Final result:

```text
added 13 packages, and audited 14 packages in 6s
found 0 vulnerabilities
```

Electron binary installation required an explicit retry:

```powershell
node node_modules\electron\install.js
node_modules\.bin\electron.cmd --version
```

Result:

```text
v43.1.0
```

```powershell
npm run check
```

Final result:

```text
Checked 31 project files; JavaScript syntax and baseline configuration are valid.
```

```powershell
npm test
```

Final result:

```text
tests 7
pass 7
fail 0
```

```powershell
npm start
```

Smoke result:

```text
electron_window_pid=<observed> title=BlankSeed Browser Starter
window_closed
stderr_empty
```

For automated runtime evidence, the app was launched with:

```powershell
node_modules\electron\dist\electron.exe --remote-debugging-port=9333 .
```

This is equivalent to the Electron app launch but adds a local CDP port for
repeatable verification.

## Runtime Verification Evidence

Final runtime session:

```text
sessionId: ses_f3887388-8c04-4cdf-8492-1fe8f38694a4
dataRoot: C:\Users\miles\AppData\Roaming\blankseed-browser-starter\blankseed-data
```

Target renderer isolation reported by the app:

```json
{
  "nodeIntegration": false,
  "contextIsolation": true,
  "sandbox": true
}
```

Navigation and page controls:

- Initial target loaded `https://example.com/`.
- Navigated to `https://example.org/`.
- Back returned to `https://example.com/`.
- Forward returned to `https://example.org/`.
- Reload kept `https://example.org/` active.

Page snapshot:

```json
{
  "url": "https://example.com/",
  "title": "Example Domain",
  "textPrefix": "Example Domain\n\nThis domain is for use in documentation examples without needing",
  "elementCount": 1
}
```

Isolated-world page execution:

```json
{
  "executionId": "exe_72736deb-5c40-496a-910e-90ceab2c358b",
  "status": "ok",
  "result": {
    "title": "Example Domain",
    "url": "https://example.com/",
    "headings": ["Example Domain"],
    "nodeType": "undefined",
    "requireType": "undefined"
  }
}
```

Raw CDP command:

```json
{
  "method": "Page.getNavigationHistory",
  "executionId": "exe_7e5c05fe-37f7-4e39-8e3c-b512b94b2d88",
  "currentIndex": 0,
  "entryCount": 1
}
```

Utility process probe:

```json
{
  "type": "pong",
  "runtime": {
    "pid": 39356,
    "platform": "win32",
    "node": "24.18.0",
    "electron": "43.1.0"
  }
}
```

Checkpoint:

```text
id: chk_74f619b7-4e15-429a-a53c-5ff2e882a216
path: C:\Users\miles\AppData\Roaming\blankseed-browser-starter\blankseed-data\checkpoints\chk_74f619b7-4e15-429a-a53c-5ff2e882a216.json
```

Event log:

```text
C:\Users\miles\AppData\Roaming\blankseed-browser-starter\blankseed-data\events\events.jsonl
```

Observed event types included:

- `app.started`
- `target.navigation.started`
- `target.navigation.completed`
- `target.title.updated`
- `target.console`
- `page.snapshot.completed`
- `page.execution.started`
- `page.execution.completed`
- `cdp.command.started`
- `cdp.command.completed`
- `utility.started`
- `checkpoint.created`
- `app.window.closing`
- `cdp.detached`
- `utility.exited`

Shutdown evidence:

```text
sequence 94: app.window.closing
sequence 95: cdp.detached, reason=target closed
sequence 96: utility.exited, code=0
```

After the shutdown delay, no BlankSeed Electron process or remote debugging port
remained.

## Starter Defects Fixed

1. Lockfile tarball URLs were tied to the artifact builder's internal npm
   mirror. They now use public npm registry tarball URLs.
2. The trusted UI preload used a local `require('../shared/contracts.cjs')`.
   With `sandbox: true`, this caused `window.blankseed` to be undefined at
   runtime. The preload now keeps transport channel names local and exposes the
   same narrow contextBridge API.
3. `target.console` events were missing level/message details at runtime.
   Console message normalization now supports Electron's details-object event
   and legacy positional shape.
4. The console-message handler triggered an Electron deprecation warning because
   it declared legacy positional parameters. The handler now uses rest args; the
   final `npm start` smoke produced empty stderr.

Tests were added for the preload/channel alignment and console message
normalization.

## Deviations and Known Limits

- The target page emits Electron's development-only insecure CSP warning for
  `example.com` / `example.org`. This is captured as a `target.console` event
  with full details and does not mean Node integration is enabled in the target.
- Many events still have `sessionId: null`; Phase 1 should make session,
  request, and execution identity deterministic across all event classes.
- Page and CDP requests do not yet implement timeout/cancel semantics.
- `documentGeneration` is tracked, but stale target request rejection is not yet
  implemented.
- Checkpoint creation works, but checkpoint restore and Git-backed rollback are
  not part of Phase 0.
- The utility process is only a ping/pong lifecycle probe. Arbitrary generated
  Node execution belongs to Phase 2.
- The app still has no model adapter, module store, multi-tab model, or source
  self-modification pipeline.

## Changed Files

- `starter/package-lock.json`
- `starter/src/preload/preload.cjs`
- `starter/src/shared/contracts.cjs`
- `starter/src/main/target-view.cjs`
- `starter/test/contracts.test.mjs`
- `starter/reports/phase-0-baseline.md`

## Next Smallest Executable Step

Begin WP-01 / Phase 1:

1. Define a runtime validation layer for the contracts in
   `06_PROTOCOL_AND_DATA_CONTRACTS.md`.
2. Add stable `sessionId`, `requestId`, and caller-supplied or broker-issued
   `executionId` to every request/result/event chain.
3. Add duplicate request detection, request size limits, structured errors, and
   focused tests for malformed payloads and error shapes.
