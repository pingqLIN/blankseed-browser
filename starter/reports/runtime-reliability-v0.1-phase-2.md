# BlankSeed Agent Runtime Reliability Upgrade v0.1 - Phase 2 Report

## Goal

Recover a broker-owned CDP connection from `No session with given id` without introducing a generic raw-command replay policy.

## Current-state finding

The broker already handled an unexpected debugger detach by reattaching for the next independent command. It did not classify an invalid-session rejection or recover the command that encountered it. ADR-008 explicitly prohibited generic replay because other failures cannot prove whether Chromium already applied a stateful command.

## Minimal change

- `src/main/capability-broker.cjs`
  - Matches only `No session with given id` in the error/cause message.
  - Records `cdp.session.invalid` with `SESSION_INVALID`.
  - Refreshes the debugger attachment and retries the rejected command once.
  - Records `RECOVERED` on success.
  - Returns retryable `CDP_SESSION_INVALID` with both causes and `attempts: 2` if recovery fails; no third attempt is possible.
  - Fails closed without detach or replay when the debugger attachment was not created by this broker instance.
- `src/shared/contracts.cjs`
  - Adds the structured `CDP_SESSION_INVALID` error code.
- `test/capability-broker.test.mjs`
  - Covers recover-on-second-attempt, clean failure after two attempts, no replay for unrelated errors, and no detach/replay for an externally owned attachment.
- `09_DECISION_LOG.md` and `09_DECISION_LOG.zh-tw.md`
  - ADR-022 records this exact invalid-session exception to ADR-008.

No target reload, new Module API, permission change, or generic CDP retry was added.

## Acceptance

```text
node --test test/capability-broker.test.mjs
tests 12, pass 12, fail 0

git diff --check
PASS
```

Phase 2 result: **PASS**.

## Rollback

Remove the invalid-session branch and `CDP_SESSION_INVALID` code, remove the four regression tests, and revert ADR-022. ADR-008 next-command recovery remains intact.
