# Architecture Decision Log

## ADR-001 — Use Electron before CEF or Chromium fork

**Status:** Accepted  
**Date:** 2026-07-12

### Context

The research needs Chromium rendering, page instrumentation, Node-based development primitives and an application shell that agents can modify quickly.

### Decision

Begin with Electron. Defer CEF and Chromium source modification until an engine-level blocker is reproducible.

### Consequences

- Faster MVP and agent iteration.
- Access to WebContentsView, webContents, CDP and utilityProcess.
- Electron abstractions may later become a limitation.
- A future migration must preserve generated modules and experiment evidence.

### Rollback/review trigger

Review when a required capability cannot be implemented through webContents/CDP/native modules and a minimal reproduction exists.

---

## ADR-002 — No Chrome Extension architecture

**Status:** Accepted  
**Date:** 2026-07-12

### Context

Manifest V3, extension permission declarations and Web Store policy would shape the experiment before model behavior is observed.

### Decision

Build a standalone Chromium application rather than a Chrome Extension.

### Consequences

- No dependency on Google Chrome installation or extension APIs.
- Broader local capabilities.
- Application must implement its own browser UI, lifecycle and update strategy.

---

## ADR-003 — Remove semantic action whitelist

**Status:** Accepted  
**Date:** 2026-07-12

### Context

Fixed actions such as click/type/select would test tool use rather than capability creation.

### Decision

Expose low-level page execution, CDP, file, process and module primitives. Allow AI to create higher-level abstractions.

### Consequences

- Experiment remains open-ended.
- Generated behavior has larger operational impact.
- Observability, termination and rollback become mandatory.

---

## ADR-004 — Separate remote renderer and generated Node runtime

**Status:** Accepted  
**Date:** 2026-07-12

### Context

A remote page with Node integration would allow ordinary website compromise to inherit host-level privileges.

### Decision

Keep arbitrary remote websites in sandboxed renderers with no Node integration. Run generated Node code in a separate supervised process.

### Consequences

- Requires broker/IPC design.
- Preserves the ability to run broad AI-generated code without merging website and host trust.
- The generated runtime is still not a security sandbox.

---

## ADR-005 — Use disposable per-execution utility runtimes

**Status:** Accepted  
**Date:** 2026-07-13

### Context

Phase 2 requires AI-generated Node.js code to run outside the main process while
preserving stdout, stderr, result/error envelopes, timeout, operator stop and
Windows descendant-process recovery.

### Evidence

WP-04 runtime smoke demonstrated successful source execution, thrown errors,
timeout recovery, operator stop, process-exit crash recovery and Windows
process-tree termination through `taskkill /T /F`.

### Alternatives

- Keep one long-lived utility process and reset it between requests.
- Use ordinary `child_process.fork` instead of Electron `utilityProcess`.
- Delay process-tree handling until module storage exists.

### Decision

Run each `node.execute` request in a fresh Electron `utilityProcess`. Store the
source, redacted input metadata, logs and result under
`workspace/experiments/<executionId>/`. On timeout, stop or shutdown, terminate
the utility process tree on Windows with `taskkill /PID <pid> /T /F`.

### Consequences

- Each execution has a disposable failure boundary and can recover by starting a
  new runtime.
- Startup cost is higher than a persistent runtime.
- `utilityProcess` is still not treated as a security sandbox.
- Generated artifacts are inspectable but excluded from baseline Kernel syntax
  checks because they are source snippets wrapped by the runtime.

### Rollback/review trigger

Review if per-execution startup overhead blocks experiments, if descendant
processes cannot be reclaimed reliably, or if a later module runtime needs
long-lived state with explicit lifecycle controls.

---

## ADR-006 — Start model automation with a local provider-neutral adapter

**Status:** Accepted  
**Date:** 2026-07-13

### Context

Phase 5 requires automated model turns without binding the Kernel to one vendor
or introducing credential handling before the evidence pipeline is stable.

### Evidence

WP-08 runtime smoke demonstrated a provider-neutral `model.turn` contract,
context/evidence packaging, cancellable turns, timeout plumbing and rejection of
secret-shaped payload keys before any external API integration.

### Alternatives

- Add an external hosted model adapter immediately.
- Hard-code one provider's request and response shape into IPC.
- Continue using only manual copy/paste after Phase 4.

### Decision

Introduce a `ModelTurnManager` with pluggable adapters and ship one
deterministic `local.manual` adapter. The local adapter returns structured model
turn results from supplied local output while exercising the same context,
event, cancellation, timeout and serialization path that future external
adapters must use.

### Consequences

- Phase 4-style experiments can be automated without provider credentials.
- External adapters inherit a stable envelope and evidence package format.
- Secret storage remains intentionally unimplemented until a narrower secure
design is approved.
- The local adapter is a contract and evidence harness, not a claim of model
quality.

### Rollback/review trigger

Review when adding the first credential-backed adapter, when model context
packages need redaction beyond event summaries, or when adapter-specific tool
calls require a stricter provider capability registry.

---

## ADR-007 — Keep source-evolution acceptance manual after candidate validation

**Status:** Accepted  
**Date:** 2026-07-13

### Context

Phase 6 requires Git-backed source self-modification with a stable checkpoint,
candidate worktree, patch application, automated checks, candidate launch health
and rollback. Accepting a candidate into `main` is more consequential than
proving a candidate can be generated and verified.

### Evidence

WP-09 runtime smoke created candidate branch
`codex/wp09-source-evolution-1783928693189`, applied an inspectable UI patch,
ran candidate `npm run check` and `npm test`, launched the candidate Electron
app, verified console readiness plus the source-evolution marker, committed the
candidate change to `4b708041c53ffc1292b5514988797194b446a199`, and removed the
candidate worktree while leaving `main` unmodified by the candidate patch.

### Alternatives

- Automatically merge any validated candidate into `main`.
- Apply candidate patches directly in the stable worktree.
- Skip candidate commits and retain only patch files.

### Decision

Keep candidate acceptance manual. The source-evolution runner may create a
candidate branch/worktree, apply and commit a candidate patch, run checks/tests
and verify candidate launch health, but it must roll back the live worktree by
removing the candidate worktree instead of auto-merging into `main`.

### Consequences

- Source self-modification is demonstrable and Git-backed without silently
  changing the stable line.
- Candidate source has a commit identity and patch evidence for review.
- Accepting a candidate remains a separate, explicit Git merge decision.
- Future automation can add a reviewed accept step without changing the safety
  boundary.

### Rollback/review trigger

Review when the project needs automatic acceptance, dependency-changing source
patches, multiple concurrent candidate branches, or conflict resolution during
candidate merge.

---

## ADR template

```markdown
## ADR-XXX — Title

**Status:** Proposed / Accepted / Rejected / Superseded  
**Date:** YYYY-MM-DD

### Context

### Evidence

### Alternatives

### Decision

### Consequences

### Rollback/review trigger
```
