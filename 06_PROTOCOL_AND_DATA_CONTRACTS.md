# Protocol and Data Contracts v0.1

These contracts define infrastructure messages, not a semantic task/action vocabulary.

## Common envelope

```json
{
  "protocol": "blankseed/0.1",
  "sessionId": "ses_...",
  "requestId": "req_...",
  "executionId": "exe_...",
  "kind": "page.execute",
  "createdAt": "2026-07-12T12:00:00.000Z",
  "payload": {}
}
```

Required properties vary by kind, but identifiers must remain stable through request, events and result.

## Page snapshot request

```json
{
  "kind": "page.snapshot",
  "payload": {
    "maxTextChars": 12000,
    "maxElements": 200
  }
}
```

## Page execution request

```json
{
  "kind": "page.execute",
  "payload": {
    "source": "return { title: document.title };",
    "worldId": 1001,
    "timeoutMs": 10000
  }
}
```

The source is wrapped in an async function by the broker and executed in an isolated world.

## CDP request

```json
{
  "kind": "cdp.send",
  "payload": {
    "method": "Page.getNavigationHistory",
    "params": {}
  }
}
```

No semantic method whitelist is required in Research Mode. The broker must still capture method, parameters, target identity, result/error and detach state.

## Broker execution cancellation

```json
{
  "kind": "execution.cancel",
  "payload": {
    "executionId": "exe_optional"
  }
}
```

Omitting `executionId` requests cancellation of every active page/CDP broker
execution. Cancellation terminates the broker result lifecycle with
`EXECUTION_CANCELLED`; page JavaScript already running inside Chromium may not
stop immediately. An unexpected CDP detach is recorded and the next independent
CDP command attempts one reattach. The failed command is not automatically
replayed because raw CDP methods may have side effects.

## Generated Node execution request

```json
{
  "kind": "node.execute",
  "payload": {
    "source": "return { platform: process.platform };",
    "cwd": "workspace/experiments/exe_...",
    "timeoutMs": 30000,
    "environment": {}
  }
}
```

This executes in a separate generated runtime, never in the main process.

## Result

```json
{
  "protocol": "blankseed/0.1",
  "sessionId": "ses_...",
  "requestId": "req_...",
  "executionId": "exe_...",
  "kind": "execution.result",
  "status": "ok",
  "startedAt": "...",
  "finishedAt": "...",
  "durationMs": 42,
  "sourceHash": "sha256:...",
  "result": {},
  "error": null
}
```

## Error

```json
{
  "code": "EXECUTION_TIMEOUT",
  "message": "Execution exceeded 10000 ms.",
  "details": {},
  "retryable": true
}
```

Suggested infrastructure error codes:

- INVALID_REQUEST
- DUPLICATE_REQUEST_ID
- UNKNOWN_SESSION
- TARGET_UNAVAILABLE
- TARGET_NAVIGATED
- SERIALIZATION_FAILED
- EXECUTION_TIMEOUT
- EXECUTION_CANCELLED
- PROCESS_EXITED
- PROCESS_KILL_FAILED
- CDP_ATTACH_FAILED
- CDP_DETACHED
- MODEL_ADAPTER_FAILED
- CHECKPOINT_FAILED
- MODULE_VERSION_CONFLICT
- RESTART_HEALTH_FAILED

## Provider-neutral model action loop

The main process may run a bounded model/action loop through
`evolution.run`. Provider adapters encode and decode their own wire format, but
the Kernel consumes normalized raw capability requests:

```json
{
  "actionId": "act_...",
  "toolCallId": "call_...",
  "name": "module_candidate_test",
  "arguments": "{\"candidateId\":\"cand_...\"}"
}
```

The fixed dispatcher exposes infrastructure families such as page snapshot and
execution, raw CDP, supervised Node execution, module lifecycle and checkpoint
creation. These names are not business-task verbs such as summarize, translate
or purchase. Unknown or malformed tool requests become structured
`INVALID_REQUEST` action results and are returned to the model; they are never
treated as arbitrary IPC channel names.

```json
{
  "protocol": "blankseed/0.1",
  "kind": "model.action.result",
  "actionId": "act_...",
  "toolCallId": "call_...",
  "name": "module_candidate_test",
  "actionKind": "module.candidate.test",
  "status": "error",
  "result": {
    "passed": false
  },
  "error": {
    "code": "SERIALIZATION_FAILED"
  },
  "sourceHash": "sha256:..."
}
```

Every run creates an `evo_*` identity and a pre-run checkpoint. Model turns,
actions, broker/runtime executions and module provenance carry the run, turn
and action correlation identities. A durable run manifest is stored at:

```text
workspace/evolution-runs/<evolutionRunId>/run.json
```

The `blankseed-evolution-run/0.1` manifest contains input messages, redacted
context/input hashes, normalized model outputs, action requests and results,
checkpoint identity, source hashes, metrics and terminal outcome. Run limits
(`maxTurns`, `maxActions`, per-turn timeout) are observable infrastructure
bounds and do not define allowable semantic capabilities.

The current local bounds also cap one normalized action result at 1 MiB and one
run manifest at 16 MiB. An oversized action result becomes a structured error
with its size and hash. If a run reaches the manifest budget, dispatch stops and
the last complete manifest is closed with an evidence-truncation error instead
of writing an unbounded or invalid artifact.

The loopback OpenAI-compatible encoder transmits the packaged operational
context as a system message, accepts tool-only assistant messages with null
content, sends raw function definitions without Authorization and preserves
`tool_call_id` on tool results. Hosted credentials and non-loopback transports
remain outside this contract.

## Module manifest

```json
{
  "schema": "blankseed-module/0.1",
  "id": "generated.example",
  "version": "0.1.0",
  "description": "Generated capability",
  "entry": "index.mjs",
  "runtime": "node",
  "createdAt": "...",
  "sourceHash": "sha256:...",
  "provenance": {
    "sessionId": "ses_...",
    "executionIds": ["exe_..."],
    "checkpointId": "chk_...",
    "model": null
  },
  "dependencies": {},
  "tests": [],
  "status": "candidate"
}
```

Runtime values may later include:

- `page`
- `node`
- `hybrid`
- `ui`

## Event record

Stored as one JSON object per line:

```json
{
  "eventId": "evt_...",
  "sequence": 17,
  "sessionId": "ses_...",
  "requestId": "req_...",
  "executionId": "exe_...",
  "evolutionRunId": "evo_...",
  "turnId": "turn_...",
  "actionId": "act_...",
  "type": "page.execution.completed",
  "timestamp": "...",
  "data": {}
}
```

## Persistence de-identification boundary

Before the Event Store appends data, before a supervised execution writes an
experiment artifact, and before an evolution run writes run.json, the runtime
creates a redacted clone. The live tool result, in-memory execution envelope,
and model observation remain unchanged; the boundary applies only to durable
evidence.

For this boundary, every non-local HTTP(S) target is treated as sensitive by
default. The pipeline replaces its host, path, query, and bare-host references
with a fixed marker. If an object contains such a target, page-content fields
such as title, text, DOM/HTML, accessible names, labels, messages, and nested
element names are replaced with a page-content marker. It never stores a
reversible target hash or the original target in redaction metadata.

Loopback and fixture addresses remain inspectable: localhost, IPv4/IPv6
loopback, *.localhost, *.test, *.invalid, and
example.com/example.net/example.org. When redaction occurs, an object artifact
receives persistenceRedaction counts. A supervised execution also writes an
inspectable redaction.json receipt beside its experiment files; the receipt
contains only file names and aggregate counts.
If Event Store data cannot be inspected safely, it writes a metadata-only
failed_closed record instead of the original value.
If an experiment source file is redacted, its sourceHash still identifies the
executed original and the receipt makes clear that the retained source file is
an evidence copy rather than a hash-reconstructible executable.

This boundary does not rewrite generated Module candidate source or committed
Module artifacts because changing executable source would invalidate its
source hash and alter the capability under review. A candidate-source admission
policy is a separate future decision, not an implicit side effect of evidence
redaction.

## Checkpoint manifest

```json
{
  "schema": "blankseed-checkpoint/0.1",
  "id": "chk_...",
  "label": "before module activation",
  "createdAt": "...",
  "appVersion": "0.1.0",
  "target": {
    "url": "https://example.com/"
  },
  "configurationHash": "sha256:...",
  "moduleVersions": {},
  "eventSequence": 17,
  "git": null
}
```

## Limits

Limits should be configuration values and logged, not hidden behavior:

- IPC payload size;
- page source size;
- execution timeout;
- stdout/stderr retained bytes;
- event file rotation;
- snapshot text/element limits;
- evolution model-turn and action limits.
- evolution action-result and run-evidence byte budgets.

These infrastructure limits do not define what semantic functions may be created.
