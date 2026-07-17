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

## ADR-008 — Add explicit broker cancellation and next-command CDP recovery

**Status:** Accepted
**Date:** 2026-07-15

### Context

Phase 1 and the experiment kill hierarchy require pending page/CDP broker work
to be cancellable. CDP also needs a deterministic response to unexpected
debugger detach without silently replaying raw commands that may have side
effects.

### Evidence

WP-10 unit tests cancelled a pending page execution with
`EXECUTION_CANCELLED` and recorded the cancel event chain. A separate test
forced an unexpected debugger detach and verified `cdp.recovery.started` plus
`cdp.recovery.completed` on the next command. The Windows runtime smoke
cancelled one active page execution and one active CDP command, reporting
`cancelled=2` and `remaining=0`.

### Alternatives

- Keep timeout-only behavior.
- Reload or destroy the target view for every cancellation.
- Automatically replay the command after a CDP detach.

### Decision

Expose `blankseed:execution:cancel` through the narrow preload API and let the
broker abort the result lifecycle for selected or all active page/CDP
executions. Detach CDP when a broker-owned command is cancelled. Record an
unexpected detach and reattach on the next independent command, but never replay
the failed raw command automatically.

### Consequences

- Stop All can address model, broker and generated-runtime activity.
- Page cancellation is honest about its boundary: already-running Chromium
  JavaScript may continue even though the broker result is cancelled.
- Unexpected debugger state is visible and recoverable without duplicating
  potentially stateful commands.

### Rollback/review trigger

Review if Electron exposes a reliable per-execution JavaScript termination API,
if CDP session ownership becomes shared, or if cancellation cannot reclaim a
broker-owned debugger attachment.

---

## ADR-009 — Use a credential-free loopback adapter as the first real model transport

**Status:** Accepted
**Date:** 2026-07-15

### Context

WP-08 proved the provider-neutral turn contract with `local.manual`, but did not
send a request to an actual model-server transport. Adding a hosted provider
would require a separate credential-storage and redaction decision.

### Evidence

WP-10 added an HTTP integration test and an Electron runtime smoke against a
loopback OpenAI-compatible fixture. Both completed through
`local.openai-compatible`; the integration test verified that no Authorization
header was sent. Non-loopback endpoints and credential-bearing endpoint URLs
are rejected.

### Alternatives

- Add a hosted credential-backed adapter now.
- Continue using only `local.manual`.
- Allow arbitrary user-supplied HTTP endpoints.

### Decision

Add `local.openai-compatible` with a configuration-owned endpoint and model.
Restrict the endpoint to HTTP(S) loopback, forbid credentials in the URL, send
no authorization header and keep secret-shaped request keys rejected. Operators
may override endpoint and model through non-secret environment variables.

### Consequences

- A real local model server can use the provider-neutral turn path without
  expanding credential scope.
- The adapter is compatible with local OpenAI-style chat-completions servers,
  but it does not prove model quality.
- Hosted-provider work remains blocked on an explicit secret-storage decision.

### Rollback/review trigger

Review before supporting non-loopback endpoints, authorization headers, hosted
providers, streaming responses or provider-specific tool semantics.

---

## ADR-010 — Enforce Traditional Chinese companions for important documents

**Status:** Accepted
**Date:** 2026-07-15

### Context

The machine-level governance requires important public, operator-facing and
release-facing Markdown documents to have `.zh-tw.md` companions. The repo only
said that user-facing documentation should use Traditional Chinese, so stale or
missing companion coverage was not executable policy.

### Evidence

The WP-10 documentation audit found no existing `.zh-tw.md` companions. The new
companion checker validates 14 authoritative documents and their authority
markers; `npm run check` passed with all 14 present.

### Alternatives

- Keep the language rule as prose only.
- Replace English technical sources with Chinese files.
- Translate every historical report regardless of current importance.

### Decision

Keep English publishable technical files authoritative, preserve already-Chinese
files such as `README_HANDOFF.md`, add explicit `.zh-tw.md` companions for the
important active set and enforce that set through `npm run check`.

### Consequences

- Chinese readers have a discoverable documentation layer through
  `KEY_DOCUMENTS.zh-tw.md`.
- Future edits to important documents must maintain their companions.
- Historical reports remain outside the mandatory set unless they become active
  operator documents.

### Rollback/review trigger

Review when the project changes its authoritative language model, the important
document set changes, or companion drift needs semantic rather than existence
validation.

---

## ADR-011 — Route model tool calls through a bounded Kernel evolution loop

**Status:** Accepted
**Date:** 2026-07-17

### Context

The Phase 5 adapter could parse OpenAI-compatible `tool_calls`, but returned
them as dead-end output. It did not dispatch raw capabilities, return results
to a later model turn or reproduce the Phase 4 failure/correction/reuse
experiment. A smoke script that directly chained renderer APIs would not prove
model-driven evolution and would bypass the intended orchestration boundary.

### Evidence

WP-11 added a main-process `EvolutionRunManager` and
`RawCapabilityDispatcher`. A deterministic loopback fixture requested a page
snapshot, created a non-serializable candidate, observed
`SERIALIZATION_FAILED`, generated corrected source, tested, committed,
activated and invoked it. A second Electron session reused the active committed
version. The run persisted one checkpoint, nine model turns, eight actions and
one expected failed action with correlated events and module provenance.

### Alternatives

- Let the renderer or smoke script interpret and execute model tool calls.
- Add task-level tools such as summarize or translate.
- Bind the Kernel contract directly to OpenAI function-call messages.
- Delay all action dispatch until hosted credential support exists.

### Decision

Add a bounded, main-process-only evolution loop. Keep its internal contract
provider-neutral and let adapters translate provider wire formats. Dispatch
only named raw capability families through existing target, broker, process,
module and checkpoint services with their existing validation and event paths.
Persist a complete local run manifest and structured action results. Reject
unknown or malformed tools without introducing a semantic task whitelist.

### Consequences

- Phase 4 capability evolution can run through automated model turns while
  producing equivalent failure, correction, source, event and reuse evidence.
- Model text never selects arbitrary IPC channels or gains direct main-process
  access.
- The fixed Kernel now owns bounded orchestration and correlation IDs; semantic
  capabilities remain generated artifacts.
- Fixture evidence proves the protocol and correction path, not real-model
  quality or prompt-injection robustness.

### Rollback/review trigger

Disable the `evolution.run` IPC and remove the evolution manager/dispatcher if
correlation or rollback integrity cannot be maintained. Review before adding
hosted credentials, non-loopback transports, parallel evolution runs,
dependency mutation, automatic source acceptance or provider-specific Kernel
semantics.

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
