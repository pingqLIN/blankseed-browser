# BlankSeed Browser 程式使用說明

> 本檔為 `USER_GUIDE.md` 的繁體中文 companion；英文原檔為權威來源。

## 用途與目前邊界

BlankSeed Browser 是以 Windows 為優先的平台實驗應用程式。本機受信任控制台（trusted control console）透過可觀察的低階 primitives（原始操作能力）操作隔離於 `WebContentsView` 的 remote page。本程式不是正式產品瀏覽器、Chrome Extension，也不是 Generated Node code 的 security sandbox。

控制台與本機教學均可透過語言選單使用繁體中文、簡體中文與英文。已儲存且受支援的選擇優先；否則依瀏覽器語言映射至支援語系，未知值則以繁體中文作為產品 fallback。UI 文案只存在 renderer 的靜態 catalog；`Page`、`CDP`、`Node`、`Module`、`Candidate`、`Commit`、`Activate`、`Invoke`、`Rollback`、`Checkpoint`、`Event` 與 `Runtime` 等術語維持穩定，方便與 evidence 對照。

原始 event payload、protocol ID、JSON key、page content、model output 與 error detail 都是 evidence，而不是 UI copy，因此刻意不翻譯。

## 執行需求與啟動

- Windows 10 或 11
- npm 工具使用 Node.js 22 或更新版本
- npm，並安裝好 `starter/node_modules/` 相依套件

在 `starter/` 目錄於 PowerShell 執行：

```powershell
npm install
npm run check
npm test
npm start
```

Windows 使用者可在儲存庫根目錄雙擊 `啟動 BlankSeed Browser.cmd`，快速開啟程式。若要開啟教學，可雙擊 `啟動操作教學.cmd`，或在 `starter/` 執行 `npm run tutorial:open`；啟動器會建立本機回環伺服器並開啟正確網址。直接以 `file://` 載入教學時會顯示攔截與復原指引。若要停止受管理的教學伺服器，可雙擊 `停止操作教學.cmd`，或執行 `npm run tutorial:stop`。

僅在 `node_modules/` 不存在，或 lockfile 已變更時才執行 `npm install`。程式左側為受信任控制台，右側為遠端 `Target`，預設開啟 `https://example.com/`。

## 介面操作

### 狀態與 Target

- `Session 工作階段`：目前 runtime session 識別碼（縮短顯示）。
- `Target 目標頁`：目前 target 識別與文件世代（document generation）狀態。
- `Node Runtime`：是否啟用 Generated Node 執行。
- `Module 模組`：目前已啟用的 generated module 數量。

輸入 HTTP 或 HTTPS URL 後點選 **前往**。左右箭頭可做上一頁與下一頁，圓形箭頭則重新載入頁面；其餘 URL scheme 會被拒絕。右上角重新整理按鈕會更新所有控制台狀態與 evidence list。

### Page

- **檢查 Snapshot**：透過 broker 取得目前頁面 snapshot。
- **執行 Isolated JS**：在 isolated page world 執行 source，並顯示結構化結果包（structured result envelope）。

Page source 必須回傳可 JSON serialize 的資料，不應依賴 Node.js、Electron、本機檔案或 trusted control console object。

### CDP（Chrome DevTools Protocol）

輸入 raw Chrome DevTools Protocol 方法，如 `Page.getNavigationHistory`，並在 params 欄位輸入 JSON。點選 **傳送** 後，操作會經由 broker 與 event pipeline 執行。

### Node

- **Ping**：檢查 Generated `Node Runtime` 是否回應。
- **執行 Node Source**：在受監督的 utility process 執行 source。
- **停止**：終止進行中的 Generated Node 執行。

Generated Node 執行具備可觀測與可回復性，但不是 security sandbox。請只放入適合此本機研究工作區的 code 與 input。

### Module 模組

`Module Store` 生命週期為：

1. 輸入穩定的 `Module id`、語意版本（semantic `version`）與說明。
2. 輸入可回傳 JSON-serializable output 的 source。
3. 點選 **建立 Candidate**，保留回傳的 `cand_*` 識別碼。
4. 點選 **測試 Candidate**。
5. 測試成功後才點選 **Commit 版本**。
6. 點選 **Activate 版本** 使該 immutable version 成為 active 狀態。
7. 輸入 environment JSON，點選 **Invoke Module**。
8. 點選 **Rollback 版本**，回復到所選 committed version。

未經明確 Commit 與 Activate，不可將已測試的 `Candidate` 視為已採用來源。

### Recovery、Result 與 Event Timeline

- **建立 Checkpoint**：以輸入的 label 紀錄可回復的 file state。
- **全部停止**：請求取消進行中的 evolution run、Page/CDP broker 執行、Generated Node runtime 與 model turn。
- `Result 結果`：顯示最近一次結構化回應或錯誤。
- `Event Timeline`：顯示最近事件序列。

Event types、request IDs、error codes、protocol fields、JSON keys 保留英文，以維持與 log 與 test 的一致性。Page/CDP result cancellation 可以觀察，但 Chromium 已開始執行的 JavaScript 仍可能持續到 return 或 document 銷毀。

四個分頁支援 `Left Arrow`、`Right Arrow`、`Home` 與 `End` 鍵盤操作。

## Local model 與 evolution loop

可點選頂端的「模型設定」捷徑，或開啟「Agent > AI 模型接入」，設定本次程式使用的模型。目前託管模型清單包含 `gpt-5.6-sol`、`gpt-5.6-terra` 與 `gpt-5.6-luna`；沒有 Codex provider，也沒有名為 `GPT Codex` 的模型。Codex 屬於不同的產品與執行環境。

預設 adapter 只會連線到此無 credential 的 loopback endpoint：

```text
http://127.0.0.1:1234/v1/chat/completions
```

預設 model 為 `local-model`。啟動前可用以下非機敏（non-secret）覆寫：

```powershell
$env:BLANKSEED_LOCAL_MODEL_ENDPOINT = 'http://127.0.0.1:1234/v1/chat/completions'
$env:BLANKSEED_LOCAL_MODEL_NAME = 'local-model'
npm start
```

endpoint 需限制在 HTTP(S) loopback，且不得包含 credentials。程式不會送出 `Authorization` header。可用：

```powershell
npm run verify:wp11
```

驗證 bounded raw-primitive evolution loop。一般啟動的 run manifest 寫在
`starter/workspace/evolution-runs/<evo_*>/run.json`。

## Evidence 與驗證

Electron 運行證據儲存在：

```text
<userData>/blankseed-data/
├─ events/events.jsonl
└─ checkpoints/*.json
```

Generated runtime artifacts 儲存在 Git 忽略的 `starter/workspace/experiments/`。

驗證指令：

```powershell
npm run verify
npm run verify:runtime
npm run verify:wp11
```

- `verify`：syntax、configuration、document companions 與 unit test。
- `verify:runtime`：額外執行 Windows Electron cancellation 與 loopback model smoke。
- `verify:wp11`：加入 deterministic model-driven evolution 與 restart reuse。

UI 或 runtime 變更後，請記錄：launch command、測試網址、操作步驟、預期結果、實際結果、對應 log 或 checkpoint 路徑。

## 疑難排解

- Console 無法 ready：執行 `npm run check`，並確認 sandboxed preload 有 expose `window.blankseed`。
- URL 被拒絕：改用 HTTP 或 HTTPS，並移除 URL 中內嵌 credentials。
- CDP 在 detach 後失敗：查閱 next-command recovery event，失敗的 raw command 不會自動重放（replay）。
- Local model 失敗：確認 OpenAI-compatible chat-completions server 在 loopback 上可正常監聽。
- Generated Node 作業卡住：使用 **停止** 或 **全部停止**，再檢查最新 event 與 experiment artifact。
