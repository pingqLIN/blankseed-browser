# BlankSeed Browser Starter 操作說明

> 本檔為 `starter/README.md` 的繁體中文 companion；英文原檔為權威來源。

這是一個刻意保持極小的 Electron scaffold，供 BlankSeed Browser 研究使用。

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

單一驗證入口：

```powershell
npm run verify
npm run verify:runtime
npm run verify:wp11
```

`verify` 執行 syntax、configuration、文件 companion gate 與 unit tests；`verify:runtime` 另執行受控 Windows Electron hardening smoke。

## 目前 UI 與能力

左側是 trusted local control panel，右側是 WebContentsView remote target。

可用能力包括 navigation/back/forward/reload、page snapshot、isolated JavaScript、raw CDP、file checkpoint、utility process、supervised generated Node execution、Stop、module candidate/test/commit/activate/invoke/rollback、event timeline、page/CDP cancellation、model turns，以及經同一組 raw broker/runtime/module/checkpoint service 執行的有界 provider-neutral model/tool evolution loop。

Model turn 可使用 deterministic `local.manual`，或不送 authorization header、只允許 loopback 的 `local.openai-compatible` adapter。

## 重要限制

Generated Node source 在 disposable utilityProcess 執行；這是 observability/recovery boundary，不是 security sandbox。Runtime source、redacted input metadata、stdout/stderr、result/error 存於 ignored 的 `workspace/experiments/`。

Electron runtime data 位於：

```text
<userData>/blankseed-data/
├─ events/events.jsonl
└─ checkpoints/*.json
```

## 人工驗證

1. 啟動應用。
2. 前往 `https://example.com/`。
3. 使用 Inspect Page。
4. 在 isolated page world 執行讀取 title/headings 的程式。
5. 傳送 CDP `Page.getNavigationHistory`。
6. 建立 checkpoint。
7. 執行一段 generated Node source。
8. 檢查左側結果與 log path。

## 本機模型 adapter

預設值：

```text
endpoint: http://127.0.0.1:1234/v1/chat/completions
model: local-model
```

啟動前可設定 `BLANKSEED_LOCAL_MODEL_ENDPOINT` 與 `BLANKSEED_LOCAL_MODEL_NAME`。Endpoint 必須是 HTTP(S) loopback（`127.0.0.1`、`localhost`、`::1`），且 URL 不得包含 credentials。

## 自動演化驗證

Windows 可執行：

```powershell
npm run verify:wp11
```

此指令使用 isolated temporary workspace 與無憑證 loopback fixture。Fixture model 會要求 raw tools，觀察一次故意的 candidate serialization failure，自行提出 corrected source、commit/activate module，再由第二個 Electron session reuse。一般啟動的 run manifest 存於 `workspace/evolution-runs/`。

## Security posture

Remote page 固定維持：

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
```

Local UI 也使用 context isolation 與 narrow preload API。
