# BlankSeed Browser — Development Handoff v0.1.0

這是一份交付給 Codex、其他 coding agents（程式開發代理）或人工開發者的基礎資料包。

## 專案一句話

建立一個使用 Electron／Chromium、但不依附 Google Chrome 或 Chrome Extension 的實驗性瀏覽器環境；只提供極小的底層原語，讓 AI 在與使用者長期互動中，自行建立、測試、保存、組合與重構新能力。

## 研究重點

本專案不是一般瀏覽器自動化工具，也不是預先定義功能的 AI Agent。

主要觀察問題是：

> 當模型只有環境觀察、頁面控制、程式執行、檔案／程序能力、版本保存與使用者對話時，它最後會把空白環境發展成什麼？

## 重要邊界定義

「無邊界」在本專案中代表：

- 不設任務類型白名單。
- 不限制 AI 只能使用 click、type、scroll 等預製 action。
- 不預先決定最終產品形態。
- 允許 AI 生成新模組、工具、UI、測試與工作流。
- 允許 AI 建議修改 Kernel，並在後續階段實作 self-modification（自我修改）。

它不代表：

- 能繞過作業系統或網站實際權限。
- 將遠端網站 renderer 直接賦予 Node.js 權限。
- 取消執行紀錄、停止與復原能力。
- 對外公開發行一個無法解釋行為的成品。

## 建議閱讀順序

繁中入口請先看 `KEY_DOCUMENTS.zh-tw.md`；英文技術原檔維持權威來源。

1. `00_EXTERNAL_AGENT_MASTER_PROMPT.md`／`00_EXTERNAL_AGENT_MASTER_PROMPT.zh-tw.md`
2. `01_RESEARCH_CHARTER.md`／`01_RESEARCH_CHARTER.zh-tw.md`
3. `02_ARCHITECTURE_SPECIFICATION_v0.1.md`／`02_ARCHITECTURE_SPECIFICATION_v0.1.zh-tw.md`
4. `03_EXECUTION_PLAN_v0.1.md`／`03_EXECUTION_PLAN_v0.1.zh-tw.md`
5. `04_ACCEPTANCE_AND_STOP_CONDITIONS.md`／`04_ACCEPTANCE_AND_STOP_CONDITIONS.zh-tw.md`
6. `05_EXPERIMENT_GOVERNANCE_AND_RECOVERY.md`／`05_EXPERIMENT_GOVERNANCE_AND_RECOVERY.zh-tw.md`
7. `06_PROTOCOL_AND_DATA_CONTRACTS.md`／`06_PROTOCOL_AND_DATA_CONTRACTS.zh-tw.md`
8. `08_AGENT_WORK_PACKAGES.md`／`08_AGENT_WORK_PACKAGES.zh-tw.md`
9. `starter/README.md`／`starter/README.zh-tw.md`

## 代理的第一個任務

先執行文件與專案盤點，不要立即重構：

```powershell
cd starter
npm install
npm run check
npm test
npm start
```

然後依 `03_EXECUTION_PLAN_v0.1.md` 的 Phase 0 驗證目前骨架。

## 已提供的骨架能力

- Electron 43.1.0 專案基礎。
- BrowserWindow 控制介面。
- WebContentsView 目標網頁區。
- 目標頁面導覽、重新整理、上一頁與下一頁。
- 隔離世界 `executeJavaScriptInIsolatedWorld()`。
- 原始 Chrome DevTools Protocol 命令管道。
- 最小頁面 snapshot。
- JSON Lines 執行紀錄。
- 檔案型 checkpoint。
- Utility Process（工具程序）通訊探針。
- 可監督的 generated Node runtime。
- Versioned module store 與 rollback。
- Provider-neutral model turn 與本機 loopback adapter。
- Provider-neutral model/tool evolution loop、correlated run manifest 與跨 session module reuse。
- Git-backed source-evolution candidate workflow。
- 不含特定網站 adapter、不含固定任務功能。

## 目前剩餘工作

完整狀態以 `PROJECT_STATUS.md`／`PROJECT_STATUS.zh-tw.md` 為準。目前主要缺口為：

- Hosted model credential storage 與 redaction policy；目前只允許無憑證 loopback adapter。
- Real local-model quality 與 prompt-injection robustness；目前自動迴圈以 deterministic fixture 驗證 protocol/correction/reuse。
- 多分頁／multi-target session 管理。
- Source-evolution dependency change、merge conflict 與 concurrent candidate handling。
- WP-09 candidate 的產品負責人人工接受；目前保留證據但不 merge。
- Phase 7 engine boundary review；只有出現可重現 Electron blocker 才啟動。

## 交付原則

代理若遇到架構取捨，應優先維持：

1. 語意／任務層保持開放。
2. 遠端網頁與本機權限程序分離。
3. 每次執行可觀測、可停止、可復原。
4. 不將模型輸出偽裝成已驗證結果。
5. 不為「看起來安全」而重新加入固定任務白名單。

## 歷史 handoff artifact

`handoff-manifest.json` 與 `FILE_LIST.txt` 保留為 2026-07-12 原始交付包的
不可變 inventory snapshot；其中的 `knownIncomplete` 與檔案清單不代表目前
實作狀態。現在的狀態、驗證與重要文件入口分別以
`PROJECT_STATUS.md`、`VALIDATION_REPORT.md` 與 `KEY_DOCUMENTS.zh-tw.md` 為準。
