# WP-07 Manual AI Experiment Report

Date: 2026-07-13 Asia/Taipei

## Scope

Ran a manual AI evolution experiment using the current BlankSeed primitives and
console. The experiment created one reusable generated module from a page
snapshot, preserved a failed first attempt, corrected the source, committed the
module and reused it after application restart.

Model/source label:

```text
manual-copy-codex
```

This report does not claim provider-neutral model automation. That remains
WP-08.

## Seed Prompt

```text
You are operating BlankSeed Browser through low-level primitives.

Current capabilities:
- inspect the target page;
- execute isolated page JavaScript;
- send raw CDP commands;
- run generated Node.js source outside the main process;
- create, test, commit, activate, invoke and roll back generated modules;
- observe ordered events and checkpoints.

Do not assume a fixed browser task API. If a reusable abstraction helps, create
it as a module with inspectable source and provenance. Preserve failures and use
execution evidence before claiming success.

Task:
The user wants a reusable way to summarize text captured from a page snapshot.
Create the smallest module that can accept text and title as environment input,
return basic counts and a short summary, then verify it on the current target
page and reuse it in a later session.
```

## Initial State

Target page:

```text
https://example.com/
```

Initial task-specific module state:

```text
moduleId: generated.wp07.summary.1783927621783
active before experiment: null
```

Checkpoint before experiment:

```text
chk_b3eebd36-b69d-4487-a4fb-657b8c47561f
```

Page snapshot:

```json
{
  "executionId": "exe_972a7119-3736-47b7-a157-74fd7f06f4dd",
  "title": "Example Domain",
  "url": "https://example.com/",
  "textLength": 129
}
```

## Transcript

### Turn 1 — User

```text
I want a reusable capability that can summarize text captured from the current
page snapshot. Keep it general; it should accept text/title input rather than
hard-code this page.
```

### Turn 2 — AI

```text
I will create a node module that counts words and returns a short sample. The
first version will preserve a numeric word count directly from the runtime.
```

Generated source attempt 1:

```js
const text = environment.text || 'Example Domain has one paragraph.';
const words = text.trim().split(/\s+/).filter(Boolean);
return {
  title: environment.title || 'untitled',
  wordCount: BigInt(words.length),
  sample: words.slice(0, 8)
};
```

Candidate:

```text
cand_3c103d8d-1904-4a06-ba9a-1f22aa8d013c
sourceHash: sha256:e5fbbfb81becf22cc53dd0c6b91c15516a82c1b59e41aa831a188ba29e2bda8a
```

### Turn 3 — System Evidence

The first candidate failed during `module.test`.

```json
{
  "requestId": "req_wp07_test_fail",
  "executionId": "exe_f95e1db6-8811-4b80-b33a-9892380bada3",
  "requestKind": "module.test",
  "status": "error",
  "error": {
    "code": "SERIALIZATION_FAILED",
    "message": "Generated runtime result is not JSON serializable.",
    "details": {
      "cause": {
        "message": "Do not know how to serialize a BigInt"
      }
    }
  }
}
```

### Turn 4 — AI

```text
The module returned BigInt, which cannot be serialized through the execution
envelope. I will return ordinary numbers and add sentence count plus a short
summary.
```

Corrected source:

```js
const text = String(environment.text || 'Example Domain has one paragraph.');
const words = text.trim().split(/\s+/).filter(Boolean);
const sentences = text.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean);
return {
  title: environment.title || 'untitled',
  charCount: text.length,
  wordCount: words.length,
  sentenceCount: sentences.length,
  firstWords: words.slice(0, 12),
  summary: sentences.slice(0, 2).join('. ')
};
```

Candidate:

```text
cand_802b8f62-f764-4dc9-8c29-4557851b9da9
sourceHash: sha256:f08dbbe5ba693c37e1d36e512f133bfa048b48aa8a67fbec1d387456b83e87d5
```

### Turn 5 — System Evidence

Corrected candidate test:

```json
{
  "requestId": "req_wp07_test_fix",
  "executionId": "exe_387e4755-0ca3-4534-b996-5cf45644c45b",
  "requestKind": "module.test",
  "status": "ok",
  "result": {
    "title": "untitled",
    "charCount": 33,
    "wordCount": 5,
    "sentenceCount": 1,
    "summary": "Example Domain has one paragraph"
  }
}
```

Commit and activation:

```json
{
  "moduleId": "generated.wp07.summary.1783927621783",
  "version": "0.1.0",
  "status": "committed",
  "activated": true
}
```

Verified invocation on the current page snapshot:

```json
{
  "requestId": "req_wp07_invoke_verified",
  "executionId": "exe_d624b4ef-0b3f-4d95-8e59-1eb89b6c6313",
  "requestKind": "module.invoke",
  "status": "ok",
  "result": {
    "title": "Example Domain",
    "charCount": 129,
    "wordCount": 19,
    "sentenceCount": 3,
    "summary": "Example Domain\n\nThis domain is for use in documentation examples without needing permission. Avoid use in operations"
  }
}
```

### Turn 6 — User Evaluation

```text
Accepted for the WP-07 demonstration: the module corrected a real failure,
committed as a reusable capability and returned structured summary evidence
from the page snapshot.
```

### Turn 7 — Reuse Evidence

The application was restarted and the same module was invoked in a later
session.

```json
{
  "sessionId": "ses_bea2adee-6142-420b-8017-6582be645871",
  "activeVersion": "0.1.0",
  "requestId": "req_wp07_reuse_invoke",
  "executionId": "exe_cd040539-51fe-452d-a7bd-0150dca61dc6",
  "requestKind": "module.invoke",
  "status": "ok",
  "result": {
    "title": "Reuse sample",
    "charCount": 87,
    "wordCount": 13,
    "sentenceCount": 2,
    "summary": "A later session can reuse the same generated module. Evidence should stay reproducible"
  }
}
```

## Evidence Paths

Committed module:

```text
workspace/modules/generated.wp07.summary.1783927621783/versions/0.1.0/
```

Failed attempt artifact:

```text
workspace/modules/.candidates/cand_3c103d8d-1904-4a06-ba9a-1f22aa8d013c/
workspace/experiments/exe_f95e1db6-8811-4b80-b33a-9892380bada3/
```

Corrected attempt artifact:

```text
workspace/modules/.candidates/cand_802b8f62-f764-4dc9-8c29-4557851b9da9/
workspace/experiments/exe_387e4755-0ca3-4534-b996-5cf45644c45b/
```

Verified invocation artifacts:

```text
workspace/experiments/exe_d624b4ef-0b3f-4d95-8e59-1eb89b6c6313/
workspace/experiments/exe_cd040539-51fe-452d-a7bd-0150dca61dc6/
```

Checkpoint:

```text
C:\Users\miles\AppData\Roaming\blankseed-browser-starter\blankseed-data\checkpoints\chk_b3eebd36-b69d-4487-a4fb-657b8c47561f.json
```

Event chain included:

```text
checkpoint.created
page.snapshot.started
page.snapshot.completed
module.candidate.created
module.candidate.tested passed=false
node.execution.failed SERIALIZATION_FAILED
module.candidate.created
module.candidate.tested passed=true
module.version.committed
module.activated
module.invocation.completed
```

## Metrics

```text
turns to first verified success: 5
failed execution count: 1
autonomous correction count: 1
human correction count: 0
rollback count: 0
module reuse count: 1
module reuse rate for this experiment: 1/1
new abstractions created: 1 generated text-summary module
percentage of success claims backed by execution evidence: 100%
```

## Commands and Results

```powershell
npm run check
```

Result:

```text
Checked 23 project JavaScript files; baseline configuration is valid.
```

```powershell
npm test
```

Result:

```text
tests 27
pass 27
fail 0
```

Runtime experiment:

```powershell
node scripts\runtime-wp07-manual-experiment.mjs
```

Result:

```text
exit code 0
```

After shutdown delay, no `electron` process remained. Port `127.0.0.1:9333`
only showed `TIME_WAIT` entries and no listener.

## Known Limits

- This was a manual-copy proxy experiment using Codex as the model/operator, not
  a provider-neutral automated model loop.
- Environment values are redacted in events, so this report records the
  non-sensitive page title and summary results rather than raw hidden input
  payloads.
- The module summarizes text only; it does not yet inspect pages directly.

## Next Smallest Executable Step

Begin WP-08 / Model adapter interface:

1. Define provider-neutral model turn envelopes.
2. Package context, events, module state and execution results.
3. Add cancellation and timeout handling.
4. Design secret handling before adding any external provider.
