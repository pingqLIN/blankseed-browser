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
- CHECKPOINT_FAILED
- MODULE_VERSION_CONFLICT
- RESTART_HEALTH_FAILED

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
  "executionId": "exe_...",
  "type": "page.execution.completed",
  "timestamp": "...",
  "data": {}
}
```

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
- snapshot text/element limits.

These infrastructure limits do not define what semantic functions may be created.
