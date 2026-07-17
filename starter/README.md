# BlankSeed Browser Starter

This is an intentionally small Electron scaffold for the BlankSeed Browser handoff.

Complete operator instructions are in [`../USER_GUIDE.md`](../USER_GUIDE.md),
with a Traditional Chinese companion at
[`../USER_GUIDE.zh-tw.md`](../USER_GUIDE.zh-tw.md).
The approved next-stage experiment is defined by
[`../11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.md`](../11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.md)
and its [Traditional Chinese companion](../11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.zh-tw.md).

## Requirements

- Windows 10/11 recommended.
- Node.js 22 or newer for npm tooling. Electron supplies its own embedded Node.js at runtime.
- npm.

## Install and run

```powershell
npm install
npm run check
npm test
npm start
```

One-command verification:

```powershell
npm run verify
npm run verify:runtime
npm run verify:wp11
```

`verify` runs syntax/configuration/document-companion checks and unit tests.
`verify:runtime` additionally runs the scoped Windows Electron hardening smoke.
`verify:wp11` additionally proves the deterministic automated evolution loop;
it is a WP-12 preflight, not real-model evidence.

## Current UI

- Left: local trusted control panel.
- Right: remote target page rendered in `WebContentsView`.

Available baseline controls:

- navigate URL;
- back/forward/reload;
- inspect a basic page snapshot;
- execute JavaScript in isolated world `1001`;
- send a raw CDP method and parameters;
- create a file checkpoint;
- ping a utility process;
- execute generated Node.js source in a supervised utility process;
- stop active generated Node.js execution;
- create, test, commit, activate, invoke and roll back generated modules;
- inspect active modules, checkpoints and the execution timeline.
- cancel active page/CDP broker executions;
- perform provider-neutral model turns through `local.manual` or the
  credential-free `local.openai-compatible` loopback adapter.
- run a bounded provider-neutral model/tool evolution loop through the same raw
  broker, runtime, module and checkpoint services.

## Important

Generated Node.js source runs outside the main process in a disposable
`utilityProcess`. This is an observability and recovery boundary, not a security
sandbox. Runtime source, redacted input metadata, stdout/stderr, result and error
artifacts are stored under `workspace/experiments/`, which is ignored by Git.

## Runtime data

Electron writes runtime data under its userData directory:

```text
<userData>/blankseed-data/
├─ events/events.jsonl
└─ checkpoints/*.json
```

The UI displays the resolved path.

## Manual verification

1. Start the app.
2. Navigate to `https://example.com/`.
3. Press **Inspect Page**.
4. Execute:

```js
return {
  title: document.title,
  headings: [...document.querySelectorAll('h1,h2')].map((el) => el.textContent)
};
```

5. Send CDP method:

```text
Page.getNavigationHistory
```

with params `{}`.
6. Create a checkpoint.
7. Execute generated Node.js source:

```js
console.log('hello from generated runtime');
return {
  platform: process.platform,
  cwd: process.cwd()
};
```

8. Verify results and log path in the left panel.

## Security posture of the scaffold

Remote page:

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
```

The local UI also uses context isolation and a narrow preload API.

## Local model adapter

The real model transport is intentionally loopback-only and sends no
authorization header. It defaults to:

```text
endpoint: http://127.0.0.1:1234/v1/chat/completions
model: local-model
```

Operators may set `BLANKSEED_LOCAL_MODEL_ENDPOINT` and
`BLANKSEED_LOCAL_MODEL_NAME` before launch. The endpoint must remain HTTP(S)
loopback (`127.0.0.1`, `localhost` or `::1`) and must not contain credentials.

## Automated evolution verification

Run the deterministic Phase 5 exit smoke on Windows:

```powershell
npm run verify:wp11
```

It uses an isolated temporary workspace and a credential-free loopback fixture.
The model fixture requests raw tools, observes one intentional candidate
serialization failure, produces corrected source, commits and activates the
module, then a second Electron session reuses it. Normal launches persist run
manifests under `workspace/evolution-runs/`.
