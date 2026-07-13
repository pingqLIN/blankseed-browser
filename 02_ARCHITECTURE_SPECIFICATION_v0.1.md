# Architecture Specification v0.1

## 1. Selected platform

Use Electron as the first implementation layer:

- Electron embeds Chromium and Node.js.
- WebContentsView provides an embedded target web content surface.
- webContents provides isolated JavaScript execution.
- webContents.debugger provides Chrome DevTools Protocol transport.
- utilityProcess provides a separate Node.js process and message channel.

Electron is an experimental platform choice, not a permanent requirement. CEF or a Chromium fork is deferred until a concrete engine-level blocker is demonstrated.

## 2. Trust and process topology

```text
┌─────────────────────────────────────────────────────────┐
│ Main Process — Fixed Kernel                             │
│ window/view lifecycle, IPC, broker, log, checkpoint     │
├───────────────────┬───────────────────┬─────────────────┤
│ Trusted UI        │ Target Renderer   │ Utility Runtime │
│ local app files   │ remote websites   │ generated Node  │
│ sandboxed renderer│ sandboxed         │ separate process│
└───────────────────┴───────────────────┴─────────────────┘
                 │
                 ▼
          Generated Workspace
          modules / tests / state
```

### Main Process

Responsibilities:

- create and destroy windows/views;
- maintain target page identity;
- validate trusted renderer IPC;
- expose raw capabilities through a broker;
- record execution events;
- create checkpoints;
- manage utility/child process lifecycle;
- keep the generated runtime out of the main process.

### Trusted UI Renderer

Responsibilities:

- display browser controls;
- display environment and execution results;
- show generated code before/after execution;
- expose stop/recovery controls;
- never receive Node.js directly;
- communicate through contextBridge only.

### Target Renderer

Responsibilities:

- render arbitrary websites;
- maintain an isolated browser session;
- execute page code in a dedicated isolated world;
- provide navigation and page events;
- never receive Node integration.

Required settings:

```js
{
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true
}
```

### Utility Runtime

Responsibilities:

- eventually run AI-generated Node.js modules;
- emit stdout/stderr/result/error events;
- receive stop signals;
- be disposable after each execution or session;
- never be described as a secure sandbox.

## 3. Fixed Kernel versus generated layer

### Fixed Kernel

The Kernel should contain only infrastructure needed to make generated behavior inspectable and recoverable:

- execution broker;
- target view manager;
- event store;
- module store loader;
- process supervisor;
- checkpoint manager;
- configuration loader;
- model adapter interface;
- restart coordinator.

### Generated Capability Layer

AI-generated artifacts belong under a workspace:

```text
workspace/
├─ modules/
├─ libraries/
├─ experiments/
├─ fixtures/
├─ generated-ui/
└─ state/
```

The AI may create any semantic capability in this layer.

## 4. Raw capability families

The architecture may expose capability families without constraining semantic use.

### Browser

- current target metadata;
- navigation;
- page source/snapshot;
- isolated page JavaScript;
- raw CDP command/event access;
- screenshot later;
- multi-target/session later.

### Filesystem

- workspace file read/write/list/stat;
- optional host filesystem profile later;
- atomic writes;
- file hash and version metadata.

### Process

- start process;
- stream stdout/stderr;
- send input;
- terminate process tree;
- timeout;
- record executable, args, cwd and environment differences.

### Module

- create candidate;
- execute candidate;
- test candidate;
- commit version;
- activate/deactivate;
- declare dependencies;
- inspect provenance;
- roll back.

### Application source

Deferred until runtime modules work:

- create Git branch/checkpoint;
- modify source;
- run checks/tests;
- restart candidate build;
- health probe;
- accept or restore.

## 5. IPC architecture

All renderer-to-main calls must use named IPC channels and structured-clone-compatible payloads.

No generic renderer API such as:

```js
window.blankseed.invoke(channel, ...args)
```

Instead expose narrow transport methods grouped by capability family. The semantic behavior remains open because page code/CDP/process/module source is data within these calls.

Example:

```js
window.blankseed.page.execute({ source, executionId })
window.blankseed.cdp.send({ method, params, executionId })
window.blankseed.checkpoint.create({ label })
```

Validate:

- event sender is the trusted UI webContents;
- request identifier uniqueness;
- payload type and size;
- target/session identity;
- execution lifecycle state.

## 6. Execution identity

Every execution receives:

- `sessionId`
- `executionId`
- `kind`
- `sourceHash` or command hash
- `targetId`
- `startedAt`
- `finishedAt`
- result/error
- checkpoint/module references where applicable

## 7. Event store

MVP may use JSON Lines files. SQLite can be introduced only when querying or concurrency needs justify it.

Required event classes:

- app.lifecycle
- target.navigation
- target.console
- page.execution.started/completed/failed
- cdp.command.started/completed/failed
- process.started/stdout/stderr/exited/killed
- module.candidate/committed/activated/deactivated
- checkpoint.created/restored
- configuration.changed
- model.turn later

## 8. Checkpoint model

Phase 0 checkpoint:

- configuration snapshot;
- active URL;
- active module metadata;
- execution event tail;
- human label.

Later Git checkpoint:

- repository commit/tree identity;
- generated workspace commit;
- application source commit;
- test results;
- runtime health result.

## 9. Model integration boundary

No model SDK is required for Phase 0/1.

Later adapters implement a common interface:

```ts
interface ModelAdapter {
  createTurn(input: ModelTurnInput): Promise<ModelTurnOutput>;
  cancel(turnId: string): Promise<void>;
}
```

The Kernel should not assume OpenAI, Gemini, Claude or a local model message format.

## 10. Evolution path

1. Electron page-control scaffold.
2. Deterministic execution protocol.
3. Utility runtime and process supervision.
4. Versioned module store.
5. Manual AI loop demonstration.
6. Provider-neutral model adapter.
7. Git-backed source modification.
8. Evidence-based decision on CEF/Chromium fork.
