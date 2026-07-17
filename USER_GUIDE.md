# BlankSeed Browser User Guide

This is the authoritative operator guide. The Traditional Chinese companion is
[`USER_GUIDE.zh-tw.md`](USER_GUIDE.zh-tw.md).

## Purpose and current boundary

BlankSeed Browser is a Windows-first Electron research application. Its trusted
local control console operates a remote page in a separate `WebContentsView`
through observable low-level primitives. It is not a production browser, a
Chrome Extension, or a secure sandbox for generated Node.js code.

The interface uses Traditional Chinese for user actions while preserving
technical names such as `Page`, `CDP`, `Node`, `Module`, `Candidate`, `Commit`,
`Activate`, `Invoke`, `Rollback`, `Checkpoint`, `Event`, and `Runtime`.

## Requirements and launch

- Windows 10 or 11
- Node.js 22 or later for npm tooling
- npm and the dependencies under `starter/node_modules/`

Run the following in PowerShell from `starter/`:

```powershell
npm install
npm run check
npm test
npm start
```

Install dependencies only when `node_modules/` is absent or the lockfile has
changed. The left side of the application is the trusted control console. The
right side is the remote `Target`, initially `https://example.com/`.

## Interface map

### Status and Target

- `Session 工作階段`: abbreviated runtime session identity.
- `Target 目標頁`: current target identity and document generation.
- `Node Runtime`: whether generated Node execution is enabled.
- `Module 模組`: number of active generated modules.

Enter an HTTP or HTTPS URL and select **前往**. Use the arrow buttons for back
and forward, and the circular arrow to reload. Other URL schemes are rejected.
The top-right refresh button reloads all console status and evidence lists.

### Page

- **檢查 Snapshot** returns the current page snapshot through the broker.
- **執行 Isolated JS** runs source in an isolated page world and displays a
  structured result envelope.

Page source must return JSON-serializable data and must not depend on Node.js,
Electron, local files, or trusted console objects.

### CDP

Enter a raw Chrome DevTools Protocol method such as
`Page.getNavigationHistory` and a JSON object in the params field. Select
**傳送** to execute it through the broker and event pipeline.

### Node

- **Ping** checks the generated `Node Runtime`.
- **執行 Node Source** runs source in the supervised utility process.
- **停止** terminates active generated Node execution.

Generated Node execution is observable and recoverable, but it is not a secure
sandbox. Use only code and inputs appropriate for this local research workspace.

### Module

The `Module Store` lifecycle is explicit:

1. Enter a stable `Module id`, semantic `version`, and description.
2. Enter source that returns JSON-serializable output.
3. Select **建立 Candidate** and keep the returned `cand_*` identity.
4. Select **測試 Candidate**.
5. Select **Commit 版本** only after the test succeeds.
6. Select **Activate 版本** to make the immutable version active.
7. Enter environment JSON and select **Invoke Module**.
8. Use **Rollback 版本** to restore the selected committed version.

Do not treat a tested `Candidate` as accepted source before explicit Commit and
Activate operations.

### Recovery, Result, and Event Timeline

- **建立 Checkpoint** records recoverable file state with the entered label.
- **全部停止** requests cancellation of the active evolution run, page/CDP
  broker executions, generated Node runtime, and model turn.
- `Result 結果` displays the latest structured response or error.
- `Event Timeline` displays recent ordered events.

Event types, request IDs, error codes, protocol fields, and JSON keys remain
English for correlation with logs and tests. Page/CDP result cancellation is
observable, but JavaScript already running in Chromium may continue until it
returns or its document is destroyed.

The four tabs support `Left Arrow`, `Right Arrow`, `Home`, and `End` keyboard
navigation.

## Local model and evolution loop

The default adapter connects only to this credential-free loopback endpoint:

```text
http://127.0.0.1:1234/v1/chat/completions
```

The model defaults to `local-model`. Non-secret launch overrides are supported:

```powershell
$env:BLANKSEED_LOCAL_MODEL_ENDPOINT = 'http://127.0.0.1:1234/v1/chat/completions'
$env:BLANKSEED_LOCAL_MODEL_NAME = 'local-model'
npm start
```

The endpoint must remain HTTP(S) loopback and must not contain credentials. The
application sends no `Authorization` header. Verify the bounded raw-primitive
evolution loop with:

```powershell
npm run verify:wp11
```

Normal run manifests are written to
`starter/workspace/evolution-runs/<evo_*>/run.json`.

## Evidence and verification

Electron runtime evidence is stored under:

```text
<userData>/blankseed-data/
├─ events/events.jsonl
└─ checkpoints/*.json
```

Generated runtime artifacts are stored under the Git-ignored
`starter/workspace/experiments/`.

Verification commands:

```powershell
npm run verify
npm run verify:runtime
npm run verify:wp11
```

- `verify`: syntax, configuration, document companions, and unit tests.
- `verify:runtime`: adds the Windows Electron cancellation and loopback model
  smoke.
- `verify:wp11`: adds deterministic model-driven evolution and restart reuse.

After UI or runtime changes, record the launch command, tested URL, action,
expected result, actual result, and relevant log or checkpoint path.

## Troubleshooting

- Console not ready: run `npm run check` and confirm the sandboxed preload
  exposes `window.blankseed`.
- URL rejected: use HTTP or HTTPS and remove embedded credentials.
- CDP failure after detach: inspect next-command recovery events. The failed raw
  command is not replayed automatically.
- Local model failure: confirm an OpenAI-compatible chat-completions server is
  listening on loopback.
- Generated Node work hangs: use **停止** or **全部停止**, then inspect the latest
  events and experiment artifact.
