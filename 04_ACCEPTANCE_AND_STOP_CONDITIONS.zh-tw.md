# 驗收與停止條件

> 本檔為 `04_ACCEPTANCE_AND_STOP_CONDITIONS.md` 的繁體中文 companion；英文原檔為權威來源。

## MVP 強制驗收條件

### A. 應用與 target surface

- Windows 可用文件化指令啟動應用。
- Target website 顯示於 WebContentsView。
- Target renderer 關閉 Node integration、開啟 context isolation 與 sandbox。
- Navigation、reload、back、forward 正常。
- 視窗關閉時明確銷毀 WebContentsView resources。

### B. Raw browser primitives

- 可要求 page snapshot。
- 任意 JavaScript 可在 dedicated isolated world 執行。
- Raw CDP method/params 不受 semantic whitelist 限制。
- Result/error structured 且可 serialization。
- Navigation 使 stale target state 失效。

### C. Generated runtime

- AI-generated Node code 在 main process 外執行。
- 保存 stdout、stderr、return value、error 與 exit state。
- 支援 timeout 與 operator termination。
- Generated runtime crash/hang 不得造成 application crash。

### D. Module evolution

- 成功 code 可 commit 為 module，版本 immutable，source/metadata 可檢視。
- 支援 generated module dependency、activate、deactivate、rollback。
- Committed module 在 application restart 後仍存在。

### E. Evidence 與 recovery

- 每次 execution 有 session/execution identity 與 source/command hash。
- Events 有順序與 timestamp。
- Risky change 前可建立 checkpoint。
- Source self-modification 未具 Git rollback 時不得接受。
- Stop All 必須終止 generated activity，或明確回報無法終止的部分。

### F. Research demonstration

從不存在 task-specific capability 開始；user/AI 討論需求；AI 生成並執行 code；至少一個 failure 被觀察與修正（除非首版可證明完整）；user 驗證；code 成為 reusable module；後續 session 重用；完整 evidence bundle 保留。

## 不得阻礙驗收的非目標

Polished consumer UI、multi-platform installer、Chrome Web Store、multiple providers、完整 browser tab parity、Chromium fork，以及 arbitrary Node code 的 formal security proof，皆不是 v0.1 blocker。

## 實作停止條件

出現以下情況時停止並產生 diagnostic report：相同 failure 無新證據地重複三次、generated runtime/descendant 無法終止、需要在 remote content 啟用 Node、main process 直接執行 untrusted source、self-modification 前 rollback 不完整、無 minimal blocker 就提 Chromium fork、event log 缺少 source/target/error identity、dependency 帶入未核准 remote runtime code 或不可稽核 binary、測試靠停用被測行為才通過，或專案漂移為 fixed task/action product。

## Stop Report 範本

```markdown
# Stop Report

## Blocked objective
## Exact reproduction
## Expected result
## Actual result
## Evidence paths
## Attempts made
## Current hypothesis
## Why another retry is not justified
## Smallest decision required
## Safe rollback point
```
