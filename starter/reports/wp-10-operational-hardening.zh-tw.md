# WP-10 操作 hardening 報告

> 本檔為 `starter/reports/wp-10-operational-hardening.md` 的繁體中文 companion；英文原檔為權威來源。日期：2026-07-15（Asia/Taipei）。

## 範圍

在不接受或修改 WP-09 candidate branch 的前提下，完成 WP-09 後最高優先缺口：明確 page/CDP broker cancellation、非預期 CDP detach 後的 next-command recovery、無憑證 loopback OpenAI-compatible adapter、重要文件繁中 companion gate、CI static/unit verification，以及單一 Windows runtime smoke 指令。

## 系統層級文件規則盤點

`C:\Users\miles\.codex\AGENTS.md` 明定重要 public/operator/release Markdown 應有 `.zh-tw.md` companion，且 non-suffixed source 為權威來源。Repo-local `AGENTS.md` 原本只要求 user-facing documentation 使用繁中，未定義 companion coverage 與 executable gate。

本次加入 repo-local companion contract、`KEY_DOCUMENTS.zh-tw.md`、15 份必要 companion 與 `scripts/check-doc-companions.mjs`。

## Broker cancellation 與 CDP recovery

- 新增 `blankseed:execution:cancel` 與 `window.blankseed.execution.cancel(...)`。
- Broker 追蹤 active page/CDP execution，記錄 cancel requested/completed events。
- 取消結果使用 `EXECUTION_CANCELLED`。
- Broker-owned CDP attachment 在 cancellation 時 detach。
- 非預期 detach 記為 `cdp.detached.unexpected`；下一個獨立 command 重新 attach 並記錄 recovery events。
- 不自動重播可能具有 side effect 的 raw CDP command。

Page cancellation 會結束 broker result lifecycle，但不保證 Chromium 立即停止已開始的 page code。

## 本機 model transport

新增 `local.openai-compatible`。只允許 `127.0.0.1`、`localhost`、`::1` 的 HTTP(S) endpoint；URL 不得含 credentials；不送 Authorization header。Secret-shaped payload keys 仍被拒絕，但 `maxTokens` 不會被誤判。預設 endpoint 為 `http://127.0.0.1:1234/v1/chat/completions`、model 為 `local-model`，可用非 secret environment variables 覆寫。

## 驗證結果

```powershell
npm run verify:runtime
```

```text
Checked 29 project JavaScript files
Checked 15 required Traditional Chinese document companions
34/34 tests passed
runtime smoke exit code 0
page/CDP cancelled: 2
remaining: 0
page/CDP result: EXECUTION_CANCELLED
local.openai-compatible status: ok
```

Smoke 後沒有殘留 Electron process，也沒有 scoped CDP listener。

### 2026-07-17 runtime harness 安全追補

因 `verify:runtime` 仍是目前驗證契約的一部分，WP-11 completion review 指出原本固定 CDP port 可能連到其他 Chromium。現在 smoke 會配置 ephemeral loopback port；只有 control target URL 帶有本次 unique nonce 時才會送出 `Browser.close`，之後 await owned Electron child exit 並驗證 port 可重綁。修正版已重跑通過，`ownershipNonceVerified=true`、`cdpPortReusable=true`、exit code 0。

## 人工驗證紀錄

- Launch command：`npm run verify:runtime`
- Tested URL：loopback ephemeral fixture page
- Action：啟動長時間 page/CDP execution，取消兩者，再執行 loopback model turn
- Expected：兩個 deterministic cancellation envelope、remaining=0、model turn 成功、乾淨關閉
- Actual：完全符合，exit code 0
- Evidence：`<userData>/blankseed-data/events/events.jsonl` 與本報告

## Source evolution 決策與剩餘風險

保留 `codex/wp09-source-evolution-1783928693189` 作為本機證據；本次未 merge、delete 或 modify。Page JavaScript 不保證立即終止；fixture 只證明 transport/evidence path，不代表 model quality；hosted credentials、streaming、non-loopback endpoint 與 provider-specific tools 仍在範圍外；CI 不啟動 Electron，Windows operator 仍需執行 `verify:runtime`。
