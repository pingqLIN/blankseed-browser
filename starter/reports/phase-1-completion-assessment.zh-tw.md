# Phase 1 完成條件評估

> 本檔為 `phase-1-completion-assessment.md` 的繁體中文 companion；英文原檔為權威來源。

日期：2026-07-18 Asia/Taipei

## 評估對象與判定

此處「第一階段」指權威 `03_EXECUTION_PLAN_v0.1.md` 的
**Phase 1 — Deterministic Kernel protocol**，不是 WP-12 trial series。

判定：`IMPLEMENTATION PRESENT / COMPLETION EVIDENCE INCOMPLETE`。

Phase 1 的 task surface 已實作，現行測試也驗證了大部分內容；但兩項規格明列
的測試條件缺少現行 automated regression coverage：重複 IPC request ID，以及
operation 執行期間發生 navigation。兩者都有實作或歷史證據，但歷史證據不能
取代目前可重複執行的 completion gate，因此尚不應宣稱 evidence-complete。

## 已檢查證據

### 現行 source/test 已 VERIFIED

- `src/shared/contracts.cjs` 與 contract tests 已涵蓋 runtime validation、stable
  identifier、payload size limit、structured error 與 deterministic execution
  envelope。
- `src/main/ipc-router.cjs` 會記錄 process-local request ID，重複時回傳
  `DUPLICATE_REQUEST_ID`。
- `src/main/capability-broker.cjs` 會記錄 started/completed/failed event，處理
  timeout/cancel、result serialization，並在 async operation 前後檢查 target
  freshness。
- 現行 broker tests 涵蓋 timeout、cancel、執行前 stale target、result
  serialization、CDP lifecycle 與 recovery。
- target lifecycle 會送出 console/navigation event；現行 contract/localization
  tests 仍驗證相關契約。
- `npm run check` 與 `npm test` 目前通過，完整測試為 51 項。

### 歷史 runtime artifact 已 VERIFIED

- `starter/reports/wp-01-contracts-events.md` 記錄實際 duplicate request rejection
  與完整 IPC success/failure event chain。
- `starter/reports/wp-02-target-lifecycle.md` 記錄 navigation 後 target generation
  改變及 stale request rejection。
- `starter/reports/wp-10-operational-hardening.md` 記錄 page/CDP cancellation 與
  CDP recovery 的 runtime evidence。

### UNKNOWN／目前證據缺口

- 沒有現行 automated test 以同一個 `requestId` 呼叫 IPC wrapper 兩次，並
  assert 第二次的 deterministic failure 與 event chain。
- 沒有現行 automated test 先啟動 async broker operation，在 operation resolve
  前變更 `documentGeneration`，再 assert postflight `TARGET_NAVIGATED`、failure
  event，且不得出現 completed-success event。

程式碼內已有兩項 control；缺口是可重複的 acceptance evidence，不是已觀察到
的功能 regression。

## Phase 1 必要完成條件

以下各項皆為必要；任一缺少就維持 phase open。

| Gate | 完成條件 | 目前狀態 |
| --- | --- | --- |
| P1-C1 | Malformed／oversized payload 回傳 schema-stable structured error。 | VERIFIED |
| P1-C2 | Session/request/execution ID 能關聯完整有序 event chain。 | VERIFIED |
| P1-C3 | Stale target token 在 execution 前失敗。 | VERIFIED |
| P1-C4 | Active operation 期間 navigation，postflight 必須以 `TARGET_NAVIGATED` 失敗，且不得宣稱成功。 | EVIDENCE GAP |
| P1-C5 | 重複使用 IPC `requestId` 必須 deterministic 回傳 `DUPLICATE_REQUEST_ID` 並記錄 failed request。 | EVIDENCE GAP |
| P1-C6 | 非 JSON-serializable result 回傳 `SERIALIZATION_FAILED`，且 event store 不受破壞。 | VERIFIED |
| P1-C7 | Page/CDP timeout/cancel 回傳 stable error、broker 無 active execution，CDP 可恢復。 | VERIFIED |
| P1-C8 | Console/navigation event 與 target destruction 到 shutdown 都可觀測。 | source 與歷史 runtime evidence VERIFIED |
| P1-C9 | 在同一 clean recorded commit 上，`npm run check`、`npm test` 與相關 Windows runtime smoke 均通過且未弱化 assertion。 | 本 slice 的 clean-commit evidence PENDING |

只有在所有列出的 negative case 中，同一 request 都能產生 deterministic
result/error **及**完整 event chain，才符合權威 exit statement。若規格明列的
case 沒有測試，單純 aggregate test count 通過仍不足以關閉 Phase 1。

## 最小關閉工作

1. 抽出或注入 process-local request-ID registry，使 IPC wrapper 不需廣泛 mock
   Electron 即可測試；加入 duplicate-ID event-chain regression test。
2. 加入 broker test：execution promise pending 時改變 target generation，assert
   `TARGET_NAVIGATED`、failure event，且沒有 completion event。
3. 從 clean recorded commit 執行 focused tests、完整 `npm run verify` 與 Windows
   runtime smoke。
4. 只有 P1-C1 至 P1-C9 都具備目前、可重現證據時，才把本評估更新為
   `PHASE 1 VERIFIED COMPLETE`。

上述關閉工作不需要改變 architecture、permission philosophy 或 research scope，
目前不需新增 Decision Log entry。
