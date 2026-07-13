# AGENTS.md — BlankSeed Browser

## Mission

Build an experimental Chromium application in which AI can progressively create and evolve capabilities from low-level primitives through user interaction. Do not turn the project into a fixed browser automation product.

## Language

- User-facing documentation and UI: Traditional Chinese (Taiwan terminology).
- Source identifiers and protocol fields: English.
- Explain uncommon English technical terms in Chinese when they first appear.

## Non-negotiable invariants

1. **No task whitelist.** Do not restrict the model to predetermined business actions such as click/type/summarize/translate.
2. **Remote content isolation.** Never enable Node integration for arbitrary remote pages.
3. **Raw primitives belong behind a broker.** Page execution, CDP, process execution, file access and source modification must be observable through one broker or event pipeline.
4. **Evidence before claims.** Do not report a feature as complete without commands, tests or reproducible manual evidence.
5. **Reversible evolution.** Generated modules and source changes require version identity and rollback data.
6. **No silent scope expansion.** Record architectural changes in `09_DECISION_LOG.md`.
7. **No hidden generated behavior.** Store generated code, inputs, outputs and errors in an inspectable form.
8. **Do not optimize for Chrome Web Store.** This is a local research application unless the product owner changes the objective.

## Current scope

The initial platform is Electron + Chromium, not a Chrome Extension and not a Chromium fork.

Current supported platform priority:

1. Windows 10/11
2. macOS/Linux only after the Windows research loop works

## Development rules

- Prefer small, auditable modules.
- Keep the fixed Kernel minimal.
- Generated capabilities belong in a dedicated workspace/module store, not scattered through Kernel code.
- Keep all renderer IPC APIs explicit through preload/contextBridge.
- Validate IPC sender and payload shape.
- Maintain `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` for remote content.
- Use WebContentsView rather than deprecated BrowserView.
- Destroy WebContentsView webContents explicitly when the owning window closes.
- Do not add a framework or database until the current phase needs it.
- Avoid remote CDN assets.

## Required checks before completion

```powershell
npm run check
npm test
```

For UI/runtime work, additionally provide a manual verification note containing:

- launch command
- tested URL
- action performed
- expected result
- actual result
- relevant log/checkpoint path

## Change authority

Agents may modify all starter files. Changes to the research charter, invariants, permission philosophy or core scope require a Decision Log entry explaining:

- problem
- evidence
- alternatives
- selected decision
- consequences
- rollback path

## Stop and escalate

Stop the current implementation path and report evidence if:

- the requested feature requires enabling Node.js in remote renderers;
- rollback/checkpoint integrity cannot be guaranteed;
- a Chromium/Electron limitation blocks the experiment and would require a CEF or Chromium fork;
- the same architectural failure repeats three times without new evidence;
- a generated process cannot be reliably terminated;
- execution logs omit code or environment identity needed for reproduction.
