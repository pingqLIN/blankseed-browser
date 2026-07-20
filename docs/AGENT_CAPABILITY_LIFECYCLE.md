# Agent Capability Lifecycle

This is the authoritative Agent capability lifecycle specification. The
Traditional Chinese companion is
[`AGENT_CAPABILITY_LIFECYCLE.zh-tw.md`](AGENT_CAPABILITY_LIFECYCLE.zh-tw.md).

## Purpose and boundary

This specification gives generated Agent capabilities a shared vocabulary and
state model. It describes the current Module Store lifecycle without changing
the Module API or granting the Agent authority to bypass validation,
activation, or recovery controls.

## Capability Lifecycle

```text
Generate
   |
   v
Candidate
   |
   v
Test
   |
   v
Commit
   |
   v
Activate
   |
   v
Invoke
   |
   v
Rollback
```

The sequence separates creation from authority. A generated source file is not
an active capability, a passing Candidate is not a committed version, and a
committed version is not invoked until an explicit Activate step.

## State model

| Stage | Durable identity or evidence | May be invoked as active capability? |
| --- | --- | --- |
| Generate | Source and generation context | No |
| Candidate | `candidateId`, Module metadata, source, `sourceHash`, validation state | No |
| Test | Test execution result, `executionId`, updated validation state | No |
| Commit | Module `id` + semantic `version` + `sourceHash` | No, until Activate |
| Activate | Active mapping from Module `id` to committed `version` | Yes |
| Invoke | Execution result and correlated Module/event identity | The active version is invoked |
| Rollback | Transition from current active version to a selected committed version | Yes, after the mapping changes |

## Generate

Generate creates source and supporting metadata from a user, model turn, or
other observable workflow. The generated artifact must enter the Module Store
through Candidate creation. Generate does not write hidden behavior into the
fixed Kernel and does not imply validation or Runtime authority.

Useful provenance includes the originating session, execution, evolution run,
model, action, and Checkpoint identities when available.

## Candidate

A Candidate is a capability version that has not been formally enabled. The
current Module Store assigns a `cand_*` identity and stores it below
`workspace/modules/.candidates/`.

A Candidate includes:

- Module metadata: stable `id`, semantic `version`, description, entry, and
  declared Runtime;
- source and its `sourceHash`;
- provenance such as session, execution, evolution-run, model, and Checkpoint
  references when available;
- validation state, initially `candidate` and changed to `tested` only after a
  successful Test;
- Test result evidence when Test has run.

Candidate source remains inactive. Creating a Candidate must not alter the
active Module mapping.

## Test

Test executes Candidate source through the supervised Node Runtime and records
the result and execution identity. The gate asks three kinds of questions:

- **Correctness:** did the Candidate complete the defined test and return the
  expected structured result?
- **Runtime safety:** did it remain within configured execution limits, and can
  failure or timeout be observed and terminated?
- **Compatibility:** does it match the declared Module metadata, Runtime, and
  project-defined integration expectations?

The built-in gate currently proves an execution-oriented Test result. Broader
semantic correctness, host safety, dependency review, and cross-version
compatibility require additional project or operator checks. A failed Test
keeps the artifact in Candidate state and must not permit Commit.

## Commit

Commit converts a successfully tested Candidate into an immutable Module
version. The identity is the combination of stable Module `id`, semantic
`version`, and verified `sourceHash`.

Before Commit, the Module Store verifies that:

- Candidate status is `tested`;
- stored source still matches `sourceHash`;
- the target Module version does not already exist.

Commit is analogous to a Git commit or model registry version because it makes
a specific artifact addressable and auditable. It is not a Git operation and
does not, by itself, publish or Activate the Module.

## Activate

Activate explicitly adds a committed version to the active Runtime capability
set. The Module Store verifies that the selected committed manifest exists,
then updates the Module `id` to version mapping in
`workspace/state/active-modules.json` and records the previous version.

Activate may select only committed versions. Activation should be preceded by
a Checkpoint when the capability is persistent or operationally significant.

## Invoke

Invoke resolves the active version for a Module `id`, verifies its stored source
against `sourceHash`, and sends the source to the supervised Node Runtime with
the provided environment and timeout.

The Event Store records invocation start and completion or failure, including
Module identity, version, execution identity, status, and normalized error.
Invoke does not choose an uncommitted Candidate and does not silently change the
active mapping.

## Rollback

Rollback restores Module selection to a specified previously committed version.
The Module Store verifies that version, records the current version, updates the
active mapping, and appends `module.rollback.completed` evidence.

Rollback has precise limits:

- it changes the active Module version; it does not delete newer versions;
- it does not reverse external side effects already produced by an Invoke;
- it is distinct from Checkpoint restore;
- it is distinct from Git/worktree rollback for application source.

Checkpoint restore is an operator-confirmed recovery operation, not a lifecycle
transition automatically selected by a Module. It validates Checkpoint
integrity, the application version, committed Module manifests, and source
hashes; creates a pre-restore safety Checkpoint; and atomically restores only
the complete active Module mapping. It does not restore navigation, browser
storage, configuration, credentials, events, Module files, Git state, or
external effects. Application source recovery remains a separately governed
Git/workspace procedure.

## Failure transitions

- Generate or Candidate creation failure produces no active capability.
- Failed Test leaves the Candidate uncommitted.
- Commit conflict preserves the existing immutable version.
- Activate failure preserves the prior active mapping.
- Invoke failure records evidence while leaving version selection unchanged.
- Rollback failure preserves the current active mapping and requires operator
  review of the requested version and evidence.

## Lifecycle invariants

1. Candidate is inactive by default.
2. Test must succeed before Commit.
3. Commit creates a unique immutable version identity.
4. Activate selects only a committed version.
5. Invoke resolves only the active version and verifies its source hash.
6. Rollback targets an existing committed version and remains observable.
7. No lifecycle step erases failed source, Test results, or transition events.

## Relationship to future registries

A future Skill Registry or Capability Marketplace may index committed Module
versions, validation evidence, provenance, compatibility declarations, and
policy decisions. Discovery or distribution must not collapse Candidate,
Commit, and Activate into one operation. Multi-Agent Governance may coordinate
who proposes, reviews, or activates a capability, while the lifecycle state
machine remains the common technical contract.
