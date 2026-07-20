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

可用的一鍵驗證入口：

```powershell
npm run verify
npm run verify:runtime
npm run verify:wp11
npm run verify:wp12:preflight
```

`verify` 會執行 syntax、configuration、document companion gate 與 unit tests；`verify:runtime` 另執行受控 Windows Electron hardening smoke；`verify:wp11` 驗證 deterministic automated evolution loop，是 WP-12 preflight，不是真實模型證據。`verify:wp12:preflight` 驗證 fail-closed WP-12A 基礎；未提供 operator 管理的 trial input 或外部 egress evidence 時，會記錄 `PRE-FLIGHT HOLD / NOT RUN`，且不會啟動 Electron 或聯絡模型。

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

啟動前可設定 `BLANKSEED_LOCAL_MODEL_ENDPOINT` 與
`BLANKSEED_LOCAL_MODEL_NAME`。endpoint 必須維持 HTTP(S) loopback（`127.0.0.1`、`localhost` 或 `::1`），不得包含 credentials。

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
