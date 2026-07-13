# Experiment Governance and Recovery

## Purpose

This document preserves an open-ended AI experiment without pretending arbitrary code is harmless. The governance mechanism should observe and recover; it should not predetermine what capabilities the model may invent.

## Profiles

### Workspace Research

Recommended initial profile.

- generated source stored under project workspace;
- target remote renderer isolated from Node;
- generated Node runtime is a separate disposable process;
- network may be available;
- host impact is possible through Node/process primitives and must be recorded;
- run inside a disposable VM or a dedicated OS account for higher-risk trials.

### Host Research

Optional later profile.

- AI may intentionally inspect or modify paths outside workspace;
- AI may invoke installed local tools;
- requires an explicit experiment configuration change and checkpoint;
- do not present this as sandboxed.

## Fixed protection mechanisms

These are not semantic restrictions:

- visible execution source;
- chronological event log;
- timeout and stop;
- process supervisor;
- source/module versioning;
- checkpoint and rollback;
- remote renderer isolation;
- exact environment identity.

## Kill hierarchy

1. Cancel active model turn.
2. Cancel pending broker request.
3. Stop generated utility runtime.
4. Kill descendant process tree.
5. Disable active generated modules.
6. Close target WebContentsView.
7. Restart application to last checkpoint.
8. Restore Git/workspace checkpoint.

The UI must distinguish “stop requested” from “confirmed stopped”.

## Checkpoint moments

Create a checkpoint:

- before enabling a new capability profile;
- before installing dependencies;
- before activating a persistent generated module;
- before modifying application source;
- before restarting into a candidate build;
- after a user-verified milestone.

## Evidence retention

Never silently discard:

- failed source;
- runtime errors;
- model requests that were rejected by the environment;
- user corrections;
- permission/profile changes;
- rollback actions.

Secrets must be redacted at capture boundaries, but redaction events should remain visible.

## Generated dependency policy

The AI may propose dependencies. Before installation, capture:

- package name and version/range;
- source registry;
- reason;
- license;
- install command;
- lockfile diff;
- lifecycle scripts;
- native binary presence;
- rollback checkpoint.

The initial Kernel should remain dependency-light. Generated modules may have their own isolated dependency space later.

## Source self-modification gate

Source self-modification may begin only after:

- runtime process stop is verified;
- module rollback is verified;
- baseline checks are deterministic;
- a candidate instance can report health separately from the stable instance;
- the stable instance can restore the repository/workspace.

## Interpretation rule

The existence of a recovery layer does not make arbitrary execution safe. It makes failures more visible and the experiment more reproducible.
