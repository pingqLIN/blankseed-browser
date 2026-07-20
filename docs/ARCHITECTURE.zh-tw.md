# BlankSeed Browser 架構

> 本檔為 `ARCHITECTURE.md` 的繁體中文 companion；英文原檔為權威來源。

## 目的與範圍

BlankSeed Browser 是以 Electron 為基礎的本機 Runtime，用於研究 Agent 如何觀察瀏覽器、執行低階 capability、建立版本化 Module，並保留操作 evidence。它同時具有三種定位：

- Electron-based local Runtime；
- browser automation research console；
- local Agent capability execution environment。

本文件描述目前實作已呈現的架構，不重新設計 Runtime、不變更 IPC protocol，也不宣稱任意 generated code 已受到安全 sandbox 保護。

## System Overview

受信任的本機 UI 是面向 operator 的 Browser Console。Main Process 是固定 Kernel，負責 process 與 view lifecycle、IPC validation、將 request 導入可觀察的 Runtime services，以及記錄 evidence。Remote web content 與 generated Node code 分別跨越獨立 boundary 執行。

```text
User
  |
UI Console
  |
Electron Renderer
  |
Preload / IPC Layer
  |
Main Process (Fixed Kernel)
  |
Runtime Services
  |
  +--------------------+-------------------+------------------+
  | CDP / Page Broker  | Node Runtime      | Module System    |
  | Event Store        | Process Supervisor| Recovery Records |
  +--------------------+-------------------+------------------+
             |                  |                  |
       Browser Target      utilityProcess    Workspace / Data
```

固定 Kernel 提供 infrastructure primitives，而不是 business task whitelist。新的 semantic behavior 應存在 generated Module 與 evolution-run artifact 中，不應成為 Main Process 裡不可見的分支。

## System Architecture

| Layer | 目前職責 | Boundary |
| --- | --- | --- |
| UI Console | 收集 input，顯示 result、status、Module、Checkpoint 與 Event Timeline | 無直接 Node access 的 sandboxed local Renderer |
| Preload / IPC Layer | 提供明確的 `contextBridge` method，傳遞 structured payload | 只允許 named IPC channel；不提供 generic channel invocation API |
| Main Process | 持有固定 Kernel、驗證 sender 與 payload、協調 lifecycle | 受信任的 application authority |
| Capability Broker | 以 identity、limit 與 event 執行 Page snapshot、isolated Page source 與 raw CDP command | 所有 Target 操作均通過 observable broker |
| Node Runtime | 在 `ProcessSupervisor` 下執行 generated Node source | 獨立 Electron `utilityProcess`；可觀察、可終止，但不是 security sandbox |
| Module System | 儲存 Candidate source、Test result、immutable committed version、active mapping 與 Rollback transition | Generated workspace 與 Kernel source 分離 |
| Recovery records | 持久化 event 與 Checkpoint，提供 version-oriented recovery decision 所需資訊 | 具 integrity check 的 state capture，以及需 operator confirmation、僅限 active Module mapping 的 restore |
| Multi-Agent Governance | 執行 sequential Proposer-to-Reviewer handoff、將 evidence 綁定至同一 session 的 Main Process anchor，並讓已 approve 的 activation 等待 operator Apply | role-separated Agent identity、read-only governed tool profile；model 不直接持有 policy authority |

## Process Model

### Renderer process

UI Console 由本機 application file 載入，設定為 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。它只能透過 preload 提供的明確 API 請求操作。Renderer 負責顯示狀態，不持有 Runtime authority。

### Main process

Main Process 建立 window、Target、Event Store、Checkpoint Store、Process Supervisor、Module Store、model adapter、evolution loop、Multi-Agent Runtime 與 IPC router。它是 coordination 與 trust boundary；generated behavior 不得直接在此 process 內 evaluate。

### Node execution boundary

Generated Node source，以及以 Node 執行的 Module Test 或 Invoke，均在受監督的 `utilityProcess` 內運作。Process Supervisor 分配 execution identity、擷取 result/error 與保留的 output、套用 timeout，並持有 stop/kill handling。Process separation 改善 observability 與 recovery，但不會阻止 generated Node code 影響其可存取的 host resource。

Generated utility process 使用 explicit operational environment allowlist，不繼承 Main Process 的完整 environment。因此 `OPENAI_API_KEY` 等 provider credential 不會進入 generated code、Module Test、Module Invoke、保留的 stdout/stderr 或 experiment artifact。

### Model provider boundary

`ModelTurnManager` 維持 provider-neutral turn contract。本機 transport 使用 in-process manual adapter 或無 credential 的 loopback Chat Completions。Hosted OpenAI adapter 固定連接官方 HTTPS Responses API，model identity 只允許 `gpt-5.6-sol`、`gpt-5.6-terra` 或 `gpt-5.6-luna`。API key 只在 Main Process 注入；redirect fail closed；request 使用 `store: false`；function call 仍回到同一個 bounded raw-tool dispatcher。Renderer 只接收 redacted adapter metadata。

### Browser target boundary

任意 remote content 位於獨立 `WebContentsView`，設定為 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。Page source 在專用 isolated world 執行；raw CDP 與 Page 操作由 Main Process broker 發出，Target lifecycle event 則寫入 Event Store。擁有它的 window 關閉時，會明確銷毀 Target `webContents`。

## Communication Flow

### Command flow

```text
UI action
  -> preload method
  -> named IPC request
  -> sender and payload validation
  -> Runtime service / Capability Broker
  -> Browser Target, Node Runtime, Module Store, or Checkpoint Store
```

每個 request 都有 `requestId`；涉及 execution 的操作另帶 `executionId`，以及適用的 Target、Module、model-turn 或 evolution-run identity。IPC 是 transport boundary，不代表可以繞過 broker。

### Event flow

Runtime services 將有順序的 record 寫入 `events.jsonl`。適用時，record 會關聯 session、request、execution、turn、action 與 evolution-run identity。近期 event 會回傳並 push 至 UI 的 Event Timeline，讓 start、completion、failure、cancellation、activation 與 Rollback 都可被檢視。

### Result return

Service 透過 IPC 回傳 structured value 或 normalized error。UI 顯示最新 result，Event Store 則保留 chronological evidence。收到 cancellation result 代表 broker 的 result lifecycle 已取消；Chromium 中已開始執行的 Page JavaScript 仍可能持續到 return 或 document 被銷毀。

## Security Boundary

本架構採用分層 control，而不把任意 code 視為安全：

- Remote page 不會取得 Node integration 或 trusted console 的直接 access。
- Page、CDP、process、Module 與 Checkpoint 操作均保留在 broker 或 shared event pipeline 內，維持 observability。
- Generated Node code 在 Main Process 外由 supervisor 執行，並受 timeout、stop/kill control 與 explicit secret-free environment allowlist 管理。
- Hosted provider credential 只留在 Main Process，Renderer/model payload field 不接受 credential。
- Governed Multi-Agent review 將 Proposer 與 Reviewer 都限制於 `page_snapshot`、`module_list`。Proposal、handoff、review、activation target 與 source identity 以 hash 綁定，並在目前 session 以 Main Process memory anchor 保護；Activate 前還需要獨立 operator confirmation 與 compare-and-swap。App restart 後，persisted decision 不可再 Apply。
- Candidate 必須通過 Test、以 immutable Module version 完成 Commit，並明確 Activate 後才會成為 active。
- Module Rollback 會將 active mapping 切換到指定的舊 committed version，並記錄 transition。
- Checkpoint creation 會在高風險 transition 前記錄目前 Runtime state 與 integrity hash。operator-confirmed Checkpoint restore 會停止 owned work、驗證 referenced committed Module 與 source hash、建立 safety Checkpoint，再以 atomic compare-and-swap 只還原 `modules.active`。Target navigation、browser user data/storage、configuration、credentials、events、Module files、Git state 與 external effects 均明確排除。

完整 threat 與 control model 定義於 [`SECURITY_MODEL.zh-tw.md`](SECURITY_MODEL.zh-tw.md)。

## Data Flow

```text
Input
  |
  v
Observation
  |  Page snapshot, status, prior events, active Modules
  v
Execution
  |  Page / CDP / Node / Module / evolution action
  v
Result
  |  Structured value or normalized error
  v
Event Timeline
     Ordered, correlated evidence for review and recovery
```

Runtime state 依用途分開保存：

- `<userData>/blankseed-data/events/events.jsonl` 儲存 chronological event。
- `<userData>/blankseed-data/checkpoints/*.json` 儲存 state capture。
- `starter/workspace/modules/` 儲存 Candidate 與 committed Module version。
- `starter/workspace/state/active-modules.json` 儲存 active version mapping。
- `starter/workspace/evolution-runs/<evo_*>/run.json` 儲存 bounded evolution evidence。
- `starter/workspace/multi-agent-runs/<mar_*>/run.json` 儲存 sequential Agent identity 與 handoff evidence。
- `starter/workspace/governance/decisions/<gov_*>.json` 儲存 review 與 operator-Apply state。
- `<userData>/blankseed-data/checkpoint-transitions/<rst_*>.json` 記錄 restore intent；若 active mapping 已改變但 completion evidence 無法完成，會保留 `applied_unknown`。

## Capability evolution boundary

Module System 使用明確的 `Generate -> Candidate -> Test -> Commit -> Activate -> Invoke -> Rollback` sequence。Test success 是 Commit 的必要條件，但不代表 semantic correctness 或 host safety 已獲證明。完整 state model 與 failure behavior 定義於 [`AGENT_CAPABILITY_LIFECYCLE.zh-tw.md`](AGENT_CAPABILITY_LIFECYCLE.zh-tw.md)。

## Platform extension points

目前 Multi-Agent slice 是 sequential、role-separated、review 過程 read-only，且 activation 需要 human gate。它不代表 parallel orchestration、independent-provider quorum 或 autonomous policy authority。Knowledge Plane、Agent Memory、Skill Registry 與 Capability Marketplace 仍是未來 platform layer。任何 extension 都必須保留 broker observability、remote content isolation、immutable version identity 與明確 recovery evidence。

## Architecture invariants

1. Runtime 不使用 semantic task whitelist。
2. 任意 remote content 永遠不取得 Node integration。
3. Raw primitives 保留在 broker 或 shared event pipeline 後方。
4. Generated behavior 與其 evidence 維持可檢視。
5. Activation 與 Rollback 指向明確的 immutable Module version。
6. Checkpoint restore 必須描述為需 operator confirmation 的 active-Module mapping restore，不得描述為 general 或 automatic state reversal。
7. 新 platform plane 必須延伸本架構，不得把 generated authority 靜默移入固定 Kernel。
8. Generated review output 不得直接 Activate Module；operator Apply 必須驗證不同 Agent identity、hash、source identity 與 expected active version。
