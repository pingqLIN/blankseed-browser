# 架構規格 v0.1

> 本檔為 `02_ARCHITECTURE_SPECIFICATION_v0.1.md` 的繁體中文 companion；英文原檔為權威來源。

## 1. 平台選擇

第一個實作層使用 Electron：Electron 內嵌 Chromium 與 Node.js；WebContentsView 提供 target web content；webContents 提供 isolated JavaScript execution；webContents.debugger 提供 CDP transport；utilityProcess 提供獨立 Node.js process 與 message channel。

Electron 是實驗平台選擇，不是永久要求。只有具體 engine-level blocker 被證明後，才評估 CEF 或 Chromium fork。

## 2. Trust 與 process topology

```text
┌─────────────────────────────────────────────────────────┐
│ Main Process — Fixed Kernel                             │
│ window/view lifecycle, IPC, broker, log, checkpoint     │
├───────────────────┬───────────────────┬─────────────────┤
│ Trusted UI        │ Target Renderer   │ Utility Runtime │
│ local app files   │ remote websites   │ generated Node  │
│ sandboxed renderer│ sandboxed         │ separate process│
└───────────────────┴───────────────────┴─────────────────┘
                 │
                 ▼
          Generated Workspace
          modules / tests / state
```

### Main Process

負責 window/view 建立與銷毀、target identity、trusted renderer IPC validation、raw capability broker、execution events、checkpoint、utility/child process lifecycle，並確保 generated runtime 不在 main process 執行。

### Trusted UI Renderer

顯示 browser controls、environment/result、generated code 與 stop/recovery controls。不得直接取得 Node.js，只能透過 contextBridge 溝通。

### Target Renderer

負責任意網站呈現、隔離 browsing session、dedicated isolated world page code、navigation/page events，且永遠不得取得 Node integration。

```js
{
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true
}
```

### Utility Runtime

在獨立 disposable process 執行 AI-generated Node.js module，傳出 stdout/stderr/result/error，接受 stop signal；不得宣稱為 secure sandbox。

## 3. Fixed Kernel 與 generated layer

Kernel 只保留讓 generated behavior 可檢視、可復原的基礎設施：execution broker、target view manager、event store、module loader、process supervisor、checkpoint manager、configuration loader、model adapter interface 與 restart coordinator。

AI-generated artifacts 放在：

```text
workspace/
├─ modules/
├─ libraries/
├─ experiments/
├─ fixtures/
├─ generated-ui/
└─ state/
```

AI 可在此層建立任何 semantic capability。

## 4. Raw capability families

- Browser：target metadata、navigation、snapshot/source、isolated JavaScript、raw CDP，未來再加入 screenshot 與 multi-target。
- Filesystem：workspace read/write/list/stat、atomic write、hash/version metadata；host filesystem profile 延後。
- Process：start、stdout/stderr、input、process-tree termination、timeout，以及 executable/args/cwd/environment difference 記錄。
- Module：candidate、execute/test/commit、activate/deactivate、dependency、provenance、rollback。
- Application source：待 runtime modules 穩定後，才允許 Git checkpoint、source modification、checks/tests、candidate restart、health probe 與 accept/restore。

## 5. IPC 架構

Renderer-to-main call 必須使用具名 IPC channel 與 structured-clone-compatible payload。不得暴露 generic `window.blankseed.invoke(channel, ...args)`。應按 capability family 提供窄 transport method，而 source、CDP method/params、module code 仍保持開放資料。

必須驗證 sender、request identifier uniqueness、payload type/size、target/session identity 與 execution lifecycle state。

## 6. Execution identity

每次 execution 應包含 `sessionId`、`executionId`、`kind`、source/command hash、`targetId`、開始／完成時間、result/error，以及適用的 checkpoint/module reference。

## 7. Event store

MVP 可使用 JSON Lines；只有查詢或 concurrency 證明需要時才導入 SQLite。事件至少涵蓋 app lifecycle、target navigation/console、page/CDP lifecycle、process lifecycle、module lifecycle、checkpoint/configuration，以及後續 model turn。

## 8. Checkpoint model

Phase 0 checkpoint 保存 configuration、active URL/module、event tail 與 human label。後續 Git checkpoint 再加入 repository/workspace/application source identity、test result 與 runtime health。

## 9. Model integration boundary

Phase 0/1 不需要 model SDK。後續 adapter 應實作 common interface；Kernel 不得假設 OpenAI、Gemini、Claude 或 local model 的原生 message format。

## 10. 演化路徑

1. Electron page-control scaffold。
2. Deterministic execution protocol。
3. Utility runtime 與 process supervision。
4. Versioned module store。
5. Manual AI loop demonstration。
6. Provider-neutral model adapter。
7. Git-backed source modification。
8. 依證據決定是否需要 CEF／Chromium fork。
