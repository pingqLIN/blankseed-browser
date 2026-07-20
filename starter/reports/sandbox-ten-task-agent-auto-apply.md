# Sandbox Ten-Task Agent Auto-Apply Report

> Authoritative source. See `sandbox-ten-task-agent-auto-apply.zh-tw.md` for the
> Traditional Chinese companion.

## Result

**PASS** on 2026-07-20 (Asia/Taipei). A deterministic Electron application run
completed all ten tasks through the real preload/IPC/Main Process paths. It used
a credential-free HTTP loopback model fixture and temporary workspace/data
roots. This is not a real-model evaluation and not an OS security-sandbox
claim.

## Scope and evidence

- Command: `npm run verify:sandbox:ten-tasks`
- Tracked task definition: `test/fixtures/sandbox-ten-tasks.json`
- Tracked runner: `scripts/runtime-sandbox-ten-tasks.mjs`
- Successful ignored evidence:
  `workspace/state/sandbox-ten-task-evidence/2026-07-20T11-15-22-543Z/summary.json`
- Model requests: 26
- Owned Electron closed: yes
- Owned temporary runtime removed after archival: yes
- Archived workspace and data evidence: yes

## Task outcomes

| Task | Exercised path | Result |
| --- | --- | --- |
| TASK-01 | Page snapshot | PASS |
| TASK-02 | Isolated-world Page execution | PASS; heading `Fixture Page`, 0 links |
| TASK-03 | CDP navigation history | PASS |
| TASK-04 | Supervised Node execution | PASS; result `42` |
| TASK-05 | Module Store inventory | PASS; initially empty |
| TASK-06 | Candidate, Test, Commit `1.0.0` | PASS |
| TASK-07 | Candidate, Test, Commit `1.1.0` | PASS |
| TASK-08 | Activate and Invoke `1.0.0` | PASS; result `41` |
| TASK-09 | Intentional Node failure and correction | PASS; one failed action retained |
| TASK-10 | Proposer, Reviewer, policy Apply, Invoke `1.1.0` | PASS; result `42` |

TASK-10 produced governance decision
`gov_859f26a3-1a34-41d4-9364-ca2d7f55f69a`, status `applied`, authority kind
`agent-sandbox-policy`, and safety Checkpoint
`chk_88d85e4d-56f5-49f5-ae9e-9b195ff5cb27`. The final active mapping was
`generated.sandbox.counter: 1.1.0`; no generated Runtime remained active.

## Debug findings

Four fail-closed iterations were preserved in the system temporary directory:

1. `blankseed-sandbox-ten-tasks-H0lpK2`: malformed injected JavaScript newline.
2. `blankseed-sandbox-ten-tasks-aPn7Vb`: task request identifier was shorter
   than the protocol minimum.
3. `blankseed-sandbox-ten-tasks-nJU78h`: the fixture server wrote response
   headers before a scenario assertion completed.
4. `blankseed-sandbox-ten-tasks-tcvNDn`: fixture expected one link while the
   inspected page contained zero; all other task runs in that iteration were
   `ok`.

The runner now serializes the response before writing headers and safely handles
already-sent headers. These failures are test harness defects, not accepted
product behavior, and their evidence was not used as PASS evidence.

## Auto-Apply boundary

The feature is disabled by default. Main Process activation requires all of:

- explicit `BLANKSEED_SANDBOX_AGENT_AUTO_APPLY=1`;
- workspace and data roots below the same dedicated
  `%TEMP%/blankseed-sandbox-*` root;
- an HTTP loopback model endpoint;
- an approved, same-session, hash-anchored decision with different Agent
  identities;
- immutable committed `sourceHash`, expected active state, safety Checkpoint,
  and compare-and-swap validation.

If the profile is unavailable, an auto-Apply request fails before model calls.
Normal Runtime use still requires Operator Apply. The sandbox profile metadata
states `hostFilesystem: not-isolated` and `securitySandbox: false`.

## Manual verification note

- Launch command: `npm run verify:sandbox:ten-tasks`
- Tested URL: owned loopback `http://127.0.0.1:<ephemeral>/fixture.html`
- Action: execute ten fixture tasks, including governed Agent auto-Apply
- Expected: ten PASS results, final Module `1.1.0`, Invoke value `42`, zero
  remaining generated runtimes, archived evidence, owned Electron termination
- Actual: matched expectation
- Checkpoint/evidence: successful ignored evidence path listed above

## Limitations

The test proves deterministic policy and integration behavior only. It does not
prove real-model quality, prompt-injection resistance, independent reviewers,
non-loopback egress control at the operating-system layer, or host filesystem
containment for generated Node code.
