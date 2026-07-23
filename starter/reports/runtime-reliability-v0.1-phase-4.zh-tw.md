# BlankSeed Agent Runtime Reliability Upgrade v0.1 - Phase 4 報告

> 英文原檔為權威來源：`runtime-reliability-v0.1-phase-4.md`。本檔為方便人工閱讀的繁體中文對照版。

## 目標

將 evolution model turn 固定 30 秒 timeout，改為適合長流程 Agent work、受控且可稽核的 policy。

## 現況發現

Direct model 與 evolution path 都預設使用 `modelTurnTimeoutMs: 30000`。即使 caller 沒有指定 timeout，evolution IPC 仍會塞入該值，使 run manager 無法替 analysis、code-generation、verification 選擇較長 budget。

## 最小修改

- 新增 pure policy module `src/main/adaptive-timeout-policy.cjs`。
- 新增受驗證 Runtime configuration：
  - simple：30,000 ms；
  - analysis：90,000 ms；
  - code generation/correction：120,000 ms；
  - verification：180,000 ms。
- 第一個 evolution turn 為 analysis；後續 turn 依上一個 action kind/status 分類。
- 每次 decision 都會產生 `evolution.turn.timeout.selected`，並存入 transcript turn。
- 操作員明確指定的 `timeoutMs` 在 1–300,000 ms 範圍內仍具權威性。
- Evolution IPC 在 caller 未指定 timeout 時不再塞入固定值，讓 policy 生效。
- Direct model call 與 Page/CDP/Node action timeout 都未改變，也沒有新增 automatic retry。
- ADR-024 記錄 policy 與 rollback triggers。

## 測試與驗收

```text
node --test test/adaptive-timeout-policy.test.mjs test/evolution-loop.test.mjs
tests 16, pass 16, fail 0

npm run check
Checked 59 project JavaScript files; baseline configuration is valid.
Checked 24 required Traditional Chinese document companions.

git diff --check
PASS
```

Integration fixture 驗證連續三個 model turn 分別收到 90,000、120,000、180,000 ms，不再使用舊的 30,000-ms default，且 event/evidence metadata 完全一致。測試不會真的等待 180 秒 wall clock。

Phase 4 結果：**PASS**。

## Rollback

移除 policy module/config/tests 與 transcript metadata，恢復 IPC default injection，並回復 ADR-024。Direct-model 行為未修改，因此不需要 rollback。
