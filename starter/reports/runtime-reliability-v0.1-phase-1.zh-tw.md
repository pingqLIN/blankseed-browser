# BlankSeed Agent Runtime Reliability Upgrade v0.1 - Phase 1 報告

> 英文原檔為權威來源：`runtime-reliability-v0.1-phase-1.md`。本檔為方便人工閱讀的繁體中文對照版。

## 目標

當 evolution model turn 失敗時，保留 retryability、protocol error identity 與 checkpoint provenance。

## 現況發現

`ModelTurnManager` 原本已將 `EXECUTION_TIMEOUT` 序列化為 `retryable: true`。但 `EvolutionRunManager` 使用 `createProtocolError(...)` 重新建立失敗時，漏傳第四個 `retryable` 參數；run-level catch 隨後又在沒有 checkpoint、turn、action provenance 的情況下序列化 wrapper。結果是可恢復的 model timeout 被改成不可 retry 的最終 run error。

## 最小修改

- `src/main/evolution-loop.cjs`
  - 重新建立 protocol error 時保留 `turn.error.retryable`。
  - 建立 checkpoint 後，將該 checkpoint 加入 Runtime context。
  - 最終 structured error 加入 `checkpointId`、`turnId`、`actionId` 與受控的 structured `cause`，同時保留原始 `code`、`message`、`details`、`retryable`。
  - Returned 與 thrown action failure 在進入 model feedback、durable evidence 與 event record 前，也使用相同 serializer。
  - 對 terminal error 產生一次 `evolution.run.retry.decided` event。Retryable error 會標記為 `checkpoint-recovery-eligible`，但 `automaticRetry` 維持 `false`。
- `test/evolution-loop.test.mjs`
  - 新增會拋出 retryable `EXECUTION_TIMEOUT` 的 regression adapter。
  - 驗證回傳結果、durable `run.json`、failed event 與 retry decision event 的 metadata 完全一致。
  - 驗證 returned 與 thrown action error 都保留 checkpoint、turn 與 action provenance。

本階段沒有修改 model adapter、Module API、permission policy、activation policy，也沒有新增 automatic retry。

## 驗收

在 isolated worktree 的 `starter/` 執行：

```text
node --test test/evolution-loop.test.mjs
tests 13, pass 13, fail 0

npm run check
Checked 59 project JavaScript files; baseline configuration is valid.
Checked 24 required Traditional Chinese document companions.

git diff --check
PASS
```

Phase 1 結果：**PASS**。

## Rollback

只需回復 `src/main/evolution-loop.cjs` 的 Phase 1 變更，並移除對應 regression test。Phase 0 Git ref 與壓縮快照仍是升級前的權威 recovery handles。
