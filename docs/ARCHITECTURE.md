# BlankSeed Browser Architecture

This is the authoritative architecture overview. The Traditional Chinese
companion is [`ARCHITECTURE.zh-tw.md`](ARCHITECTURE.zh-tw.md).

## Purpose and scope

BlankSeed Browser is an Electron-based local Runtime for researching how an
Agent can observe a browser, execute low-level capabilities, create versioned
Modules, and retain evidence of its actions. It has three complementary roles:

- an Electron-based local Runtime;
- a browser automation research console;
- a local Agent capability execution environment.

This document describes the architecture already represented by the current
implementation. It does not redesign the Runtime, change the IPC protocol, or
claim that arbitrary generated code is securely sandboxed.

## System Overview

The trusted local UI is the operator-facing Browser Console. The Main Process
is the fixed Kernel: it owns process and view lifecycle, validates IPC, routes
requests through observable services, and records evidence. Remote web content
and generated Node code execute across separate boundaries.

```text
User
  |
UI Console
  |
Electron Renderer
  |
Preload / IPC Layer
  |
Main Process (Fixed Kernel)
  |
Runtime Services
  |
  +--------------------+-------------------+------------------+
  | CDP / Page Broker  | Node Runtime      | Module System    |
  | Event Store        | Process Supervisor| Recovery Records |
  +--------------------+-------------------+------------------+
             |                  |                  |
       Browser Target      utilityProcess    Workspace / Data
```

The fixed Kernel exposes infrastructure primitives rather than a whitelist of
business tasks. New semantic behavior belongs in generated Modules and
evolution-run artifacts, not in hidden Main Process branches.

## System Architecture

| Layer | Current responsibility | Boundary |
| --- | --- | --- |
| UI Console | Collect input, display results, status, Modules, Checkpoints, and the Event Timeline | Sandboxed local Renderer with no direct Node access |
| Preload / IPC Layer | Expose explicit `contextBridge` methods and carry structured payloads | Only named IPC channels; no generic channel invocation API |
| Main Process | Own the fixed Kernel, validate the sender and payload, coordinate lifecycle | Trusted application authority |
| Capability Broker | Run Page snapshots, isolated Page source, and raw CDP commands with identities, limits, and events | All Target operations pass through the observable broker |
| Node Runtime | Execute generated Node source under `ProcessSupervisor` | Separate Electron `utilityProcess`; observable and terminable, but not a security sandbox |
| Module System | Store Candidate source, Test results, immutable committed versions, active mappings, and Rollback transitions | Generated workspace separated from Kernel source |
| Recovery records | Persist events and Checkpoints and support version-oriented recovery decisions | Integrity-checked state captures plus an operator-confirmed restore limited to the active Module mapping |

## Process Model

### Renderer process

The UI Console is loaded from local application files. It runs with
`nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. It can
request operations only through the explicit API exposed by preload. The
Renderer displays state; it does not own Runtime authority.

### Main process

The Main Process constructs the window, Target, Event Store, Checkpoint Store,
Process Supervisor, Module Store, model adapter, evolution loop, and IPC router.
It is the coordination and trust boundary. Generated behavior must not be
evaluated directly inside this process.

### Node execution boundary

Generated Node source and Node-backed Module Test or Invoke operations execute
in a supervised `utilityProcess`. The Process Supervisor assigns execution
identity, captures result/error and retained output, applies timeouts, and owns
stop or kill handling. Process separation improves observability and recovery;
it does not prevent generated Node code from affecting the host resources it
can reach.

Generated utility processes receive an explicit operational environment
allowlist rather than inheriting the Main Process environment. Provider
credentials such as `OPENAI_API_KEY` therefore remain outside generated code,
Module Test, Module Invoke, retained stdout/stderr, and experiment artifacts.

### Model provider boundary

`ModelTurnManager` keeps a provider-neutral turn contract. Local transports use
the in-process manual adapter or credential-free loopback Chat Completions. The
Hosted OpenAI adapters are fixed to the official HTTPS Responses API and the
`gpt-5.6-sol`, `gpt-5.6-terra`, or `gpt-5.6-luna` model identity. The API key is
injected only in the Main Process; redirects fail closed; requests use
`store: false`; function calls return to the same bounded raw-tool dispatcher.
The Renderer receives only redacted adapter metadata.

### Browser target boundary

Arbitrary remote content is hosted in a separate `WebContentsView` with
`nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. Page
source executes in a dedicated isolated world. Raw CDP and Page operations are
issued by the Main Process broker, and Target lifecycle events are appended to
the Event Store. The owning window explicitly destroys the Target
`webContents` during shutdown.

## Communication Flow

### Command flow

```text
UI action
  -> preload method
  -> named IPC request
  -> sender and payload validation
  -> Runtime service / Capability Broker
  -> Browser Target, Node Runtime, Module Store, or Checkpoint Store
```

Every request receives a `requestId`; execution-bearing operations also carry
an `executionId` and relevant Target, Module, model-turn, or evolution-run
identity. IPC is a transport boundary, not permission to bypass the broker.

### Event flow

Runtime services append ordered records to `events.jsonl`. Records correlate
session, request, execution, turn, action, and evolution-run identities where
applicable. Recent events are returned to the UI and pushed into the Event
Timeline so start, completion, failure, cancellation, activation, and Rollback
remain inspectable.

### Result return

The service returns a structured value or a normalized error through IPC. The
UI presents the latest result, while the Event Store preserves the chronological
evidence. A returned cancellation result means the broker result lifecycle was
cancelled; Page JavaScript already executing in Chromium may continue until it
returns or its document is destroyed.

## Security Boundary

The architecture uses layered controls rather than treating arbitrary code as
safe:

- Remote pages never receive Node integration or direct access to the trusted
  console.
- Page, CDP, process, Module, and Checkpoint operations remain observable
  through the broker or shared event pipeline.
- Generated Node code executes outside the Main Process under a supervisor,
  with timeouts, stop/kill controls, and an explicit secret-free environment
  allowlist.
- Hosted provider credentials remain Main-Process-only and are never accepted
  in Renderer/model payload fields.
- A Candidate remains inactive until it passes Test, completes Commit as an
  immutable Module version, and is explicitly selected through Activate.
- Module Rollback changes the active mapping to a selected earlier committed
  version and records the transition.
- Checkpoint creation records current Runtime state and an integrity hash before
  risky transitions. Operator-confirmed Checkpoint restore stops owned work,
  validates referenced committed Modules and source hashes, creates a safety
  Checkpoint, and atomically compare-and-swaps only `modules.active`. Target
  navigation, browser user data/storage, configuration, credentials, events,
  Module files, Git state, and external effects are explicitly excluded.

The detailed threat and control model is defined in
[`SECURITY_MODEL.md`](SECURITY_MODEL.md).

## Data Flow

```text
Input
  |
  v
Observation
  |  Page snapshot, status, prior events, active Modules
  v
Execution
  |  Page / CDP / Node / Module / evolution action
  v
Result
  |  Structured value or normalized error
  v
Event Timeline
     Ordered, correlated evidence for review and recovery
```

Runtime state is intentionally split by purpose:

- `<userData>/blankseed-data/events/events.jsonl` stores chronological events.
- `<userData>/blankseed-data/checkpoints/*.json` stores state captures.
- `starter/workspace/modules/` stores Candidate and committed Module versions.
- `starter/workspace/state/active-modules.json` stores active version mappings.
- `starter/workspace/evolution-runs/<evo_*>/run.json` stores bounded evolution
  evidence.

## Capability evolution boundary

The Module System uses the explicit sequence `Generate -> Candidate -> Test ->
Commit -> Activate -> Invoke -> Rollback`. Test success is necessary for Commit
but is not proof of semantic correctness or host safety. The full state model
and failure behavior are defined in
[`AGENT_CAPABILITY_LIFECYCLE.md`](AGENT_CAPABILITY_LIFECYCLE.md).

## Platform extension points

Knowledge Plane, Agent Memory, Skill Registry, Capability Marketplace, and
Multi-Agent Governance are future platform layers. They may consume the
identities, evidence, and version model defined here, but they are not current
Runtime claims. Any future layer must preserve broker observability, remote
content isolation, immutable version identity, and explicit recovery evidence.

## Architectural invariants

1. The Runtime does not use a semantic task whitelist.
2. Arbitrary remote content never receives Node integration.
3. Raw primitives remain behind the broker or shared event pipeline.
4. Generated behavior and its evidence remain inspectable.
5. Activation and Rollback refer to explicit immutable Module versions.
6. Checkpoint restore must be described as an operator-confirmed, active-Module
   mapping restore rather than general or automatic state reversal.
7. New platform planes must extend this architecture without silently moving
   generated authority into the fixed Kernel.
