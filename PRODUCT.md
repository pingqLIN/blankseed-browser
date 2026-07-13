# PRODUCT.md

## Product name

**BlankSeed Browser** — working title.

## Product category

Experimental AI-native Chromium application / research platform.

## Problem

Most AI browser systems measure how well a model uses tools that developers already designed. Their action vocabulary, workflow model and permission structure predefine the result.

BlankSeed Browser asks a different question: can an AI, starting from low-level execution and observation primitives, build useful tools and gradually evolve the application through repeated interaction with a user?

## Primary user

A technical researcher or developer operating the application locally in a controlled environment.

## Primary use case

1. User opens a web target in BlankSeed Browser.
2. User discusses an underspecified need with an AI.
3. AI inspects available capabilities and environment.
4. AI writes and executes experimental code.
5. AI observes real output and errors.
6. User evaluates behavior and gives feedback.
7. AI revises and optionally commits a reusable module.
8. Later tasks reuse or refactor accumulated capabilities.

## Out of scope for v0.1

- General consumer release.
- Chrome Web Store publication.
- Full Chrome replacement.
- Password manager.
- Automatic payments or account administration.
- Cloud multi-user service.
- Direct Chromium source fork.
- Claims of secure sandboxing for arbitrary Node.js code.

## Success definition

The MVP succeeds when the platform can demonstrate at least one complete capability-evolution loop:

- an initially absent function is discussed;
- the model generates code;
- the code runs against a real page;
- failure data is returned;
- the model corrects it;
- the user validates the behavior;
- the result is saved as a versioned reusable module;
- the module is used again in a later session.

## Design character

- Inspectable rather than opaque.
- Experimental rather than polished.
- Open-ended rather than feature-driven.
- Recoverable rather than risk-free.
- Local-first rather than cloud-dependent.
