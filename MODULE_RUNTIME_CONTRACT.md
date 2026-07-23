# BlankSeed Module Runtime Contract v1.2

## Status and authority

This document defines the authoritative Module API v1.2 contract for generated Node modules executed by the BlankSeed supervised utility runtime. It extends the existing direct-return behavior without changing the Module Store lifecycle or the `blankseed/0.1` execution envelope.

## Goals

- Preserve existing source that returns a value directly.
- Support modern CommonJS modules that export `execute(context)`.
- Support legacy CommonJS modules that export `evaluate(observation, environment)`.
- Reject source that provides no usable entry point instead of silently converting an implicit `undefined` to `null`.
- Keep results JSON-serializable and observable through the existing Process Supervisor and event pipeline.

## Source evaluation environment

The runtime evaluates source as an asynchronous function with these parameters:

```javascript
environment, input, require, process, module, exports, __dirname, __filename
```

`module` starts as `{ exports: {} }`, and `exports` initially aliases `module.exports`. Existing security and supervision boundaries remain unchanged: execution occurs in the supervised Electron `utilityProcess`; this contract does not claim that Node execution is a security sandbox.

## Invocation context

For exported entry points, the runtime creates this context:

```javascript
{
  environment, // caller-supplied invocation environment; defaults to {}
  input,       // supervisor input; defaults to {}
  observation // resolved observation described below
}
```

Observation resolution is deterministic:

1. `input.observation`, when `input` owns that property;
2. otherwise `environment.observation`, when `environment` owns that property;
3. otherwise the entire `environment` object.

This fallback preserves callers that historically supplied a normalized observation directly as the Module invocation environment.

## Supported contracts

### Contract A — direct return

```javascript
return { status: 'ok' };
```

The direct value is used only when no supported exported function is present.

### Contract B — modern module

```javascript
module.exports.execute = async (context) => ({
  action: 'test',
  observation: context.observation
});
```

The runtime awaits `execute(context)`.

### Contract C — legacy module

```javascript
module.exports.evaluate = function (observation, environment) {
  return { action: 'legacy' };
};
```

The runtime awaits `evaluate(context.observation, context.environment)`. A synchronous or asynchronous function is valid.

## Entry-point precedence

After top-level source evaluation, the runtime selects exactly one result source:

```text
module.exports.execute()
  > module.exports.evaluate()
  > direct return value
```

Only callable exported entry points participate in selection. This precedence permits a module to retain `evaluate` as an internal compatibility function while exposing `execute` as its formal entry point.

## Result and error rules

- The selected entry point is awaited.
- An explicit `null` is a valid result.
- An implicit or explicit `undefined` final result is invalid.
- The final result must be JSON-serializable under the existing normalization step.
- A module with no callable `execute`, no callable `evaluate`, and no direct return fails with the structured error code `MODULE_CONTRACT_INVALID`.
- A selected entry point that resolves to `undefined` also fails with `MODULE_CONTRACT_INVALID`.
- Serialization failures continue to use `SERIALIZATION_FAILED`.
- Runtime exceptions continue through the existing generated-runtime error envelope.

An invalid module therefore produces an execution envelope with `status: "error"`, `result: null`, and a populated structured `error`; it never reports a successful silent `null` caused by implicit `undefined`.

## Versioning and governance

Module API v1.1 changes runtime interpretation, not committed module immutability. Existing committed source is never edited in place. Module changes continue through:

```text
candidate -> test -> commit -> activate
```

Rollback changes only the active version mapping. A committed corrective version remains in immutable history.

Corrective versions may add optional `parentVersion` and `migrationReason` fields to the Module Store manifest. The store validates and preserves both fields throughout candidate, test, and commit states. Existing manifests without these fields remain valid.

## Migration guidance

New modules should export `execute(context)`. A legacy module may migrate without changing its detection or action logic by adding a thin adapter:

```javascript
module.exports.execute = async (context) => {
  return module.exports.evaluate(
    context.observation,
    context.environment
  );
};
```

The source must ensure that `module.exports.evaluate` still refers to the intended legacy function when this adapter runs.

## Page test bridge

A Node module may generate page-local behavior, but it must not execute that behavior in the utility runtime. To prove a generated capability against a remote page, a tested candidate may return this `pageTest` descriptor from its supported entry point:

```javascript
module.exports.execute = async () => ({
  pageTest: {
    installSource: '/* returns { ok: true } after installation */',
    verifySource: '/* returns { ok: true } only when the intended behavior is present */',
    uninstallSource: '/* returns { ok: true } after restoration */',
    rollbackVerifySource: '/* returns { ok: true } only when restoration is confirmed */'
  }
});
```

`module_candidate_page_test` accepts only a tested candidate identifier. The Module Store re-evaluates that stored source in the supervised utility runtime, validates the four-string descriptor, and the dispatcher sends each resulting script through the existing isolated-world page broker in this order: install, verify, uninstall, rollback verify. The model never supplies a free-standing page script to this operation.

Every phase must return a JSON-serializable object containing `ok: true`. The broker records the candidate ID, stored source hash, plan execution ID, target identity, each phase execution ID, and failure state. A phase failure still runs uninstall and rollback verification where the supplied scripts can do so, then reports a structured failed action. This bridge does not grant Node to remote content, does not make a candidate committed or active, and does not replace the existing explicit confirmation gates for commit and activation.

## Acceptance boundary

Synthetic observations may prove contract dispatch and result shape in automated tests. They do not prove live website behavior, advertisement availability, or end-to-end acceptance. Live validation must use an actual page observation and retain the resulting page-test action evidence, including the successful rollback verification.
