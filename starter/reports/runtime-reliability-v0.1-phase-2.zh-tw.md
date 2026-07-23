# BlankSeed Agent Runtime Reliability Upgrade v0.1 - Phase 2 報告

> 英文原檔為權威來源：`runtime-reliability-v0.1-phase-2.md`。本檔為方便人工閱讀的繁體中文對照版。

## 目標

讓 broker-owned CDP connection 可從 `No session with given id` 恢復，同時不建立一般性的 raw-command replay policy。

## 現況發現

既有 broker 能在 unexpected debugger detach 後，替下一個獨立 command 重新 attach；但不會辨識 invalid-session rejection，也不會恢復遇到該錯誤的 command。ADR-008 明確禁止 generic replay，因為其他 failure 無法證明 Chromium 是否已套用具有狀態的 command。

## 最小修改

- `src/main/capability-broker.cjs`
  - 只匹配 error/cause message 中的 `No session with given id`。
  - 記錄含 `SESSION_INVALID` 的 `cdp.session.invalid`。
  - 更新 debugger attachment，並將被拒絕的 command 重試一次。
  - 成功時記錄 `RECOVERED`。
  - Recovery 失敗時回傳 retryable `CDP_SESSION_INVALID`，保留兩次 cause 與 `attempts: 2`；不可能進行第三次嘗試。
  - 若 debugger attachment 並非由此 broker instance 建立，則 fail closed，不執行 detach 或 replay。
- `src/shared/contracts.cjs`
  - 新增 structured `CDP_SESSION_INVALID` error code。
- `test/capability-broker.test.mjs`
  - 覆蓋第二次嘗試成功、兩次後乾淨失敗、unrelated error 不 replay，以及 externally owned attachment 不 detach/replay。
- `09_DECISION_LOG.md` 與 `09_DECISION_LOG.zh-tw.md`
  - ADR-022 記錄 ADR-008 的精確 invalid-session 例外。

本階段沒有加入 target reload、新 Module API、permission change 或 generic CDP retry。

## 驗收

```text
node --test test/capability-broker.test.mjs
tests 12, pass 12, fail 0

git diff --check
PASS
```

Phase 2 結果：**PASS**。

## Rollback

移除 invalid-session 分支與 `CDP_SESSION_INVALID` code、移除四個 regression tests，並回復 ADR-022。ADR-008 的 next-command recovery 仍維持不變。
