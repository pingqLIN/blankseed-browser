# Reference Sources

Checked on 2026-07-12. Prefer official primary documentation when implementation details conflict with memory or secondary material.

## Electron platform

- Electron introduction: https://www.electronjs.org/docs/latest/
- Electron releases: https://releases.electronjs.org/
- WebContentsView: https://www.electronjs.org/docs/latest/api/web-contents-view
- BaseWindow resource management: https://www.electronjs.org/docs/latest/api/base-window
- webContents: https://www.electronjs.org/docs/latest/api/web-contents
- Debugger / Chrome DevTools Protocol transport: https://www.electronjs.org/docs/latest/api/debugger
- utilityProcess: https://www.electronjs.org/docs/latest/api/utility-process
- parentPort: https://www.electronjs.org/docs/latest/api/parent-port
- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security

## Chromium instrumentation

- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/

## Version baseline

At package creation time, Electron 43.1.0 was listed as stable and bundled Chromium 150.0.7871.47 with Node.js 24.18.0. The starter pins Electron 43.1.0 for a reproducible initial baseline. Agents should not silently upgrade it during Phase 0.
