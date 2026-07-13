# WP-08 Model Adapter Interface Report

Date: 2026-07-13 Asia/Taipei

## Scope

Implemented the Phase 5 provider-neutral model adapter surface without adding
external model credentials or binding the Kernel to a specific hosted provider.
The implementation adds one deterministic local adapter, `local.manual`, so the
same model-turn pipeline can be tested with packaged context, ordered evidence,
cancellation and structured errors.

This report does not claim a live hosted model integration. Credential-backed
adapters remain out of scope until secret storage is designed and explicitly
approved.

## Files Changed

- `src/main/model-adapter.cjs`
- `src/main/main.cjs`
- `src/main/ipc-router.cjs`
- `src/preload/preload.cjs`
- `src/shared/contracts.cjs`
- `config/defaults.json`
- `scripts/check-project.mjs`
- `scripts/runtime-wp08-smoke.mjs`
- `test/model-adapter.test.mjs`
- `../09_DECISION_LOG.md`

## Contract Summary

New IPC channels:

```text
blankseed:model:turn
blankseed:model:cancel
```

New provider-neutral result kind:

```text
model.turn.result
```

The turn result includes:

- `turnId`
- `adapter`
- `status`
- `startedAt` / `finishedAt` / `durationMs`
- `contextHash`
- normalized `messages`
- `contextPackage`
- structured `output` or structured `error`

The context package includes the current session, target identity, active module
summary, configuration identity and recent ordered events. The package is hashed
before the adapter result is returned.

## Secret Handling

WP-08 intentionally does not add secret storage. It rejects secret-shaped keys in
model turn payloads before adapter execution, including keys such as:

```text
apiKey
secret
token
password
credential
credentials
secrets
```

Runtime smoke verified that a payload containing `options.apiKey` is rejected
with `INVALID_REQUEST` and the blocked key path is reported without printing or
using the value.

## Commands

```powershell
npm run check
npm test
node scripts\runtime-wp08-smoke.mjs
```

## Automated Results

`npm run check`:

```text
Checked 26 project JavaScript files; baseline configuration is valid.
```

`npm test`:

```text
31 tests passed
```

`node scripts\runtime-wp08-smoke.mjs`:

```json
{
  "sessionId": "ses_d6b1cd6e-bde7-4cca-8cc2-6aa3ce07479c",
  "normal": {
    "requestId": "req_wp08_model_turn",
    "turnId": "turn_e07aca24-7c52-4df5-ba50-34037ba57a4c",
    "adapter": "local.manual",
    "status": "ok",
    "contextHash": "sha256:c9975d98a6f5e4c35deef9f83a935b9036f821fd12f493053d80ccfb5712587d"
  },
  "cancel": {
    "cancelled": 1
  },
  "cancelled": {
    "requestId": "req_wp08_model_slow",
    "turnId": "turn_af68291d-7f6f-4e71-b004-b7349cc66d46",
    "adapter": "local.manual",
    "status": "error",
    "error": {
      "code": "EXECUTION_CANCELLED",
      "message": "Model turn was cancelled."
    }
  },
  "secretRejected": {
    "code": "INVALID_REQUEST",
    "message": "Model turn payload must not include secrets or credentials.",
    "details": {
      "blockedKeys": ["options.apiKey"]
    }
  }
}
```

The event stream contained:

- `model.context.packaged`
- `model.turn.started`
- `model.turn.completed`
- `model.turn.cancel.requested`
- `model.turn.cancel.completed`
- `model.turn.failed`
- `ipc.request.failed` for the rejected secret-shaped payload

After the smoke run, no Electron process remained. Port `127.0.0.1:9333` only
showed closed `TIME_WAIT` sockets.

## Manual Verification Note

Launch command:

```powershell
node scripts\runtime-wp08-smoke.mjs
```

Tested URL:

```text
https://example.com/
```

Action performed:

```text
Run one normal model turn through local.manual, start a slow model turn, cancel
it, then submit a secret-shaped payload.
```

Expected result:

```text
Normal turn returns model.turn.result with status ok; slow turn returns
EXECUTION_CANCELLED after model.cancel; secret-shaped payload is rejected before
adapter execution.
```

Actual result:

```text
Normal turn returned status ok with a context hash; cancel reported cancelled=1
and the slow turn returned EXECUTION_CANCELLED; payload options.apiKey was
rejected with INVALID_REQUEST.
```

Relevant log/checkpoint path:

```text
starter/workspace/events/session-events.jsonl
```

## Residual Risk

- External API adapters still need a separate secret storage and redaction
  design.
- The local adapter proves the contract path, not model capability quality.
- Future adapters must preserve the same event and error envelope rather than
  returning provider-specific shapes directly to renderers.
