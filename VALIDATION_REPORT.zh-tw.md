# 驗證報告

> 本檔為 `VALIDATION_REPORT.md` 的繁體中文 companion；英文原檔為權威來源。日期：2026-07-17（Asia/Taipei）。

## 目前驗證契約

在 `starter/` 執行：

```powershell
npm run verify
npm run verify:runtime
npm run verify:wp11
```

`verify` 涵蓋 JavaScript syntax、configuration、必要繁中 document companions 與 unit tests。`verify:runtime` 另啟動 Windows Electron candidate，僅使用 loopback fixtures，驗證 page/CDP cancellation 與本機 OpenAI-compatible model transport，最後關閉 application 與 fixture server。

`verify:wp11` 另在 isolated workspace 執行 deterministic OpenAI-compatible tool loop，驗證 observable candidate failure、model-driven correction、commit/activate/invoke、完整 correlated run manifest、第二個 Electron session reuse，以及 process/port cleanup。

## 目前結果

最新 automated evolution 結果記錄於 `starter/reports/wp-11-automated-evolution-loop.md`；WP-10 report 仍是 cancellation/CDP recovery 的權威證據。

最新結果：32 個 JavaScript files 通過、16 份必要繁中 companion 通過、41/41 tests 通過。WP-11 Windows runtime smoke exit code 0；9 個 model turns、8 個 raw actions、1 個預期 failed action；第二 session module reuse 通過、runtime remaining=0、ephemeral CDP ownership nonce 已驗證且 port 可重綁。

## 較早證據

- `starter/reports/phase-0-baseline.md` 保存第一次 Windows Electron launch 與 raw primitive 驗證。
- `starter/reports/wp-01-contracts-events.md` 至 `starter/reports/wp-09-source-evolution.md` 保存 protocol、runtime、module、experiment、model 與 source evolution 的分階段證據。

原始 2026-07-12 artifact validation 因 container 無法下載 Electron binary 而不能啟動 GUI；後來已在目標 Windows 環境解決，因此不再代表目前狀態。

## 剩餘驗證邊界

- 不測試也不處理 hosted model credentials。
- CI 只執行 static/unit verification；Electron runtime smoke 仍是 Windows operator workflow。
- Deterministic fixture 不驗證 real local-model quality、prompt-injection robustness 或 parallel evolution run。
- WP-09 candidate acceptance 保持人工決定，不屬於 `verify:runtime`。
