# BlankSeed Browser Starter 操作說明

> 本檔為 `starter/README.md` 的繁體中文 companion；英文原檔為權威來源。

這是一個刻意保持極簡的 Electron scaffold，供 BlankSeed Browser 研究使用。

完整流程請參閱 [`../USER_GUIDE.zh-tw.md`](../USER_GUIDE.zh-tw.md)；英文權威來源為 [`../USER_GUIDE.md`](../USER_GUIDE.md)。
已核准的下一階段實驗定義於 [`../11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.zh-tw.md`](../11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.zh-tw.md)；英文權威來源為 [`../11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.md`](../11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.md)。

## 需求與啟動

- 建議 Windows 10/11。
- npm tooling 使用 Node.js 22 以上；Electron runtime 使用其內嵌 Node.js。
- npm。

```powershell
npm install
npm run check
npm test
npm start
```

Windows 使用者也可在儲存庫根目錄雙擊 `啟動 BlankSeed Browser.cmd`，透過相同啟動路徑開啟程式。

若要啟動互動式繁體中文教學網站，並自動開啟正確的本機回環網址，請執行：

```powershell
npm run tutorial:open
```

Windows 使用者也可在儲存庫根目錄雙擊 `啟動操作教學.cmd`。若要停止由快捷啟動器建立的伺服器，可執行 `npm run tutorial:stop`，或雙擊 `停止操作教學.cmd`。教學頁必須從本機回環伺服器取得正式 Renderer，因此直接使用 `file://` 開啟時會顯示攔截與復原指引。

啟動器會開啟 `http://127.0.0.1:4173/tutorial/`。教學站直接載入目前 Renderer
markup 與 stylesheet 作為 UI 來源，再以本機模擬資料驅動；不會開啟真實網站、
送出 credential、呼叫 model provider 或套用 Module。

可用的一鍵驗證入口：

```powershell
npm run verify
npm run verify:runtime
npm run verify:wp11
npm run verify:sandbox:ten-tasks
npm run verify:wp12:preflight
```

`verify` 會執行 syntax、configuration、document companion gate 與 unit tests；`verify:runtime` 另執行受控 Windows Electron hardening smoke；`verify:wp11` 驗證 deterministic automated evolution loop，是 WP-12 preflight，不是真實模型證據。`verify:sandbox:ten-tasks` 會啟動 isolated Electron/CDP 與無憑證 loopback model fixture，驗證十項 raw capability／governance task，包含 policy-gated Agent auto-Apply。`verify:wp12:preflight` 驗證 fail-closed WP-12A 基礎；未提供 operator 管理的 trial input 或外部 egress evidence 時，會記錄 `PRE-FLIGHT HOLD / NOT RUN`，且不會啟動 Electron 或聯絡模型。

## 目前 UI 與能力

左側是 trusted local control panel。右側是 `WebContentsView` 的 remote target。

可用能力包括：

- navigate URL；
- back/forward/reload；
- 取得基本 page snapshot；
- 在 isolated world `1001` 執行 JavaScript；
- 傳送 raw CDP method 與參數；
- 建立具 integrity check 的 file checkpoint，並在明確確認後還原其 active Module mapping；
- ping utility process；
- 在 supervised utility process 執行 generated Node.js source；
- 停止進行中的 generated Node.js execution；
- 建立、測試、commit、activate、invoke 與 rollback generated modules；
- 檢視 active modules、checkpoints 與 execution timeline；
- 取消進行中的 page/CDP broker 執行；
- 透過 `local.manual` 或無憑證 `local.openai-compatible` loopback adapter 執行 provider-neutral model turn；
- 透過同一組 raw broker、runtime、module 與 checkpoint 服務，執行 bounded 的 provider-neutral model/tool evolution loop。
- 在 Agent Console 組合 bounded Task，並選擇 Local Manual、Local OpenAI-compatible，或可用的 OpenAI GPT-5.6 Sol/Terra/Luna adapter。
- 執行 sequential Proposer-to-Reviewer Multi-Agent review，以 hash 與同一 session 的 Main Process memory anchor 綁定 evidence；若要 Activate 已 approve 的 committed Module，仍須 operator Apply。

## 重要

Generated Node.js source 在 disposable `utilityProcess` 中執行（不在主行程），這是可觀測與回復邊界，不是 security sandbox。Runtime source、redacted input metadata、stdout/stderr、result 與 error artifacts 存放於 Git 忽略的 `workspace/experiments/`。

## Runtime data

Electron runtime data 會寫入其 userData 目錄：

```text
<userData>/blankseed-data/
├─ events/events.jsonl
└─ checkpoints/*.json
```

UI 會顯示已解析的路徑。

Git 忽略的 Runtime workspace evidence 也包含 `workspace/evolution-runs/<runId>/run.json`、`workspace/multi-agent-runs/<runId>/run.json` 與 `workspace/governance/decisions/<decisionId>.json`。

Checkpoint restore transition 會記錄於 `<userData>/blankseed-data/checkpoint-transitions/`。`applied_unknown` 表示已觀察到 target mapping，但 completion evidence 失敗，必須由 operator reconciliation。

## 人工驗證

1. 啟動應用。
2. 前往 `https://example.com/`。
3. 按下 **檢查 Snapshot**。
4. 執行：

```js
return {
  title: document.title,
  headings: [...document.querySelectorAll('h1,h2')].map((el) => el.textContent)
};
```

5. 傳送 CDP 方法：

```text
Page.getNavigationHistory
```

並附上參數 `{}`。

6. 建立 checkpoint。
7. 執行 generated Node.js source：

```js
console.log('hello from generated runtime');
return {
  platform: process.platform,
  cwd: process.cwd()
};
```

8. 確認左側結果面板與 log path。

## 本機模型 adapter

實際模型傳輸（model transport）刻意限制於 loopback，且不會附帶 authorization header。預設值為：

```text
endpoint: http://127.0.0.1:1234/v1/chat/completions
model: local-model
```

可直接在「Agent > AI 模型接入」面板變更本次程式使用的端點與模型 ID，也可在啟動前設定 `BLANKSEED_LOCAL_MODEL_ENDPOINT` 與 `BLANKSEED_LOCAL_MODEL_NAME`。端點必須維持 HTTP(S) loopback（本機回環；`127.0.0.1`、`localhost` 或 `::1`），不得包含憑證、查詢參數或片段。

## Hosted OpenAI GPT-5.6 adapters

使用頂端的「模型設定」捷徑，或開啟「Agent > AI 模型接入」。面板可接收暫時 OpenAI API 金鑰；程式也可沿用 Electron Main Process 環境中的 `OPENAI_API_KEY`。任一來源都會啟用 `gpt-5.6-sol`、`gpt-5.6-terra` 與 `gpt-5.6-luna`。專用傳輸使用官方 OpenAI Responses API、明確的 `reasoning.effort`、`store: false`、循序函式呼叫與固定 HTTPS 端點；託管端點不可編輯。

本程式目前沒有註冊 Codex provider，也沒有名為 `GPT Codex` 的模型。Codex 屬於不同的產品與執行環境；在完成專用整合與驗證前，不應將它顯示為可用的 Adapter。

控制 Renderer 只在輸入時短暫持有金鑰，透過專用且受信任的 IPC 傳送後立即清空欄位。面板提供的金鑰只保留於 Main Process 記憶體；狀態、事件、結果與持久化設定都不會回傳或儲存金鑰。產生的 utility process 使用明確的操作環境允許清單，因此產生的 Node 原始碼、模組測試與模組呼叫都不會繼承供應者金鑰。託管模型與無憑證的 WP-12 本機回環評估設定檔分開治理。

## 模組生命週期自動化

模組分頁預設提供一鍵流程：建立候選、測試候選、在提交前要求操作員確認、在啟用前再次要求確認，最後自動呼叫驗證。任一確認視窗選擇 NO，都會安全停在已測試候選或已提交版本。原有的逐項控制仍保留在「手動操作（進階）」內。

請參考官方 [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model) 與 [GPT-5.6 model catalog](https://developers.openai.com/api/docs/models)。

## Multi-Agent Governance

Agent 分頁可執行 sequential Proposer-to-Reviewer handoff。每個 role 都有不同且 immutable 的 Agent identity，並且只能使用 read-only 的 `page_snapshot` 與 `module_list` tool。Reviewer 必須讓 verdict 指向 Proposal hash。若指定 committed Module target，approve 只會建立 `awaiting_operator` decision，不會直接 Activate。

Operator Apply 會依同一 session 的 Main Process memory anchor，重新驗證 evidence hash、committed source identity 與 expected active version，建立 safety Checkpoint，再以 compare-and-swap 執行 Activate。Persisted decision JSON 只是 evidence，app restart 後不可 Apply。這是具有 human gate 的 review workflow，不是 parallel 或 autonomous Multi-Agent policy authority。

只有 deterministic research 使用的 `verify:sandbox:ten-tasks` 會啟動明確的 ephemeral profile：workspace 與 data root 都位於同一個專用 `%TEMP%/blankseed-sandbox-*` tree，model endpoint 僅限 HTTP loopback。此 profile 中，Agent UI 才會提供 auto-Apply control，並由獨立的 `agent-sandbox-policy` authority 透過相同的 Checkpoint、source-integrity 與 compare-and-swap path 套用 approved same-session decision。一般啟動時 control 維持 disabled，仍需 Operator Apply。此 profile 不是 OS security sandbox，也不會把 generated Node code 與 host filesystem 隔離。

## 自動演化驗證

在 Windows 執行 deterministic Phase 5 exit smoke：

```powershell
npm run verify:wp11
```

此流程會使用 isolated temporary workspace 與無憑證 loopback fixture。fixture model 會要求 raw tools，觀察一次預設的 candidate serialization failure，生成 corrected source，並進行 commit/activate module，之後由第二個 Electron session 重複使用。一般啟動的 run manifest 會寫在 `workspace/evolution-runs/`。

## WP-12 預檢

`test/fixtures/wp12/` 的 tracked files 會固定 B1/B2/I1/R1 input、trust label 與
SHA-256。實際 model、workspace、port ownership 及外部 OS egress evidence
必須放在 Git 忽略的 `workspace/wp12-preflight/`。請從
`config/wp12-preflight.example.json` 開始，但不得把 template 當成證據。

Strict preflight：

```powershell
npm run wp12:preflight
```

若要先執行兩個必要 Windows smoke，並把四項本次 check result 帶入 strict
preflight，請執行 `npm run wp12:preflight:full`。

HOLD 會以 exit code 2 結束並寫入
`workspace/wp12-preflight/preflight.json`，且絕不啟動 trial。完成 trial 後，
sidecar 應另行驗證：

```powershell
npm run validate:wp12:evaluation -- workspace/evolution-runs/<evolutionRunId>/wp12-evaluation.json
```
