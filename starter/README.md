# BlankSeed Browser Starter

This is an intentionally small Electron scaffold for the BlankSeed Browser handoff.

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
