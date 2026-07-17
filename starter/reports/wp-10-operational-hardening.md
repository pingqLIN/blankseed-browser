# WP-10 Operational Hardening Report

Date: 2026-07-15 Asia/Taipei

## Scope

Closed the highest-leverage gaps identified after WP-09 without accepting or
modifying the WP-09 candidate branch. This slice adds explicit page/CDP broker
cancellation, next-command recovery after unexpected CDP detach, a
credential-free loopback OpenAI-compatible model adapter, mandatory Traditional
Chinese companions for important documents, CI static/unit verification and a
one-command Windows runtime smoke.

## System-level documentation rule audit

The active machine-level baseline at `C:\Users\miles\.codex\AGENTS.md` states
that important public, operator-facing or release-facing Markdown documents
should have `.zh-tw.md` companions, with the non-suffixed source authoritative.
The repo-local `AGENTS.md` previously required Traditional Chinese for
user-facing documentation but did not define companion coverage or an
executable gate.

WP-10 added the repo-local companion contract, `KEY_DOCUMENTS.zh-tw.md`, 15
required companion files and `scripts/check-doc-companions.mjs`.

## Broker cancellation and CDP recovery

- Added `blankseed:execution:cancel` and
  `window.blankseed.execution.cancel(...)`.
- The broker tracks active page/CDP executions and records cancel
  requested/completed events.
- Cancelled result envelopes use `EXECUTION_CANCELLED`.
- A broker-owned CDP attachment is detached during cancellation.
- Unexpected debugger detach is recorded as `cdp.detached.unexpected`; the next
  independent command attempts reattach and records recovery events.
- Failed raw CDP commands are never automatically replayed.

Page cancellation ends the broker result lifecycle; Chromium does not expose a
reliable per-promise termination primitive here, so already-running page code
may continue until it returns or the document is destroyed.

## Local model transport

- Added `local.openai-compatible` for loopback chat-completions endpoints.
- Allowed hosts: `127.0.0.1`, `localhost`, `::1` over HTTP(S).
- Endpoint URLs containing credentials are rejected.
- The adapter sends no Authorization header.
- Secret-shaped payload keys remain rejected; `maxTokens` is explicitly not
  treated as a credential key.
- Defaults target `http://127.0.0.1:1234/v1/chat/completions` with model
  `local-model`; non-secret environment overrides are supported.

## Commands and results

From `starter/`:

```powershell
npm run verify:runtime
```

Result:

```text
Checked 29 project JavaScript files; baseline configuration is valid.
Checked 15 required Traditional Chinese document companions.
tests 34
pass 34
fail 0
runtime smoke exit code 0
```

Runtime assertions:

```text
active page/CDP executions cancelled: 2
remaining broker executions: 0
page result: EXECUTION_CANCELLED
CDP result: EXECUTION_CANCELLED
model adapter: local.openai-compatible
model status: ok
model output: loopback runtime adapter ok
```

After the smoke, no Electron process and no listener on its scoped CDP port
remained.

### 2026-07-17 runtime-harness safety follow-up

The runtime entry still participates in the current validation contract. A
WP-11 completion review found that its original fixed CDP port could attach to
an unrelated Chromium process. The smoke now allocates an ephemeral loopback
port, requires a unique query nonce on the control target before sending
`Browser.close`, awaits the owned Electron child exit and proves the port can be
rebound. The revised smoke reran successfully with
`ownershipNonceVerified=true`, `cdpPortReusable=true` and exit code 0.

## Manual verification note

- Launch command: `npm run verify:runtime`
- Tested URL: loopback `http://127.0.0.1:<ephemeral>/basic-page.html`
- Action: start long page and CDP work, cancel both, then perform a loopback
  OpenAI-compatible model turn.
- Expected: two deterministic cancellation envelopes, zero remaining broker
  executions, successful credential-free model turn and clean shutdown.
- Actual: matched expected results; runtime smoke exited 0.
- Relevant log/checkpoint path:
  `<userData>/blankseed-data/events/events.jsonl`; durable summary is this file.

## Source-evolution decision

Retain `codex/wp09-source-evolution-1783928693189` as local evidence. WP-10 did
not merge, delete or modify that branch. Candidate acceptance remains a separate
product-owner decision under ADR-007.

## Residual risk

- Page cancellation cannot guarantee immediate termination of JavaScript already
  executing inside Chromium.
- The loopback fixture proves the transport and evidence path, not local-model
  capability quality.
- Hosted credentials, streaming, non-loopback endpoints and provider-specific
  tool semantics remain out of scope.
- CI does not launch Electron; `verify:runtime` remains the Windows operator
  verification path.
