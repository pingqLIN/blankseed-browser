# Acceptance and Stop Conditions

## Mandatory MVP acceptance conditions

### A. Application and target surface

- Application launches on Windows from a documented command.
- Target website renders in WebContentsView.
- Target renderer has Node integration disabled, context isolation enabled and sandbox enabled.
- Navigation, reload, back and forward work.
- WebContentsView resources are explicitly destroyed on window closure.

### B. Raw browser primitives

- AI/operator can request a page snapshot.
- Arbitrary JavaScript can execute in a dedicated isolated world.
- Raw CDP methods and parameters can be sent without a semantic command whitelist.
- Result and error payloads are structured and serializable.
- Navigation invalidates stale target state.

### C. Generated runtime

- AI-generated Node code executes outside the main process.
- stdout, stderr, return value, errors and exit state are captured.
- execution timeout is supported.
- operator can terminate the generated runtime.
- a crashed/hung generated runtime does not crash the application.

### D. Module evolution

- successful code can be committed as a module.
- committed modules are immutable by version.
- module source and metadata remain inspectable.
- modules can depend on other generated modules.
- activate, deactivate and rollback work.
- committed modules survive application restart.

### E. Evidence and recovery

- every execution has session/execution identity.
- source or command hash is recorded.
- events are ordered and timestamped.
- checkpoint can be created before a risky change.
- source self-modification is not accepted without Git-backed rollback.
- stop-all control terminates generated activity or clearly reports what could not be terminated.

### F. Research demonstration

- starts from no task-specific capability;
- user and AI discuss an underspecified need;
- AI generates and executes code;
- at least one failure is observed and corrected, unless the first attempt is demonstrably complete;
- user validates the result;
- code becomes a reusable module;
- module is reused in a later session;
- complete evidence bundle is retained.

## Non-goals that must not block acceptance

- polished consumer UI;
- multi-platform installer;
- Chrome Web Store compliance;
- multiple model providers;
- full browser tab parity;
- Chromium fork;
- formal security proof for arbitrary generated Node code.

## Stop conditions for an implementation attempt

Stop and produce a diagnostic report when:

1. The same failure repeats three times without new evidence or hypothesis.
2. A generated runtime or descendant process cannot be reliably terminated.
3. An implementation requires Node integration in arbitrary remote content.
4. Main process executes untrusted generated source directly.
5. Checkpoint or rollback data is incomplete before source self-modification.
6. The agent proposes a Chromium fork without a minimal Electron blocker reproduction.
7. Event logs omit generated source identity, target identity or error details.
8. A dependency introduces remote runtime code or non-auditable binary behavior without explicit decision.
9. Tests pass only by disabling the behavior under test.
10. The project drifts into a fixed task/action product.

## Stop report template

```markdown
# Stop Report

## Blocked objective

## Exact reproduction

## Expected result

## Actual result

## Evidence paths

## Attempts made

## Current hypothesis

## Why another retry is not justified

## Smallest decision required

## Safe rollback point
```
