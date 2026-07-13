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
