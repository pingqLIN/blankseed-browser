# 代理工作包

> 本檔為 `08_AGENT_WORK_PACKAGES.md` 的繁體中文 companion；英文原檔為權威來源。每個 package 都應是可獨立 review 的變更。

## WP-00 Baseline

執行 starter，只修正可重現 defect，產生 Phase 0 report。

## WP-01 Contracts 與 event store

Runtime payload validation、session/request/execution ID、ordered event records 與 error-shape unit tests。

## WP-02 Target lifecycle

追蹤 navigation/document generation、讓 stale request 失效、保存 console/crash/unresponsive events，並明確銷毀 view resources。

## WP-03 Page/CDP broker

集中 source wrapping、timeout、hash、serialization 與 CDP attach/detach lifecycle；保留 raw method/params transport，使用 fixture page 測試。

## WP-04 Utility runtime supervisor

啟動獨立 runtime、傳送 source/config、stream logs、timeout/kill、處理 Windows descendant process 與 runtime crash recovery。

## WP-05 Module store

Manifest validation、immutable version、candidate/test/commit、activation/rollback 與 provenance。

## WP-06 Experiment console

Code/request editor、target/environment view、timeline、Stop All 狀態、module browser 與 checkpoint browser。

## WP-07 Manual AI experiment

準備 Seed Prompt，執行一次 capability-evolution 實驗，保存 transcript/evidence 並計算初始 metrics。

## WP-08 Model adapter interface

Provider-neutral interface、一個 adapter、cancellation、context/evidence packaging 與 secret handling。

## WP-09 Git source evolution

Stable/candidate worktree、patch、checks/tests、candidate health handshake，以及 accept/rollback。

## WP-10 Operational hardening

- 明確 page/CDP broker cancellation。
- 非預期 CDP detach 後，下一個 command 執行 reattach recovery。
- 不使用憑證、僅允許 loopback 的 OpenAI-compatible adapter。
- 重要文件繁中 companion gate。
- 單一 static/unit verification 指令與受控 Windows runtime smoke。

## 平行工作指引

WP-00 後，WP-01 可與 UI mock 並行；WP-02/03 緊密相依；WP-04 等 contract 穩定後進行；WP-05 依賴 WP-01/04；WP-07 依賴 WP-03 至 WP-06。WP-09 是最後的 source-evolution package；WP-10 可在不接受 WP-09 candidate branch 的前提下強化 stable Kernel。

## Review checklist

- Scope 符合 package。
- 未加入 task-level whitelist。
- Remote content isolation 保持。
- Generated source 不在 main process 執行。
- 提供 tests 與 manual evidence。
- 已處理 event 與 rollback impact。
- 必要時更新 Decision Log。
