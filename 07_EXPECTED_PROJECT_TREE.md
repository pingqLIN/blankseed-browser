# Expected Project Tree

The provided starter is intentionally smaller than the eventual tree.

```text
blankseed-browser/
├─ AGENTS.md
├─ PRODUCT.md
├─ package.json
├─ package-lock.json
├─ config/
│  ├─ defaults.json
│  └─ local.json                 # ignored
├─ src/
│  ├─ main/
│  │  ├─ main.cjs
│  │  ├─ window-manager.cjs
│  │  ├─ target-view.cjs
│  │  ├─ ipc-router.cjs
│  │  ├─ capability-broker.cjs
│  │  ├─ event-store.cjs
│  │  ├─ checkpoint-store.cjs
│  │  ├─ process-supervisor.cjs
│  │  ├─ module-store.cjs
│  │  └─ restart-coordinator.cjs
│  ├─ preload/
│  │  └─ preload.cjs
│  ├─ renderer/
│  │  ├─ index.html
│  │  ├─ app.js
│  │  └─ styles.css
│  ├─ utility/
│  │  ├─ agent-runtime.cjs
│  │  └─ module-runtime.cjs
│  └─ shared/
│     ├─ contracts.js
│     ├─ validation.js
│     └─ errors.js
├─ workspace/
│  ├─ modules/
│  ├─ libraries/
│  ├─ experiments/
│  ├─ fixtures/
│  ├─ generated-ui/
│  └─ state/
├─ data/
│  ├─ events/
│  ├─ checkpoints/
│  └─ reports/
├─ scripts/
│  ├─ check-project.mjs
│  └─ health-probe.mjs
├─ test/
│  ├─ unit/
│  ├─ integration/
│  └─ fixtures/
└─ reports/
```

## Placement rules

- Fixed infrastructure belongs under `src/`.
- AI-generated reusable capabilities belong under `workspace/modules/`.
- One-off attempts belong under `workspace/experiments/`.
- Generated libraries shared by modules belong under `workspace/libraries/`.
- Runtime data belongs under the application userData path, not source control, once implemented.
- Human/agent reports belong under `reports/`.
- Do not put generated capability code into `src/main/` merely because it needs broad access; expose a broker primitive instead.
