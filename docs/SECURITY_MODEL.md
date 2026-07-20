# BlankSeed Browser Security Model

This is the authoritative security model for Agent capability evolution. The
Traditional Chinese companion is
[`SECURITY_MODEL.zh-tw.md`](SECURITY_MODEL.zh-tw.md).

## Purpose and security claim

BlankSeed Browser studies self-extending Agent behavior while keeping execution
observable, versioned, and recoverable. Its current security model is defense in
depth around an experimental local Runtime. It does **not** claim that generated
Node code is securely sandboxed or harmless.

The objective is to reduce silent authority changes, preserve evidence, and
provide bounded recovery paths without introducing a semantic task whitelist.

## Protected assets and trust boundaries

Protected assets include:

- integrity of the fixed Kernel and trusted UI;
- isolation of arbitrary remote content from Node and Electron authority;
- identity and integrity of generated Module source and versions;
- availability of the Node Runtime, Browser Target, and control console;
- chronological execution, validation, activation, and recovery evidence;
- local workspace and host resources reachable by generated Node code.

The Main Process and local application source are trusted. The remote Target,
generated source, model output, Module Candidate, and external page data are
untrusted inputs. A committed or active Module is versioned and selected; it is
not automatically trusted as safe.

## Threat Model

### Generated code risk

Generated Node source can fail, hang, consume resources, access reachable host
resources, start child processes, or produce unwanted side effects. Page source
or CDP commands can modify the Target, exfiltrate data already available to that
page context, or leave Chromium work running after the caller stops waiting.

Process separation, timeout, and evidence collection reduce impact and improve
diagnosis, but they do not form a complete capability sandbox.

### Uncontrolled Module growth

An Agent could create redundant Candidates, produce version churn, activate an
unreviewed Module, or make provenance too large or unclear to audit. Storage
growth and ambiguous capability ownership can make recovery and governance less
reliable even when each individual operation succeeds.

The lifecycle therefore separates Candidate, Test, Commit, Activate, Invoke,
and Rollback and requires stable identities and retained evidence.

### Runtime failure

The Node Runtime, Target renderer, CDP attachment, Main Process, or local model
transport may time out, crash, detach, or become unresponsive. A stop request
may also differ from confirmed termination, and external effects may survive a
failed invocation.

Runtime failure must be represented as an observable event and normalized
result. Recovery must not assume that cancelling a result automatically undoes
work already performed.

### Remote content and instruction risk

Remote pages are untrusted content. They may attempt to influence an Agent,
trigger unsafe Page behavior, or exploit browser functionality. They must not
receive Node integration, trusted UI objects, or direct access to IPC.

### Evidence and identity loss

Missing source hashes, request or execution identities, Test results, activation
history, or environment identity can make a run irreproducible. Silent evidence
loss is therefore a security and governance failure, not only a logging defect.

## Control Mechanism

### Candidate isolation

Candidate source is stored separately below `workspace/modules/.candidates/`
and is inactive by default. Candidate creation does not alter the active Module
mapping. Test execution still runs generated Node code and can affect reachable
host resources; this is lifecycle isolation, not a security sandbox.

### Validation gate

The Module Store requires a successful Test before Commit. Test records an
execution result and associates it with the Candidate. Commit rechecks the
source hash. The current built-in gate is execution-oriented and must not be
interpreted as proof of semantic safety, dependency safety, or policy approval.

### Version control

Committed Module versions have a stable Module `id`, semantic `version`, and
`sourceHash`. Duplicate committed versions are rejected, and Activate or
Rollback may select only an existing committed manifest. This provides
immutable local identity; it is not publisher authentication or a signed supply
chain.

### Checkpoint

Checkpoint creation captures current application state, active Module metadata,
Target state, configuration, and version identity available through Runtime
status. Evolution runs create a pre-run Checkpoint and retain its identity in
run evidence.

The Checkpoint Store implements a deliberately narrow restore API. An operator
must confirm the restore; owned work must stop; the state hash, application
version, committed manifests, and Module source hashes must validate; and a
safety Checkpoint is created first. Restore then atomically compare-and-swaps
only the complete active Module mapping. It does not claim that application
source, Target navigation, browser storage, configuration, credentials, events,
operating-system state, or external effects are reversed.

### Rollback

Module Rollback moves an active mapping to a selected earlier committed version
and records the transition. Runtime stop/kill controls can terminate supervised
Node execution. Separately governed Git/worktree procedures can recover
application source.

None of these mechanisms automatically reverses external side effects such as
network requests, remote page changes, or host files already modified by code.

### Broker and event pipeline

Page, CDP, Node, Module, model, evolution, and Checkpoint operations use the
observable broker or shared event pipeline. Sender validation, payload
validation, structured result envelopes, source hashes, execution limits, and
correlation identities constrain hidden behavior and support review.

### Remote content isolation

The Target `WebContentsView` uses `nodeIntegration: false`,
`contextIsolation: true`, and `sandbox: true`. Page code runs in an isolated
world, and the Target does not receive the trusted preload API. Target
`webContents` are explicitly destroyed with their owner.

## Failure containment and recovery order

Use the smallest applicable control first:

1. cancel the active model turn or evolution dispatch;
2. cancel the pending Page/CDP broker result lifecycle;
3. stop and confirm termination of the generated Node Runtime;
4. disable or Rollback the active Module version;
5. close or recreate the Browser Target when needed;
6. inspect the Event Timeline and relevant Checkpoint;
7. use the governed Git/workspace recovery procedure for source changes.

Stopping execution and restoring version selection are separate actions. The
operator must verify both termination and the resulting active state.

## Current limitations

- Generated Node execution is not a capability sandbox.
- Candidate Test is not a comprehensive security review.
- Module growth has no quota, review quorum, or garbage-collection policy.
- Checkpoint restore is limited to an integrity-checked active Module mapping.
- Module versions are locally hashed but not signed or publisher-authenticated.
- Rollback cannot reverse external side effects.
- Policy decisions remain operator/governance responsibilities outside model
  output.

## Future Extension

### Permission system

A future permission system may express least-privilege grants for filesystem,
process, network, Target, and persistence operations. Grants should attach to a
versioned capability identity and produce reviewable events. Permission must not
be inferred solely from generated text or a successful Test.

### Capability sandbox

A future capability sandbox may add OS, container, VM, process-token, network,
filesystem, and resource isolation appropriate to the experiment profile. It
must clearly document which host effects are actually prevented and retain the
existing broker and evidence model.

### Policy engine

A future policy engine may evaluate Candidate provenance, Test evidence,
requested permissions, compatibility, and activation context. Policy outcomes
should be explicit, versioned, explainable, and separate from the Agent that
generated the Candidate.

### Registry and governance controls

Skill Registry, Capability Marketplace, and Multi-Agent Governance may add
publisher identity, signatures, review quorum, revocation, retention policy,
compatibility declarations, and activation authority. These controls should
build on, rather than bypass, Candidate isolation and immutable Commit identity.

## Security invariants

1. Remote content never receives Node integration.
2. Generated code does not execute directly in the Main Process.
3. Candidate, Commit, and Activate remain separate transitions.
4. Test evidence is necessary but not equivalent to trust.
5. Every active Module resolves to an explicit committed version and source
   hash.
6. Stop, Rollback, and Checkpoint are distinct controls with distinct claims.
7. Failed code, validation results, errors, and recovery actions remain
   inspectable.
