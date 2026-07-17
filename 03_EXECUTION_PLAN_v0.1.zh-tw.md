# 執行計畫 v0.1

> 本檔為 `03_EXECUTION_PLAN_v0.1.md` 的繁體中文 companion；英文原檔為權威來源。目前實作狀態請見 `PROJECT_STATUS.zh-tw.md`。

## Phase 0 — Baseline 與 scaffold 驗證

目標是證明 starter 可啟動且既有 primitives 符合文件。安裝依賴、執行 check/test、啟動 Electron、驗證 navigation、snapshot、isolated page script、無害 CDP、checkpoint、JSONL events 與關閉時銷毀 target webContents。

交付 `reports/phase-0-baseline.md`。退出條件為所有 scaffold capability 可用，或 starter defect 已記錄、修正並補測試。

## Phase 1 — Deterministic Kernel protocol

讓 raw capability 的 request/result 可觀測、適用時可取消，且 schema 穩定。

工作包含 runtime contract validation、session/execution ID、request size limit、structured error、navigation invalidation、console/navigation events、unified timeline，以及可行的 page/CDP stop/cancel。

測試 malformed payload、stale target、duplicate ID、serialization、timeout 與 execution 中發生 navigation。退出條件為相同 request 必須得到 deterministic result/error 與完整 event chain。

## Phase 2 — Generated Node runtime

在 main process 外執行任意 AI-generated Node.js code，並可靠觀察／終止。建立 utilityProcess supervisor、source package、log/result streaming、timeout/process-tree termination、per-execution directory 與 environment identity，且明確標示它不是 secure sandbox。

必須示範成功、throw、infinite loop termination、child process cleanup，以及 runtime crash 後 app 仍可回應。

## Phase 3 — Versioned module store

把成功的一次性 code 轉為 reusable、inspectable capability。提供 manifest、candidate → test → commit、content hash/immutable version、dependency declaration、activate/deactivate、rollback、provenance，以及 page/Node/hybrid module API。

退出條件為 module 可 commit、restart 後 reload/invoke，並 rollback 至舊版。

## Phase 4 — Manual AI evolution experiment

在沒有 model API integration 的情況下證明研究 loop。從空的 task-specific module store 開始，以人工 copy/paste 讓 AI 處理 underspecified real task，保存討論、execution、failure/correction、module commit、跨 session reuse 與 user evaluation。

交付 transcript、event archive、source history、committed module、user evaluation 與 Research Charter metrics。至少一項新 capability 必須達成 verified reuse。

## Phase 5 — Provider-neutral model adapter

自動化 model turns，但不把 Kernel 綁定到單一 provider。建立 common turn contract、adapter interface、cancellation/timeout、context packaging、tool/result serialization、secret storage design，以及一個 external API 或 local model adapter。

退出條件為 Phase 4 型實驗能透過 automated turns 執行並產生等價證據。

## Phase 6 — Source self-modification prototype

透過 recoverable pipeline 讓 AI 提案並測試 BlankSeed source change。前置條件為 Phase 2 process termination、Phase 3 rollback 與 automated checks/health probe 均已證明。

工作包含 Git checkpoint、candidate branch/worktree、agent patch、dependency policy、install/check/test、candidate launch、health handshake、evaluation，以及 accept/rollback。

退出條件為非 trivial UI 或 Kernel extension 已套用、重新啟動、驗證且可逆。

## Phase 7 — Engine boundary review

判斷 Electron 是否阻礙研究。開始 migration 前必須提出 exact limitation、minimal reproduction、failed alternatives、CEF/fork 預期能力、maintenance/build cost，以及保留 experiment data 的 migration plan。

退出條件為一份決策文件：保留 Electron，或授權範圍有限的 CEF／Chromium investigation。
