# BlankSeed Browser Starter

This is an intentionally small Electron scaffold for the BlankSeed Browser handoff.

Complete operator instructions are in [`../USER_GUIDE.md`](../USER_GUIDE.md),
with a Traditional Chinese companion at
[`../USER_GUIDE.zh-tw.md`](../USER_GUIDE.zh-tw.md).
The approved next-stage experiment is defined by
[`../11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.md`](../11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.md)
and its [Traditional Chinese companion](../11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.zh-tw.md).

## Requirements

- Windows 10/11 recommended.
- Node.js 22 or newer for npm tooling. Electron supplies its own embedded Node.js at runtime.
- npm.

## Install and run

```powershell
npm install
npm run check
npm test
npm start
```

On Windows, the repository-root `啟動 BlankSeed Browser.cmd` file provides a
double-click launcher for the same application startup path.

To start the interactive Traditional Chinese tutorial website and open the
correct loopback URL automatically, run:

```powershell
npm run tutorial:open
```

Windows users can instead double-click the repository-root
`啟動操作教學.cmd` file. Use `npm run tutorial:stop` or
`停止操作教學.cmd` to stop a server started by that launcher. Direct `file://`
loading is intercepted because the tutorial must fetch the current Renderer
markup from its loopback server.

The launcher opens `http://127.0.0.1:4173/tutorial/`. The tutorial loads the current
Renderer markup and stylesheet as its UI source of truth, then drives a local
simulation. It does not navigate to real websites, submit credentials, call a
model provider, or apply a Module.

One-command verification:

```powershell
npm run verify
npm run verify:runtime
npm run verify:wp11
npm run verify:sandbox:ten-tasks
npm run verify:wp12:preflight
```

`verify` runs syntax/configuration/document-companion checks and unit tests.
`verify:runtime` additionally runs the scoped Windows Electron hardening smoke.
`verify:wp11` additionally proves the deterministic automated evolution loop;
it is a WP-12 preflight, not real-model evidence.
`verify:sandbox:ten-tasks` launches an isolated Electron/CDP run against a
credential-free loopback model fixture and verifies ten raw-capability and
governance tasks, including policy-gated Agent auto-Apply.
`verify:wp12:preflight` verifies the fail-closed WP-12A foundation. With no
operator-owned trial input or external egress evidence it records
`PRE-FLIGHT HOLD / NOT RUN` and does not launch Electron or contact a model.

## Current UI

- Left: local trusted control panel.
- Right: remote target page rendered in `WebContentsView`.

Available baseline controls:

- navigate URL;
- back/forward/reload;
- inspect a basic page snapshot;
- execute JavaScript in isolated world `1001`;
- send a raw CDP method and parameters;
- create an integrity-checked file checkpoint and explicitly restore its active
  Module mapping;
- ping a utility process;
- execute generated Node.js source in a supervised utility process;
- stop active generated Node.js execution;
- create, test, commit, activate, invoke and roll back generated modules;
- inspect active modules, checkpoints and the execution timeline.
- cancel active page/CDP broker executions;
- perform provider-neutral model turns through `local.manual` or the
  credential-free `local.openai-compatible` loopback adapter.
- compose a bounded Agent task and select Local Manual, Local OpenAI-compatible,
  or an available OpenAI GPT-5.6 Sol/Terra/Luna adapter.
- run a bounded provider-neutral model/tool evolution loop through the same raw
  broker, runtime, module and checkpoint services.
- run a sequential Proposer-to-Reviewer Multi-Agent review with hash-bound,
  same-session Main Process evidence anchoring, then require operator Apply
  before an approved committed Module can be activated.

## Important

Generated Node.js source runs outside the main process in a disposable
`utilityProcess`. This is an observability and recovery boundary, not a security
sandbox. Runtime source, redacted input metadata, stdout/stderr, result and error
artifacts are stored under `workspace/experiments/`, which is ignored by Git.

## Runtime data

Electron writes runtime data under its userData directory:

```text
<userData>/blankseed-data/
├─ events/events.jsonl
└─ checkpoints/*.json
```

The UI displays the resolved path.

Git-ignored Runtime workspace evidence also includes
`workspace/evolution-runs/<runId>/run.json`,
`workspace/multi-agent-runs/<runId>/run.json`, and
`workspace/governance/decisions/<decisionId>.json`.
Checkpoint restore transitions are journaled under
`<userData>/blankseed-data/checkpoint-transitions/`; `applied_unknown` means the
target mapping was observed but completion evidence failed and needs operator
reconciliation.

## Manual verification

1. Start the app.
2. Navigate to `https://example.com/`.
3. Press **Inspect Page**.
4. Execute:

```js
return {
  title: document.title,
  headings: [...document.querySelectorAll('h1,h2')].map((el) => el.textContent)
};
```

5. Send CDP method:

```text
Page.getNavigationHistory
```

with params `{}`.
6. Create a checkpoint.
7. Execute generated Node.js source:

```js
console.log('hello from generated runtime');
return {
  platform: process.platform,
  cwd: process.cwd()
};
```

8. Verify results and log path in the left panel.

## Security posture of the scaffold

Remote page:

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
```

The local UI also uses context isolation and a narrow preload API.

## Local model adapter

The real model transport is intentionally loopback-only and sends no
authorization header. It defaults to:

```text
endpoint: http://127.0.0.1:1234/v1/chat/completions
model: local-model
```

Operators can change the endpoint and model ID directly in Agent > AI Model
Connection for the current application session, or set
`BLANKSEED_LOCAL_MODEL_ENDPOINT` and `BLANKSEED_LOCAL_MODEL_NAME` before launch.
The endpoint must remain HTTP(S) loopback (`127.0.0.1`, `localhost` or `::1`)
and must not contain credentials, query parameters, or fragments.

## Hosted OpenAI GPT-5.6 adapters

Use the top-bar **模型設定** shortcut, or open **Agent > AI 模型接入**. The
panel accepts a temporary OpenAI API key, or
the application can inherit `OPENAI_API_KEY` from the Electron Main Process
environment. Either source enables `gpt-5.6-sol`, `gpt-5.6-terra`, and
`gpt-5.6-luna`. The dedicated transport uses the official OpenAI Responses API,
explicit `reasoning.effort`, `store: false`, sequential function calls, and a
fixed HTTPS endpoint. The hosted endpoint is not editable.

This application does not currently register a Codex provider or a model named
`GPT Codex`. Codex is a separate product/runtime boundary and must not be
presented as an available adapter without a dedicated, tested integration.

The control Renderer holds a typed key only long enough to send it through a
dedicated trusted IPC call and clears the input immediately. The Main Process
keeps a panel-supplied key in memory only; status, events, results, and persisted
settings never return or store it. Generated utility processes receive an
explicit operational environment allowlist, so the provider key is not
inherited by generated Node source, Module Test, or Module Invoke. Hosted use is
separate from the credential-free WP-12 loopback evaluation profile.

## Automated Module lifecycle

The Module tab defaults to a one-click sequence: Create Candidate, Test,
operator confirmation before Commit, a second operator confirmation before
Activate, and Invoke verification. Selecting NO at either gate stops safely at
the tested Candidate or committed version. The original individual controls
remain available under Manual operations (advanced).

See the official [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model)
and [GPT-5.6 model catalog](https://developers.openai.com/api/docs/models).

## Multi-Agent Governance

The Agent tab can execute a sequential Proposer-to-Reviewer handoff. Each role
has a distinct immutable Agent identity and is limited to read-only
`page_snapshot` and `module_list` tools. The Reviewer must bind its verdict to
the Proposal hash. When a committed Module target is supplied, approval creates
an `awaiting_operator` decision; it does not activate anything directly.

Operator Apply revalidates evidence hashes, the committed source identity, and
the expected active version against a same-session Main Process memory anchor,
creates a safety Checkpoint, and performs a compare-and-swap Activate. Persisted
decision JSON is evidence only and cannot be applied after restart. This is a
human-gated review workflow, not parallel or autonomous Multi-Agent policy
authority.

For deterministic research only, `verify:sandbox:ten-tasks` launches an
explicit ephemeral profile with workspace and data roots under one dedicated
`%TEMP%/blankseed-sandbox-*` tree and an HTTP loopback model endpoint. In that
profile, the Agent UI exposes an auto-Apply control and a distinct
`agent-sandbox-policy` authority may apply an approved same-session decision
through the same Checkpoint, source-integrity, and compare-and-swap path.
Normal launches keep this control disabled and still require Operator Apply.
The profile is not an OS security sandbox and does not isolate generated Node
code from the host filesystem.

## Automated evolution verification

Run the deterministic Phase 5 exit smoke on Windows:

```powershell
npm run verify:wp11
```

It uses an isolated temporary workspace and a credential-free loopback fixture.
The model fixture requests raw tools, observes one intentional candidate
serialization failure, produces corrected source, commits and activates the
module, then a second Electron session reuses it. Normal launches persist run
manifests under `workspace/evolution-runs/`.

## WP-12 preflight

The tracked files under `test/fixtures/wp12/` freeze B1/B2/I1/R1 inputs, trust
labels and SHA-256 hashes. Actual model, workspace, port-ownership and external
OS egress evidence belongs in the Git-ignored `workspace/wp12-preflight/` area.
Start from `config/wp12-preflight.example.json`; do not treat the template as
evidence.

Run the strict preflight with:

```powershell
npm run wp12:preflight
```

To run both required Windows smokes and carry all four current check results
into the strict preflight, use `npm run wp12:preflight:full`.

HOLD exits with code 2 and writes
`workspace/wp12-preflight/preflight.json`; it never starts a trial. Validate a
completed evaluation sidecar separately with:

```powershell
npm run validate:wp12:evaluation -- workspace/evolution-runs/<evolutionRunId>/wp12-evaluation.json
```
