# BlankSeed Agent Runtime Reliability Upgrade v0.1 - Phase 3 Report

## Goal

Bound model-context pollution from large `node_execute`, CDP, and DOM snapshot observations without truncating durable Runtime evidence.

## Current-state finding

Action results were persisted in `run.json` under the existing 1 MiB per-result evidence cap and serialized into the next model conversation. The generic serializer allowed up to 12,000 characters per large result. The failed YOUTUBE-AOPass evidence contained individual action records above 30,000 characters, so repeated observations could materially increase later model latency.

## Minimal change

- Added `evolutionObservationMaxChars: 4000` to the validated Runtime defaults.
- `EvolutionRunManager` now applies deterministic structural compression only to oversized `node.execute`, `cdp.send`, and `page.snapshot` model feedback.
- Compressed feedback retains action identity, status, source/evidence hashes, error code/retryability, bounded keys/scalars, and metrics where present.
- Small observations remain unchanged.
- `evidence.actions` keeps the uncompressed result up to the pre-existing 1 MiB evidence cap; the new compression occurs only when constructing the model-facing tool message.
- ADR-023 records the evidence-preserving context boundary.

## Tests and acceptance

```text
node --test test/evolution-loop.test.mjs
tests 13, pass 13, fail 0

npm run check
Checked 59 project JavaScript files; baseline configuration is valid.
Checked 24 required Traditional Chinese document companions.

git diff --check
PASS
```

Regression coverage includes 50,000-character Node, CDP, and DOM observations at `<= 4000` model-facing characters; status, metrics, error code, retryability, and hashes remain present. Adversarial oversized metadata also remains within the hard cap. The integration fixture confirms the durable Node evidence still contains all 50,000 output characters because it is below the existing 1 MiB cap.

Phase 3 result: **PASS**.

## Rollback

Remove `evolutionObservationMaxChars`, restore the prior serializer call, and remove the Phase 3 serializer helpers/tests plus ADR-023. Durable evidence needs no migration because its schema and stored action result were not changed.
