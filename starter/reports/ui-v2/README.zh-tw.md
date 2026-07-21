# 流程導向 UI V2 — Runtime 驗證

英文版 [README.md](README.md) 為權威文件；本檔案是繁體中文對照版。

## 範圍

本證據涵蓋流程導向 renderer 重設計、溢位可讀性、執行防錯流程、進階工具可達性，以及空白 Runtime 基礎狀態。

## 手動／Runtime 驗證

- 啟動命令：`npm run verify:ui:agent`
- 測試網址：透過隔離的暫時 Electron profile 與 loopback fixture 模型開啟 `https://example.com/`
- 執行動作：
  - 由標頭捷徑開啟模型設定；
  - 設定並清除合成的 session credential，且未將值寫入 log；
  - 以 `Ctrl+Enter` 執行 Agent 任務；
  - 取消執行中的 Agent 任務，確認 run status、訊息與步驟都一致顯示 warning／已停止；
  - 分別驗證自動與手動 Module 建立／測試；手動 Commit 與 Activate 選擇 `NO` 時不得變更，選擇 `YES` 時各只產生一次變更；
  - 確認缺少明確 confirmation 時，Main Process 會拒絕 Module Commit；
  - 將左側功能區完整捲到底；
  - 檢查 500×920、390×844 與 430×600 版面；
  - 注入長錯誤與識別碼版面 fixture，確認可完整換行且不使用 ellipsis。
- 預期結果：六個順序步驟皆可閱讀；情境資訊持續可見；被阻擋的動作會說明缺少條件；進階能力仍可使用；沒有水平溢位；短高度仍看得到主要操作；Module 確認 gate 維持有效。
- 實際結果：Electron/CDP smoke run 全部符合預期；單元測試與靜態檢查另行通過。
- 相關證據：
  - `qa-workflow-desktop-500.png`
  - `qa-agent-workspace-390.png`
  - `qa-workflow-short-430x600.png`
  - `runtime-smoke.json` — 結構化 Electron/CDP 結果
  - `verification.json` — 由命令輸出推導的檢查數、版本、完整涵蓋 scoped file bytes 的 identity、hash、inventory 與實測 cleanup 結果
  - `runtime-reset-manifest.json` — 可復原 reset 的 hash-linked manifest、可重現 digest canonicalization 與 rollback procedure

## Runtime 基礎狀態

最終驗證前，生成的 Runtime 資料已可復原地移到含時間戳記的 `.del` 目錄。下列項目經確認為空或不存在：

- Module Store 與 candidate；
- active Module mapping；
- evolution run、experiment、source-evolution run 與 WP12 preflight 資料；
- 應用程式 Runtime data root 的 checkpoint 與 event journal。

瀏覽器 profile、登入、cookie、credential、已追蹤原始碼與已追蹤歷史報告均未重設。

## 概念稿與實作比對

實作已依 desktop、narrow、failure/recovery 三種生成概念稿，針對五個實質項目進行目視比對：

1. 有編號且依序排列的工作流程；
2. 持續可見的 session、target 與 Runtime 情境；
3. 長訊息與識別碼可完整換行；
4. blocked、ready、error 狀態與下一步清楚可見；
5. Page JS、CDP、Node、Module 與 Multi-Agent 統一收在一個進階工具 disclosure。

概念稿只作為版面參考；Runtime 截圖才是實作證據。

供獨立比對的概念稿資產：

- `concept-desktop.png`
- `concept-narrow.png`
- `concept-failure-recovery.png`

已知且刻意保留的差異：

- Desktop 概念稿顯示完整分割視窗；CDP 截圖只擷取控制 renderer。實際 Electron 視窗仍會把隔離的 `WebContentsView` 放在 500px 左側功能區右邊。
- 概念稿文字只作示意，含 image generation 產生的文字瑕疵；實作中的 code-native 繁體中文標籤才是權威內容。
- 概念稿使用五個粗略階段；實作拆成六個階段，把準備與目標／上下文分開，讓不需要網頁的任務可明確跳過該前置條件。
