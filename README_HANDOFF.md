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

1. `00_EXTERNAL_AGENT_MASTER_PROMPT.md`
2. `01_RESEARCH_CHARTER.md`
3. `02_ARCHITECTURE_SPECIFICATION_v0.1.md`
4. `03_EXECUTION_PLAN_v0.1.md`
5. `04_ACCEPTANCE_AND_STOP_CONDITIONS.md`
6. `05_EXPERIMENT_GOVERNANCE_AND_RECOVERY.md`
7. `06_PROTOCOL_AND_DATA_CONTRACTS.md`
8. `08_AGENT_WORK_PACKAGES.md`
9. `starter/README.md`

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
- 不含模型 API、不含特定網站 adapter、不含特定任務功能。

## 尚未完成

- AI 模型連接器。
- 持久模組系統。
- AI 生成程式碼的 utility runtime。
- Git checkpoint 與 rollback。
- 自動測試瀏覽器 fixture。
- 多分頁管理。
- Source self-modification。

## 交付原則

代理若遇到架構取捨，應優先維持：

1. 語意／任務層保持開放。
2. 遠端網頁與本機權限程序分離。
3. 每次執行可觀測、可停止、可復原。
4. 不將模型輸出偽裝成已驗證結果。
5. 不為「看起來安全」而重新加入固定任務白名單。
