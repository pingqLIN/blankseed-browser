# WP-11 自動化本機演化迴圈報告

> 本檔為 `starter/reports/wp-11-automated-evolution-loop.md` 的繁體中文 companion；英文原檔為權威來源。日期：2026-07-17（Asia/Taipei）。

## 目標與範圍

以自動 model turn 重跑 Phase 4 的 failure/correction/reuse 實驗，補齊 Phase 5 exit criterion，同時維持既有 Kernel、remote renderer isolation、module rollback 與 evidence boundary。

本次採 fixture-first、local-only；不加入 hosted credentials、non-loopback endpoint、task-level action verb、dependency mutation、自動接受 source change，也不合併 WP-09。

## 架構與契約

- 新增 main-process `EvolutionRunManager` 與 `RawCapabilityDispatcher`。
- 新增 narrow `evolution.run`／`evolution.cancel` IPC 與 preload API。
- Dispatcher 只暴露 page snapshot/execute、CDP、受監督 Node execution、module lifecycle 與 checkpoint 等 raw infrastructure family。
- 未知或 malformed tool 會回傳 structured `INVALID_REQUEST`；model text 不能選任意 IPC channel。
- 每個 run 建立 `evo_*` ID 與 pre-run checkpoint，event 和 generated module provenance 帶 run/turn/action correlation identity。
- 完整 manifest 存於 `workspace/evolution-runs/<evo_*>/run.json`，包含 messages、context/input hash、normalized output、action request/result、source hash、metrics 與 terminal outcome。
- 單一 action result 上限為 1 MiB，完整 run manifest 上限為 16 MiB；超限會回傳 size/hash structured evidence 並停止後續 dispatch，不讓 artifact 無界成長。
- OpenAI-compatible encoder 現在會實際傳送 packaged context、raw tools 與 correlated tool result，接受 `content: null` 的 tool-only response，且仍不送 Authorization。
- `BLANKSEED_WORKSPACE_ROOT` 僅作非 secret 的隔離 runtime workspace override；一般啟動仍使用既有 `starter/workspace`。
- Windows smoke 配置 ephemeral CDP port，且只有 control-page URL 帶有本次 unique nonce 時才可送出 `Browser.close`；readiness failure 會在 launch function 內清理自己建立的 child。

ADR-011 記錄此架構邊界；`06_PROTOCOL_AND_DATA_CONTRACTS.md` 與本身的繁中 companion 記錄 provider-neutral action/evidence contract。

## 自動實驗證據

Action sequence 由 loopback fixture model 決定，不是 smoke script 直接呼叫 module API：

1. page snapshot
2. 建立會回傳 BigInt 的 candidate
3. test 並觀察 `SERIALIZATION_FAILED`
4. 根據失敗結果建立 serializable 修正版
5. test
6. commit
7. activate
8. invoke
9. terminal assistant response

Smoke script 只提供 user goal、fixture model transport 與 assertions，沒有代替模型建立或修正 source。

## 指令與結果

Focused tests 在加入 malformed/duplicate-call、bounded action cancellation 與 evidence budget coverage 後為 12/12 passed。最終完整 static/unit/integration suite 為：

```text
Checked 32 project JavaScript files
Checked 16 required Traditional Chinese companions
41/41 tests passed
```

Windows Electron smoke：

```powershell
node scripts/runtime-wp11-evolution-loop-smoke.mjs
```

```text
model requests/turns: 9
raw actions: 8
expected failed action: 1
active module: generated.wp11.runtime@0.1.0
correlated events: 68
second Electron session: distinct session ID
restart reuse: ok
runtime remaining: 0
ephemeral CDP ownership nonce verified: true
CDP port reusable after both launches: true
exit code: 0
```

成功 smoke 在清除 isolated temporary workspace 前已驗證 run manifest；九次 fixture request 都沒有 Authorization，且都有 packaged context 與 raw tool definitions。

Completion reviewer 一度因固定 CDP port 與 readiness failure 可能遺失 child handle 而拒絕 runtime claim。最終版本改為 ephemeral port、nonce ownership proof、launch-local failure cleanup 與 port-reuse assertion，修正版 runtime 已通過。

## 保留的第一次失敗證據

第一次 runtime attempt 已完成產品 evolution loop 並寫入 module/run evidence，但 harness 在 Electron 已退出後仍等待 `Browser.close` CDP response，因而卡住。只終止 scoped Node harness，失敗 temporary evidence 保留於 `%TEMP%\blankseed-wp11-bqnySq`。

之後把 harness 修正為不等待 `Browser.close` response，再 await Electron child exit 並保留 scoped kill fallback；同一 smoke 重跑後通過。第一次失敗沒有被刪除，也沒有當成成功驗證。

## 人工驗證紀錄

- Launch command：`node scripts/runtime-wp11-evolution-loop-smoke.mjs`
- Tested URL：loopback ephemeral fixture page
- Action：由 fixture model 經 raw tools 建立、測試、修正、commit、activate、invoke；關閉後以第二個 Electron session reuse
- Expected：一次 observable serialization failure、模型提出修正、immutable commit、correlated evidence、restart reuse、process/port clean shutdown
- Actual：成功重跑完全符合
- Evidence：每次 run 的 `workspace/evolution-runs/<evo_*>/run.json`、events JSONL 與本報告

## 邊界與剩餘風險

Fixture 只證明 protocol/dispatch/correction/reuse，不代表 real-model quality 或 prompt-injection robustness。Evolution cancel 會取消 active model request；若在 action 執行中取消，已測試該 action settle 後不再 dispatch 後續 turn/action。**Stop All** 另要求 broker/runtime 終止，但仍不保證立即停止 Chromium 已開始的 JavaScript。Generated Node runtime 不是 secure sandbox。Hosted credentials、streaming、non-loopback endpoint、parallel run、dependency change 與自動 source acceptance 不在本次範圍；WP-09 branch 仍未合併且未修改。
