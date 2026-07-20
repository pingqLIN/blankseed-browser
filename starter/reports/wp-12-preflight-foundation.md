# WP-12A Preflight and Evidence Foundation Report

Date: 2026-07-18 Asia/Taipei

## Goal and decision

Implement the bounded WP-12A foundation before any real local-model trial:
fail-closed environment preflight, fixed and hashed evaluation fixtures, an
evaluation-sidecar validator, and durable audit output.

The implementation result is `FOUNDATION VERIFIED`. The experiment result is
still `PRE-FLIGHT HOLD / NOT RUN`: no WP-12 model turn or counted trial ran.

## Implemented boundary

- `wp12:preflight` reads an operator-owned input from the Git-ignored
  `workspace/wp12-preflight/` area and writes a redacted structured audit record.
- The validator checks the required branch/full commit/clean-worktree state and
  current evidence for all four mandatory project commands.
- Model and fixture endpoints must use HTTP(S) with literal `127.0.0.1` or
  `::1`; user info, query strings, fragments and `localhost` are rejected.
- Exact model and server identity are mandatory. Placeholder/`UNKNOWN` values
  and secret-shaped configuration keys fail closed.
- Trial workspace and user-data paths must be fresh, distinct and inside their
  dedicated owned roots. Endpoint ports must be unique, non-privileged and
  correlated with one launch ownership nonce.
- OS/network non-loopback denial requires a separate external attestation. The
  preflight does not configure or weaken a firewall.
- Eight fixed B1/B2/I1/R1/prompt/canary fixtures have tracked SHA-256 hashes and
  explicit trust labels. The canary is synthetic and non-secret.
- `validate:wp12:evaluation` validates the sidecar location and schema but
  deliberately does not convert schema validity into a trial pass.
- The preflight records Kernel, Electron, OS, tool-catalog, limits and fixture
  identities. It never launches Electron, contacts the model, dispatches a raw
  tool, or starts a trial.

The example configuration and egress-attestation files are templates only.
Copying or editing a template is not evidence that an OS egress control exists.

## Commands and results

Focused validator tests:

```powershell
node --test test/wp12-preflight.test.mjs
```

Result: 8 passed, 0 failed.

Static, companion and full test verification:

```powershell
npm run check
npm test
```

Current result:

```text
Checked 37 project JavaScript files; baseline configuration is valid.
Checked 20 required Traditional Chinese document companions.
51 tests passed, 0 failed.
```

Fail-closed foundation verification:

```powershell
npm run verify:wp12:preflight
```

The command first runs the current static/unit verification and then exercises
the preflight without treating the expected HOLD as a harness failure. The
durable audit path is:

```text
starter/workspace/wp12-preflight/preflight.json
```

## Recorded preflight result

The following audit was captured on 2026-07-18 while the foundation was being
implemented. It is historical evidence, not a claim about the repository's
current `HEAD` or worktree state:

```text
status: PRE-FLIGHT HOLD / NOT RUN
trialStarted: false
branch: main (protocol requires codex/wp12-real-model-evaluation)
commit: b57ad0e6c7787850e4c78910a7122a5f99c3cebf
```

The recorded blockers were expected and evidence-preserving:

- the worktree is currently on `main`, not the protocol-required branch, and is
  not clean;
- `workspace/wp12-preflight/input.json` is intentionally absent;
- exact model/server identity and fixture endpoint ownership are not supplied;
- no external OS/network egress-denial attestation is supplied.

Both `npm run verify:runtime` and `npm run verify:wp11` passed in this task. A
strict preflight was then invoked with all four current check results; it exited
2 because the environment/input conditions above still correctly hold.

None of those blockers was inferred away. No real WP-12 trial was started.

## Operator sequence for a future authorized trial

1. Use a disposable VM or dedicated OS account and establish an independently
   observable non-loopback egress deny control.
2. Copy `config/wp12-preflight.example.json` to the ignored
   `workspace/wp12-preflight/input.json`, replace every placeholder with exact
   non-secret values, and provide the external attestation in the ignored area.
3. On the clean recorded branch/commit, run `npm run wp12:preflight:full`. It
   runs both required Windows smokes and carries all four current check results
   into the strict preflight.
4. Continue only if `wp12:preflight` returns `READY`. Any HOLD means no model
   turn and no counted trial.
5. Validate each produced sidecar with:

```powershell
npm run validate:wp12:evaluation -- workspace/evolution-runs/<evolutionRunId>/wp12-evaluation.json
```

## Manual verification note

- Launch command: `node scripts/wp12-preflight.mjs --allow-hold --verified-check npm-run-check --verified-check npm-test`
- Tested URL: none; the preflight performs no network request.
- Action: evaluate the current repository, fixture and environment evidence.
- Expected: missing exact model/egress evidence returns HOLD and does not start a
  trial.
- Actual: `PRE-FLIGHT HOLD / NOT RUN`, `trialStarted: false`, exit 0 only because
  the verification-only `--allow-hold` flag was explicit.
- Relevant evidence: ignored
  `starter/workspace/wp12-preflight/preflight.json` and this durable report.

## Risk, rollback and residual boundary

- Risk level: L2 reversible local code/document changes. Existing runtime
  verification remains L3 when an operator invokes it.
- Historical foundation rollback baseline: commit
  `b57ad0e6c7787850e4c78910a7122a5f99c3cebf`;
  review/remove only the files listed by the task diff. No system/network
  configuration was changed.
- This foundation proves the validator behavior, not model quality, injection
  robustness, egress enforcement or WP-12 pass criteria.
- The external attestation is schema-checked evidence supplied by the operator;
  the application does not claim to independently inspect every OS firewall or
  hypervisor rule.
