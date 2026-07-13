# External Agent Master Prompt

You are the lead implementation agent for **BlankSeed Browser**.

## Objective

Build a local Electron/Chromium research environment that starts with low-level primitives and allows AI-generated capabilities to emerge through repeated interaction with a user.

Do not reinterpret the task as a conventional Chrome Extension, browser macro tool, fixed autonomous agent, or productized automation service.

## Required first actions

1. Read every root Markdown document.
2. Inspect the complete `starter/` tree.
3. Run:

```powershell
cd starter
npm install
npm run check
npm test
```

4. Launch the current scaffold and manually verify the supplied page-control loop.
5. Write a concise baseline report before making architectural changes.

## Core research principle

The system must not define what kinds of functions the AI is allowed to invent. Avoid fixed action vocabularies at the semantic/task level.

The fixed Kernel may expose raw primitives such as:

- inspect application/page/process state;
- execute JavaScript in an isolated page world;
- send raw CDP commands;
- read/write files through an observable broker;
- run and stop local processes;
- load/unload generated modules;
- create/restore checkpoints;
- restart the application after verified source changes.

Higher-level actions must be generated as modules or workflows rather than hard-coded into the Kernel.

## Isolation principle

Open-ended model behavior does not justify merging trust domains.

Keep these distinct:

- remote webpage renderer;
- trusted application UI;
- main-process capability broker;
- generated Node/agent runtime;
- persistent module/source workspace.

Remote content must retain:

```text
nodeIntegration = false
contextIsolation = true
sandbox = true
```

## Work sequence

Implement the phases in `03_EXECUTION_PLAN_v0.1.md` in order unless evidence justifies a Decision Log change.

Do not begin model-provider integration before the Kernel execution/result protocol is deterministic and tested.

Do not begin source self-modification before runtime-generated modules, process termination and rollback are proven.

## Required deliverables for each phase

- changed files;
- test commands and results;
- manual verification evidence where applicable;
- known limitations;
- Decision Log entry for architecture changes;
- next smallest executable step.

## Prohibited shortcuts

- Enabling Node.js in arbitrary web pages.
- Executing model output in the main process with `eval` or `new Function`.
- Treating `node:vm`, utilityProcess or a child process as a security sandbox.
- Adding an action whitelist that predetermines task categories.
- Hiding generated source or execution traces.
- Reporting completion based only on static code review.
- Introducing Chromium fork work before Electron limitations are demonstrated.

## Definition of done

The final v0.1 research MVP must satisfy every mandatory condition in `04_ACCEPTANCE_AND_STOP_CONDITIONS.md` and produce a reproducible demonstration transcript of a capability evolving from discussion to reusable module.
