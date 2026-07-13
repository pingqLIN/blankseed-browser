# Research Charter v0.1

## Research question

How far can an AI model extend an initially minimal Chromium application when it can interact with a user, inspect the environment, execute code, observe real results, preserve working capabilities and revise its own tools over time?

## Hypothesis

A model given low-level, composable primitives will begin to create reusable abstractions and development infrastructure for itself, rather than repeatedly solving each user request as a one-off script.

Possible emergent behavior includes:

- semantic element locators;
- generic DOM inspection;
- shared logging and test helpers;
- generated UI frameworks;
- error diagnosis tools;
- page-specific adapters;
- module dependency management;
- persistent task memory;
- proposals to extend or restructure the Kernel.

## Independent variables

- model family and version;
- system prompt;
- available raw capabilities;
- conversation history length;
- user intervention style;
- permission profile;
- prior generated module library;
- target website complexity.

## Dependent variables

- turns to first verified success;
- failed execution count;
- autonomous correction rate;
- human correction count;
- module reuse rate;
- cross-site generalization;
- new abstractions created;
- regressions introduced;
- rollback frequency;
- percentage of model claims supported by execution evidence.

## Controlled conditions for initial experiments

- Windows local machine or disposable VM.
- Same Electron major/minor version during a trial series.
- Same initial module store state.
- Same target fixture pages for comparisons.
- Complete event and source logging enabled.
- One target browsing session per experiment.

## Meaning of “no boundary”

The research removes developer-authored semantic/task boundaries. It does not claim that software can operate outside operating-system, network, legal or physical constraints.

The environment should expose general primitives rather than predetermined functions. Access expansion should be a visible part of the user/AI interaction and experiment record.

## Research phases

### R0 — Manual model loop

Human copies messages between model and BlankSeed. This isolates Kernel behavior from fragile AI website integration.

### R1 — Model API loop

A provider-neutral model adapter performs structured tool turns.

### R2 — Runtime self-extension

AI creates reusable page and Node modules, tests them and composes them.

### R3 — Source self-modification

AI proposes and applies changes to the application source through Git-backed checkpoints and restart verification.

### R4 — Engine-boundary investigation

Only after repeatable evidence of Electron limitations, evaluate CEF or Chromium fork work.

## Required evidence

Each experiment must preserve:

- initial state identifier;
- model and prompt identifier;
- user messages;
- AI messages;
- generated source;
- exact execution inputs;
- stdout/stderr/errors;
- page URL and navigation state;
- module versions;
- permission/configuration changes;
- checkpoint before and after;
- user acceptance or rejection.

## Research integrity

- Distinguish model intention from verified system behavior.
- Record failures rather than editing them out of the transcript.
- Preserve unsuccessful generated code when it affected subsequent reasoning.
- Avoid manual fixes that are not represented in the experiment history.
- Mark any external human code contribution.
