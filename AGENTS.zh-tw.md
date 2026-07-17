# AGENTS.md 繁體中文對照版

> 本檔為 `AGENTS.md` 的繁體中文 companion；英文原檔為權威來源。

## 任務使命

建立一個實驗性 Chromium 應用程式，讓 AI 能透過與使用者互動，從底層原語逐步建立與演化能力。不得把本專案改造成固定功能的瀏覽器自動化產品。

## 語言與文件 companion

- 使用者文件與 UI 採用臺灣繁體中文。
- Source identifier 與 protocol field 維持英文；不常見英文術語首次出現時應補充中文說明。
- 除了原本就以繁中撰寫的文件，例如 `README_HANDOFF.md`，可發布技術文件以英文原檔為權威來源。
- 重要的入口、治理、架構、執行、驗收、協定、決策、驗證與操作文件，必須在相同目錄提供 `.zh-tw.md` companion。
- `KEY_DOCUMENTS.zh-tw.md` 是必要 companion 的索引；缺少必要 companion 時，`npm run check` 必須失敗。

## 不可違反的不變條件

1. 不設任務白名單，不得把模型限制為 click、type、summarize、translate 等預定商業動作。
2. 任意遠端頁面不得啟用 Node integration。
3. Page execution、CDP、process、file 與 source modification 等原始能力必須經過同一 broker 或 event pipeline，並保持可觀測。
4. 沒有命令、測試或可重現人工證據，就不得宣稱功能完成。
5. Generated module 與 source change 必須具有版本身分與 rollback 資料。
6. 架構變更必須記錄於 `09_DECISION_LOG.md`。
7. Generated code、input、output 與 error 必須可檢視，不得暗藏 generated behavior。
8. 本專案是本機研究應用，除非產品負責人改變目標，否則不以 Chrome Web Store 為優化方向。

## 目前範圍

- 初始平台為 Electron + Chromium，不是 Chrome Extension，也不是 Chromium fork。
- 平台優先順序為 Windows 10/11；Windows 研究循環穩定後才考慮 macOS/Linux。

## 開發規則

- 模組應小而可稽核，固定 Kernel 維持最小。
- Generated capability 放在專用 workspace/module store，不散落在 Kernel。
- Renderer IPC 只能透過明確的 preload/contextBridge API；必須驗證 sender 與 payload。
- 遠端內容維持 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- 使用 WebContentsView，擁有它的視窗關閉時必須明確銷毀其 webContents。
- 目前階段未需要時，不加入 framework 或 database；避免 remote CDN asset。

## 完成前必要檢查

```powershell
npm run check
npm test
```

UI/runtime 工作另須留下人工驗證紀錄：launch command、tested URL、action、expected result、actual result，以及相關 log/checkpoint path。

## 變更權限與停止條件

Agent 可修改所有 starter files。研究 charter、不變條件、permission philosophy 或 core scope 的變更，必須在 Decision Log 記錄問題、證據、替代方案、決策、後果與 rollback path。

下列情況必須停止目前實作路徑並回報證據：需要在遠端 renderer 啟用 Node.js、無法保證 rollback/checkpoint 完整、Electron 限制迫使改用 CEF/Chromium fork、同一架構失敗重複三次仍無新證據、generated process 無法可靠終止，或執行紀錄缺少重現所需的 code/environment identity。
