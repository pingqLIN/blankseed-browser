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

## ADR-012 — Evaluate a real local model under a loopback-only research profile

**Status:** Accepted
**Date:** 2026-07-18

### Context

WP-11 closed the Phase 5 protocol gap with a deterministic fixture, but that
fixture cannot establish real-model task quality, evidence-driven correction or
prompt-injection robustness. Adding hosted credentials, multi-target behavior or
automatic source acceptance first would expand risk without answering the core
research question.

### Evidence

The WP-11 run proved nine correlated model turns, eight raw actions, one
preserved failure, model-selected correction and cross-session module reuse.
Its report and the current validation report explicitly leave real-model quality
and hostile-page behavior unverified. Experiment governance also states that
generated Node execution can affect the host and is not a secure sandbox.

### Alternatives

- Add a hosted credential-backed provider and evaluate there.
- Expand browser features or multi-target support first.
- Accept the WP-09 source-evolution candidate before real-model evaluation.
- Run ad hoc local-model demonstrations without a frozen rubric or evidence
  schema.

### Decision

Adopt the WP-12 protocol in
`11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.md`. Run one frozen, credential-free
local model through four scenario families with three independent trials each.
Use a dedicated `workspace-research-loopback-only` profile, synthetic canaries,
isolated per-trial state, complete manifests and explicit pass/hold/stop gates.
Keep the Kernel raw-tool catalog and source-acceptance boundary unchanged.

### Consequences

- Real-model behavior is measured before broader authority or product features
  are added.
- The profile narrows network and data exposure for this higher-risk experiment
  without introducing a semantic task whitelist.
- A failed or held series remains useful research evidence and cannot be erased
  by favorable reruns.
- Passing WP-12 does not authorize hosted credentials, automatic source
  acceptance or wider host access.

### Rollback/review trigger

Stop the series and return to the pre-run checkpoint if evidence, process cleanup
or loopback-only control cannot be maintained. Review this decision before
changing the model provider, network profile, scenario matrix, Kernel tools,
source-acceptance gate or protected data boundary.

---

## ADR-013 — Expose an Agent Console through a redacted adapter catalog

**Status:** Accepted
**Date:** 2026-07-20

### Context

The Kernel already accepts `evolution.run`, but the trusted control renderer had
no task composer or model selection surface. Operators had to call the preload
API manually and could not discover the configured adapter identities.

### Evidence

`ModelTurnManager` already owns the adapter registry, while credentials and
transport configuration remain in the main process. The renderer is trusted for
control but must not receive provider credentials or unrestricted endpoints.

### Alternatives

- Keep `evolution.run` as a developer-console-only API.
- Send the complete adapter configuration through status IPC.
- Add a separate orchestration service outside the Electron application.

### Decision

Add an Agent Console to the existing trusted renderer and expose only a redacted
adapter catalog containing adapter ID, label, provider, model, transport class,
availability and hosted/local classification. Task text, bounded turn/action
budgets and non-secret model options continue through the existing
`evolution.run` contract. Endpoints and credentials remain main-process-only.

### Consequences

- Operators can start and cancel bounded Agent runs without browser developer
  tools.
- The UI can later list hosted adapters without receiving secret material.
- Catalog availability describes configuration, not provider health or model
  quality.

### Rollback/review trigger

Remove the Agent tab and catalog projection if renderer inspection reveals
provider credentials, unrestricted endpoint details or another secret-bearing
configuration value. Review before adding editable endpoint or credential
fields to renderer IPC.

---

## ADR-014 — Add navigation and version rollback as brokered raw tools

**Status:** Accepted
**Date:** 2026-07-20

### Context

The Agent loop could inspect and execute within the current Target and could
activate Modules, but it could neither navigate to a user-requested URL nor
select a previous committed Module version. Both operations already existed in
the trusted UI and service layer.

### Evidence

`TargetViewController.navigate()` and `ModuleStore.rollback()` already emit
observable events and enforce their existing URL/version validation. A
navigation changes `documentGeneration`, so retaining the run's original target
identity would incorrectly reject later page/CDP actions as stale.

### Alternatives

- Keep navigation and rollback available only to the operator UI.
- Add task-level browse/recover tools with semantic policy.
- Let the model invoke arbitrary IPC channel names.

### Decision

Add `target_navigate` and `module_rollback` to the fixed raw-tool catalog and
dispatch them only through the existing target/module services. After a
successful navigation, refresh the current run's expected target identity to
the returned `targetId` and `documentGeneration` before any later raw action.

### Consequences

- An Agent Run can perform a complete observe–navigate–observe loop and can
  explicitly recover a Module version.
- Events, action envelopes and evidence remain on the existing broker path.
- Module Rollback changes only the active mapping and does not reverse external
  side effects.

### Rollback/review trigger

Remove either tool if it bypasses URL/version validation, loses event evidence,
or causes target identity to be refreshed without a completed navigation.

---

## ADR-015 — Limit Checkpoint restore to an atomic active-Module mapping

**Status:** Accepted
**Date:** 2026-07-20

### Context

Checkpoints previously captured status but exposed no restore operation. Calling
that capture a backup would overstate recovery because it contains neither
browser storage nor immutable copies of Module files or external state.

### Evidence

Committed Module versions already carry immutable identity and `sourceHash`, and
the active selection is a small JSON mapping. This is the captured state that
can be validated and replaced atomically without inventing reversal for remote
or operating-system effects.

### Alternatives

- Keep Checkpoints capture-only.
- Restore the Target URL and Electron profile/storage automatically.
- Copy or overwrite Module source and Git state from a Checkpoint.

### Decision

Create versioned Checkpoints with a state hash, explicit restore scope, and
explicit exclusions. Restore requires operator confirmation, an idle owned
Runtime, matching app version and Checkpoint hash, and valid committed Module
source hashes. It creates a safety Checkpoint, then atomically compare-and-swaps
only the complete `modules.active` mapping. Stale mappings or partial validation
fail before mutation.

### Consequences

- Recovery can select a previously captured set of committed capabilities.
- A failed restore preserves the current mapping and an inspectable failure
  event.
- Navigation, browser storage, configuration, credentials, events, Module files,
  Git state, and external effects remain outside restore scope.

### Rollback/review trigger

Disable restore if hash validation, safety capture, atomic mapping replacement,
or owned-runtime stop cannot be guaranteed. Any wider state restore requires a
new decision and dedicated recovery evidence.

---

## ADR-016 — Isolate provider credentials and add fixed GPT-5.6 Responses adapters

**Status:** Accepted
**Date:** 2026-07-20

### Context

The loopback adapter cannot call hosted GPT-5.6, while placing a provider key in
the Electron environment would previously let generated utility processes
inherit it. A generic non-loopback endpoint or Renderer-supplied key would also
expand authority beyond the model adapter boundary.

### Evidence

Electron `utilityProcess.fork()` inherits `process.env` unless an explicit
environment is supplied. Generated Node source can read `process.env` and its
stdout/stderr are retained. Official OpenAI guidance identifies the Responses
API and `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` for current GPT-5.6
reasoning and function-calling workloads.

### Alternatives

- Continue with credential-free loopback models only.
- Reuse the Chat Completions adapter with an editable remote endpoint and key.
- Pass a provider key from Renderer options for each turn.

### Decision

Give every generated utility process an explicit operational environment
allowlist that excludes provider credentials. Add dedicated Main-Process-only
OpenAI adapters fixed to `https://api.openai.com/v1/responses` and the three
GPT-5.6 model IDs. Reject redirects and secret-shaped payload fields, use
`store: false`, disable parallel function calls, set reasoning effort
explicitly, and retain only redacted egress/provider metadata. Keep the WP-12
loopback evaluation profile separate.

### Consequences

- The Agent Console can use GPT-5.6 without exposing `OPENAI_API_KEY` to the
  Renderer or generated Runtime.
- Hosted context is still an external transfer and incurs provider cost.
- A fixed endpoint/model allowlist narrows provider flexibility by design.

### Rollback/review trigger

Disable all hosted adapters if a credential appears in Renderer state, generated
process environment, event/evidence artifacts, error details, redirects, or a
non-allowlisted request. Review before supporting another provider, endpoint,
credential source, streaming mode, or automatic hosted evaluation protocol.

---

## ADR-017 — Require session-anchored handoff evidence and operator Apply for Multi-Agent activation

**Status:** Accepted
**Date:** 2026-07-20

### Context

The Runtime can execute bounded Agent runs and Activate committed Modules, but
model-to-model review without role identity, evidence binding, or a separate
authority gate would let generated output silently become activation policy.
The platform needs a first Multi-Agent contract without redesigning the raw
broker, Module API, or recovery model.

### Evidence

Module Commit already provides immutable `id`, `version`, and `sourceHash`;
Checkpoint restore provides integrity checks, a safety capture, and atomic
active-mapping replacement; the evolution loop already records run, turn,
action, and tool evidence. These primitives can bind a review without granting
the Reviewer a mutating tool.

### Alternatives

- Let a Reviewer call `module_activate` directly after approving a Proposal.
- Treat two model turns in one run as sufficient review without separate Agent
  identities or a persisted handoff.
- Wait for a complete parallel scheduler, policy engine, and quorum system.

### Decision

Add a sequential `MultiAgentRuntime` with distinct immutable Proposer and
Reviewer `agt_*` identities. Limit both roles to read-only `page_snapshot` and
`module_list`; bind Proposal, handoff, review, optional activation target, and
committed source identity by hash; persist a `gov_*` decision; and keep its
Apply authority in a same-session Main Process memory anchor. A Reviewer
approval is advisory. An activation target remains `awaiting_operator` until an
explicit `governance.apply` call revalidates the memory anchor, different
identities, evidence hashes, `sourceHash`, and expected active version, creates
a safety Checkpoint, then performs compare-and-swap Activate. Persisted decisions
cannot be applied after restart.

### Consequences

- Multi-Agent review becomes inspectable and recoverable without adding a
  semantic task whitelist or changing the Module lifecycle.
- Hash mismatch, self-review, malformed verdict, changed source, or stale
  active state fails closed.
- The first implementation is sequential and does not prove independent
  reviewers, providers, organizations, or failure domains.
- Human confirmation remains the policy authority for activation.
- If activation/restore reaches its target mapping but completion evidence
  fails, retain `applied_unknown` and a durable transition record instead of
  falsely returning to an unapplied state.

### Rollback/review trigger

Disable governed Apply if persisted evidence can replace the same-session
memory anchor, a Reviewer can obtain mutating tools, a model verdict can
Activate without operator confirmation, or active-state compare-and-swap is
bypassed. Re-review before
adding parallel orchestration, delegated policy authority, independent-provider
quorum, remote governance services, or broader tool profiles.

---

## ADR-018 — Permit Agent auto-Apply only in an explicit ephemeral governance sandbox profile

**Status:** Accepted
**Date:** 2026-07-20

### Context

ADR-017 keeps Reviewer approval advisory and requires operator Apply in the
normal Runtime. A bounded research task also needs to prove that distinct Agents
can approve and apply a committed Module without weakening the default product
authority boundary or pretending that generated Node execution is securely
sandboxed.

### Evidence

The existing decision anchor, immutable Module `sourceHash`, safety Checkpoint,
and compare-and-swap activation path already fail closed. A deterministic
10-task Electron/CDP suite exercised Page, CDP, supervised Node, Candidate,
Test, Commit, Activate, Invoke, failure correction, and governed Agent
auto-Apply. The final Module `generated.sandbox.counter@1.1.0` returned `42`.

### Alternatives

- Let every approved Reviewer verdict Activate a Module.
- Add a UI-only switch that bypasses Main Process governance.
- Wait for an OS/container/VM security sandbox before testing delegated policy.

### Decision

Keep ADR-017 unchanged for the normal Runtime. Permit automatic Apply only when
`BLANKSEED_SANDBOX_AGENT_AUTO_APPLY=1` and a Main Process policy verifies that
both workspace and data roots are descendants of the same dedicated
`%TEMP%/blankseed-sandbox-*` root and the model endpoint is HTTP loopback. The
policy authorizes only an already approved, same-session, hash-anchored decision
with distinct Proposer and Reviewer identities. Auto-Apply must reuse the same
source verification, safety Checkpoint, expected-active-version check, and
compare-and-swap path as operator Apply. Evidence identifies the authority as
`agent-sandbox-policy`; it must never synthesize an operator identity.

The profile metadata must state `hostFilesystem: not-isolated` and
`securitySandbox: false`. The UI control remains disabled outside this profile,
and an API request for auto-Apply fails before model execution when the profile
is unavailable.

### Consequences

- Normal use still requires explicit operator Apply.
- The research profile can test delegated Agent authority without granting a
  general autonomous activation capability.
- Successful runs retain workspace/data evidence outside the deleted temporary
  runtime; failed runs preserve their temporary root for diagnosis.
- This is governance and lifecycle isolation, not an OS security boundary.

### Rollback/review trigger

Remove the profile and UI control if roots can escape the owned temporary tree,
non-loopback model egress is accepted, auto-Apply runs without an approved
same-session anchor, any integrity/checkpoint/compare-and-swap check is skipped,
or evidence misrepresents the authority or isolation claim. Re-review before
allowing additional tools, persistent roots, hosted providers, or production
use.

---

## ADR-019 — Allow memory-only OpenAI credentials from the trusted control panel

**Status:** Accepted
**Date:** 2026-07-21

### Context

ADR-016 allowed only Main-Process environment credentials. Operators now need
the already-implemented local and OpenAI adapters to be configurable from the
visible Agent panel without storing a provider secret in the repository or
generated Runtime.

### Evidence

The control Renderer is isolated and exposes only explicit preload calls. IPC
records channel metadata, not payload values. `ModelTurnManager` can replace an
idle adapter catalog, and generated utility processes already use an explicit
environment allowlist that excludes provider credentials.

### Alternatives

- Keep environment-variable configuration only.
- Persist an encrypted key with Electron `safeStorage`.
- Add editable remote provider endpoints and per-turn credentials.

### Decision

Add dedicated model-configuration IPC calls. The password field clears
immediately after dispatch. A panel-supplied OpenAI key stays only in Main
Process memory for the current application run and is never returned in status,
events, errors, or results. Environment credentials remain a fallback. Hosted
egress stays fixed to the allowlisted OpenAI Responses endpoint and models.
Local endpoint edits remain loopback-only and reject credentials, query
parameters, and fragments. Adapter replacement is rejected while a model turn
is active.

### Consequences

- Operators can connect local and OpenAI models directly from the Agent panel.
- The trusted control Renderer transiently handles a typed credential before
  clearing the field, so control-renderer compromise remains in scope.
- Restart clears panel-supplied credentials; no persistent secret store is
  introduced.

### Rollback/review trigger

Remove panel credential entry if any key reaches persisted state, logs, events,
errors, results, generated process environments, or non-allowlisted egress.
Review before adding persistence, another provider, an editable hosted endpoint,
or background credential refresh.

---

## ADR-020 — Default Module creation to an operator-gated automated sequence

**Status:** Accepted
**Date:** 2026-07-21

### Context

The Module panel exposes each lifecycle action separately, which makes the
normal Create Candidate → Test → Commit → Activate → Invoke path repetitive.
Automation must not silently cross the immutable Commit or active-mapping
boundaries.

### Evidence

Existing IPC operations already validate each lifecycle transition. Candidate
creation and testing are reversible preparation; Commit creates immutable
version identity; Activate changes the live mapping; Invoke provides immediate
result evidence.

### Alternatives

- Keep only individual manual buttons.
- Run the complete lifecycle with no confirmation.
- Require a governed Multi-Agent decision for every local Module iteration.

### Decision

Make a one-click sequence the default UI. Automatically Create Candidate and
Test, then show explicit YES/NO dialogs before Commit and again before Activate.
After approved activation, Invoke once for verification. NO stops at the tested
Candidate or committed version without rollback. Keep all individual controls
under Manual operations (advanced).

### Consequences

- Routine Module iteration requires one start action and two material decisions.
- Existing APIs, evidence, version identity, rollback, and governance paths stay
  unchanged.
- The automated sequence is UI orchestration, not new Runtime authority.

### Rollback/review trigger

Disable the automated sequence if it can bypass either dialog, advance after NO,
hide a failed lifecycle result, or remove access to individual recovery controls.
Review before automatic Commit, automatic Activate, or policy-based approval.

---

## ADR-021 — Require operator gates for Module publication and activation

**Status:** Accepted
**Date:** 2026-07-21

### Context

ADR-020 gated Commit and Activate in the automated Module sequence but left the
manual Commit, Activate, and Rollback buttons and the default Agent tool catalog able to cross the same
boundaries without an equivalent decision. This contradicted the task-guided
UI's safety message and could let an operator mistake a stopped or unreviewed
path for an approved mutation.

### Evidence

Independent UX, Runtime, and Governance reviewers identified missing manual
confirmation across Module lifecycle boundaries. The final Governance reviewer
recommended aligning Rollback with Commit and Activate. Existing checkpoint restore and
governance apply routes already demonstrate fail-closed Main Process
confirmation checks.

### Alternatives

- Change only the UI wording and keep direct mutation paths.
- Add dialogs to manual buttons without enforcing the decision at IPC.
- Allow the default Agent to publish and activate, then ask for approval after
  mutation.

### Decision

Require `confirmed: true` at the Main Process IPC boundary for Module Commit,
Activate, and Rollback. All trusted-control UI paths must show the semantic YES/NO
dialog before sending this value. NO performs no mutation. The default Agent
profile excludes Commit, Activate, and Rollback tools; these tools are available
only to a separately authorized explicit allowlist. Candidate creation and
testing remain available so an Agent can prepare inspectable work for operator
review.

### Consequences

- All trusted-control UI paths use the same operator gate for publication,
  activation, and rollback.
- The ordinary Agent can prepare and test a Candidate but cannot change the
  committed or active Module state.
- Specialized research profiles may retain autonomous lifecycle tests only by
  supplying an explicit tool allowlist and preserving full evidence.
- Existing Module identity, checkpoints, rollback data, and remote-content
  isolation remain unchanged.

### Rollback/review trigger

Stop Commit, Activate, or Rollback if any UI path can omit confirmation, if NO produces an
event or state change, if an ordinary Agent receives a high-risk Module tool, or
if a specialized allowlist is applied without an inspectable authority source.
Review before delegating Commit, Activate, or Rollback to a new runtime profile.

---

## ADR-022 — Retry only a command rejected by an invalid CDP session

**Status:** Accepted
**Date:** 2026-07-21

### Context

ADR-008 forbids replaying a failed raw CDP command because an unexpected detach
does not prove whether Chromium already applied a stateful command. A long Agent
run produced the narrower `No session with given id` rejection. That rejection
identifies a stale transient debugger session before the broker receives a CDP
result, so the Runtime needs a bounded recovery path without creating a general
command replay policy.

### Evidence

The existing broker reattached only on the next independent command. It did not
classify `No session with given id`, refresh the broker-owned attachment, or
retry the rejected command. Regression fixtures now prove that the exact error
causes one detach/reattach and one retry, that a second rejection produces a
structured `CDP_SESSION_INVALID` failure, and that unrelated CDP failures are
never replayed.

### Alternatives

- Keep failing the evolution action and require a completely new run.
- Replay every command after any debugger error or detach.
- Reload or recreate the target view whenever a session becomes invalid.

### Decision

Treat only an error whose cause contains `No session with given id` as an
invalid-session rejection. Record `SESSION_INVALID`, refresh the broker-owned
debugger attachment, and retry the same command once. Record `RECOVERED` on
success. If the retry fails, return a retryable `CDP_SESSION_INVALID` error with
both causes and `attempts: 2`. Do not retry a third time, and do not extend this
exception to timeouts, unexpected detach, method errors, or other CDP failures.

### Consequences

- Long runs can recover from one known transient session-identity failure.
- The original ADR-008 no-replay rule remains the default for ambiguous or
  potentially already-applied commands.
- Recovery adds one bounded command latency and emits an auditable event chain.
- Target freshness validation still runs after the recovered result.

### Rollback/review trigger

Remove the exception if Electron can execute a command before returning this
specific rejection, if debugger ownership becomes shared, if recovery can issue
more than two total attempts, or if tests show unrelated errors entering the
retry path.

---

## ADR-023 — Compress large observations only at the model-context boundary

**Status:** Accepted
**Date:** 2026-07-21

### Context

Long evolution runs stored complete Node, CDP, and DOM snapshot results in
durable evidence and also copied those results back into later model turns.
Large outputs therefore accumulated in the conversation and increased model
latency. Replacing the durable result would weaken auditability and violate the
evidence-before-claims boundary.

### Evidence

The failed YOUTUBE-AOPass run contained individual action records above 30,000
characters. The existing generic model serializer allowed up to 12,000
characters per tool result and had no lower observation-specific budget.
Regression tests now feed 50,000-character Node, CDP, and page snapshot results
through the model-facing serializer and retain a full 50,000-character Node
result in `run.json`.

### Alternatives

- Truncate or reject large action evidence before persistence.
- Keep the 12,000-character generic preview for every tool kind.
- Add an external semantic summarization model to the Runtime.

### Decision

Apply deterministic observation compression only when `node.execute`,
`cdp.send`, or `page.snapshot` model feedback exceeds
`evolutionObservationMaxChars`, initially 4,000 characters. Preserve status,
identity, error code, retryability, hashes, bounded structural keys, scalar
previews, and metrics where present. Keep the full action result in durable run
evidence. Small observations remain byte-equivalent to the previous model
feedback.

### Consequences

- Per-action observation growth is bounded for the three high-volume tools.
- Durable evidence remains complete and independently inspectable.
- The summary is deterministic structural compression, not a semantic claim.
- A model may need a narrower follow-up observation when omitted detail matters.

### Rollback/review trigger

Review if compressed output exceeds its configured budget, if error identity or
metrics disappear, if durable evidence is altered, or if a workflow repeatedly
requires fields that the structural summary omits.

---

## ADR-024 — Select model-turn timeouts from evolution work state

**Status:** Accepted
**Date:** 2026-07-21

### Context

All evolution model turns inherited the direct-model default of 30 seconds.
That budget was suitable for a simple request but repeatedly expired during
long analysis, code generation, and verification turns. Node, page, and CDP
execution already have separate bounded timeouts and must not be silently
replayed or extended by a model policy.

### Evidence

The failed YOUTUBE-AOPass run ended when turn 18 exceeded 30,000 ms even though
the adapter marked the timeout retryable. Before this decision, the evolution
IPC inserted the 30,000-ms default before `EvolutionRunManager` could select a
turn-specific budget. Regression tests now verify that the manager passes
90,000, 120,000, and 180,000 ms to consecutive analysis, code-generation, and
verification turns and records the same decisions in events and `run.json`.

### Alternatives

- Raise every model turn to one fixed large timeout.
- Let model-generated text choose arbitrary timeouts.
- Extend page, CDP, and Node action timeouts together with model inference.

### Decision

Use policy `blankseed-adaptive-timeout/0.1` for evolution model turns:

- simple: 30,000 ms;
- analysis: 90,000 ms;
- code generation/correction: 120,000 ms;
- verification: 180,000 ms.

Classify the first evolution turn as analysis. Classify the next turn from the
last broker action and its status: observation inputs lead to code generation,
Node/candidate test/invoke results lead to verification, and an action failure
leads to correction. Preserve an explicit operator `timeoutMs` from 1 through
300,000 ms. Record every selection before the model turn. Do not change action
timeouts or add automatic retries.

### Consequences

- Long inference receives a bounded budget appropriate to its work state.
- Direct non-evolution model calls retain their existing 30-second default.
- Operators can still provide an explicit bounded override.
- Timeout decisions are reproducible from events and run evidence.

### Rollback/review trigger

Review if classification repeatedly selects the wrong work state, if any value
exceeds 300,000 ms, if explicit overrides are ignored, or if the policy begins
to alter or replay Page, CDP, Node, or Module actions.

---

## ADR-025 — Resolve generated Module results through API v1.1 entry-point precedence

**Status:** Accepted
**Date:** 2026-07-21

### Context

The generated Node runtime supplied CommonJS-shaped `module` and `exports`
objects but used only the direct return value of `AsyncFunction(source)`.
Committed generated modules that exposed behavior through
`module.exports.evaluate` therefore loaded successfully and then reported a
successful `null` result after implicit `undefined` normalization. Editing an
existing committed module would violate immutable version governance.

### Evidence

`youtube-aopass@1.0.0` has verified source hash
`sha256:dd90a4facd06c1ff1657cc030c63f908840164b186a5a1f1cb419a2f351bd8ec`
and exports `evaluate` without a top-level return. Focused contract tests prove
direct return, asynchronous `execute`, legacy `evaluate`, invalid-module
errors, precedence, and undefined-result rejection. The governed migration
created, tested, committed, and activated `youtube-aopass@1.0.1`; both its
candidate test and a real YouTube-page invocation returned a structured result.

### Alternatives

- Require every generated module to use a top-level direct return.
- Modify committed module source in place.
- Invoke every exported function and merge their results.
- Continue accepting implicit `undefined` as a successful `null` result.

### Decision

Adopt Module Runtime API v1.1. After top-level source evaluation, await exactly
one result source in this order: callable `module.exports.execute(context)`,
callable `module.exports.evaluate(context.observation, context.environment)`,
then a defined direct return value. Resolve `context.observation` from
`input.observation`, then `environment.observation`, then the entire
environment. An explicit `null` remains valid; a missing entry point or final
`undefined` fails with structured code `MODULE_CONTRACT_INVALID`. Preserve the
existing execution envelope and JSON serialization rules.

Allow optional `parentVersion` and `migrationReason` manifest fields and
preserve them through candidate, test, and commit states. Corrective Module
source must still follow `candidate -> test -> commit -> activate`; committed
versions are never rewritten.

### Consequences

- Existing direct-return modules continue to work.
- Modern and legacy CommonJS modules receive deterministic dispatch.
- Invalid generated source no longer succeeds with a silent `null` caused by
  implicit `undefined`.
- Migration lineage is inspectable without changing the existing manifest
  schema identifier.
- Runtime compatibility does not establish live website behavior or
  YouTube-AOPass 3/3 acceptance.

### Rollback/review trigger

Rollback the active Module mapping to `youtube-aopass@1.0.0` if `1.0.1`
invocation fails. Review or supersede this decision if precedence breaks an
existing direct-return module, if context resolution exposes unintended data,
if undefined rejection blocks a documented valid contract, or if manifest
migration fields are lost during any lifecycle transition.

---

## ADR-026 — Resize the control and target panes through the brokered layout boundary

**Status:** Accepted
**Date:** 2026-07-21

### Context

The control renderer and native target `WebContentsView` used one configured,
fixed split. A renderer-only CSS resize would leave the native view bounds out
of sync and could let it cover the divider or control content.

### Evidence

Focused tests prove bounded layout calculation and the emitted
`target.layout.changed` event. An isolated Electron smoke used real CDP mouse
input to drag the separator from 500 px to 640 px; renderer width, main-process
layout, native target width, and ARIA state agreed afterward.

### Alternatives

- Resize only the control renderer with CSS.
- Expose direct renderer access to the native `WebContentsView`.
- Keep a fixed configured split.

### Decision

Expose one explicit preload/IPC resize operation. The main process owns the
accepted control-panel width, clamps both panes to a 320 px minimum, updates the
native view bounds, returns the canonical layout, and records a brokered event.
The renderer may update optimistically while dragging but reconciles to the
returned canonical width. Support pointer drag plus keyboard Arrow, Home, and
End controls on an accessible vertical separator. Width remains session-scoped.

### Consequences

- The control and target panes remain synchronized during resizing.
- Remote pages retain sandbox isolation and receive no Node or layout authority.
- Operators can resize with mouse or keyboard without hiding either pane.
- A new session starts from the configured default width.

### Rollback/review trigger

Remove the separator and resize IPC together if native and renderer bounds can
diverge, pointer capture fails across the view boundary, accessibility state is
stale, or minimum widths prevent required content access.

---

## ADR-027 — Verify generated page behavior through a candidate-bound broker bridge

**Status:** Accepted
**Date:** 2026-07-21

### Context

A generated overlay-ad candidate returned an installer string through an unsupported `run()` export. Its Node-only candidate test correctly rejected the module, and even a corrected Node result would not prove that the installer had run on the remote page or that it could restore the page afterwards.

### Evidence

The supervised Module Runtime accepts `execute`, `evaluate`, or a direct return only. The existing isolated-world page broker already records source hashes, target identity, timeouts, cancellation, and page execution events without giving remote content Node access. Focused tests now prove that a tested candidate is re-evaluated into a four-phase plan and that the dispatcher runs install, verify, uninstall, and rollback verification against one expected target identity.

### Alternatives

- Treat a Node candidate test as proof of page behavior.
- Let the model submit an arbitrary installer directly to `page_execute` after candidate testing.
- Run generated page source in the Node utility runtime.

### Decision

Add `module_candidate_page_test`. It accepts only a tested candidate ID, re-evaluates the stored source under the existing Module Runtime contract, and requires a `pageTest` descriptor with `installSource`, `verifySource`, `uninstallSource`, and `rollbackVerifySource`. Each script runs through the existing isolated-world page broker and must return `{ ok: true }`. The dispatcher retains candidate ID, source hash, plan execution ID, target identity, phase execution IDs, and any failure in the event pipeline.

### Consequences

- Candidate provenance remains bound to the executed page code.
- Remote pages remain sandboxed with `nodeIntegration: false`.
- A successful candidate test no longer implies page success without install and rollback evidence.
- Candidate page testing remains reversible and does not commit or activate a module.

### Rollback/review trigger

Remove the bridge if it can execute source not derived from the stored candidate, loses target-identity checks, omits an uninstall attempt after installation, or lets a remote renderer obtain Node authority.

---

## ADR-028 — De-identify sensitive external page evidence at durable boundaries

**Status:** Accepted
**Date:** 2026-07-24

### Context

An external page target and its visible content can enter several durable
artifacts: append-only events, supervised execution files, and evolution-run
evidence. A cleanup of prior local artifacts cannot prevent the same class of
data from being persisted by a later execution.

### Evidence

Page snapshots include URL, title, text, and accessible element names.
ProcessSupervisor writes source, input, runtime, result, and stdout/stderr
artifacts under experiments. EvolutionRunManager writes the model transcript
and action results into a durable run manifest. Previously these persistence
paths used their input values directly.

### Alternatives

- Ban navigation or execution against every external target.
- Redact only an operator-maintained list of known sensitive domains.
- Store a reversible or dictionary-susceptible target hash.
- Apply one clone-only, default-deny persistence redaction boundary.

### Decision

Use one shared persistence-redaction pipeline before Event Store append,
ProcessSupervisor experiment writes, and EvolutionRunManager run-manifest
writes. Treat non-local HTTP(S) targets as sensitive by default. Replace target
references with fixed non-reversible markers and remove page-content fields
within a target-bearing object. Preserve loopback and fixture hosts for local
tests. Persist only aggregate redaction counts, with a per-experiment receipt.

The pipeline must not mutate the live result, execution envelope, or model
observation. It also must not silently rewrite generated Module candidate
source or committed Module artifacts, because that would alter the code under
review and break immutable source identity. Candidate-source admission is
outside this decision and requires a separately reviewed policy.

### Consequences

- The three durable evidence channels no longer retain raw non-local target
  identity or scoped page content.
- Operators retain an inspectable indication that redaction occurred, without a
  reversible target identifier.
- Evidence has less semantic detail after persistence; live workflow behavior
  and model correction feedback retain their original values.
- Existing local artifacts require separate cleanup; this pipeline is
  preventative rather than a history rewrite.

### Rollback/review trigger

Review or replace this decision if raw external target/page content reaches any
covered durable sink, a loopback or fixture target is redacted unexpectedly,
redaction changes the live execution/model value, or a requirement arises to
persist generated Module source under a newly approved admission policy.

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
