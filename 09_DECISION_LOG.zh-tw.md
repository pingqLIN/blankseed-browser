# 架構決策紀錄

> 本檔為 `09_DECISION_LOG.md` 的繁體中文 companion；英文原檔為權威來源。

## ADR-001 — 先使用 Electron，不先採 CEF／Chromium fork

Electron 已提供 Chromium、WebContentsView、CDP 與 utilityProcess，可先驗證研究假設。只有出現具體、可重現且無替代方案的 engine blocker 時才重新評估。代價是接受 Electron lifecycle 與 API 限制；rollback trigger 是經證據證明無法完成必要 experiment。

## ADR-002 — 不使用 Chrome Extension 架構

Extension permission model、store policy 與 action surface 會過早塑造研究結果，因此採用獨立 Electron application。後果是自行負責 window/process/update，但能保留 open-ended local research boundary。

## ADR-003 — 移除 semantic action whitelist

Kernel 只提供 raw primitives，不硬編碼 click/type/summarize 等 task-level action。安全與治理由 isolation、broker、event、stop 與 rollback 提供，而不是預定任務類型。

## ADR-004 — 分離 remote renderer 與 generated Node runtime

Remote website 保持 sandboxed 且無 Node integration；generated Node code 只在 separate utility runtime 執行。這增加 IPC/process supervision 複雜度，但保留必要 trust boundary。

## ADR-005 — 每次 execution 使用 disposable utility runtime

WP-04 證明成功、throw、timeout 與 process-tree termination 可被觀察。選擇 disposable runtime，讓失敗隔離且 artifact 可追蹤；它仍不是 secure sandbox。若 process 無法回收或成本不可接受，需重新 review。

## ADR-006 — Model automation 從 local provider-neutral adapter 開始

WP-08 先建立 common model.turn contract、context hash、cancellation 與 structured error，以 deterministic `local.manual` 驗證，不處理 hosted credentials。後續 adapter 必須維持 common envelope，secret storage 未決前不得直接加入 hosted key。

## ADR-007 — Candidate 驗證後仍採人工 source-evolution acceptance

WP-09 能建立 branch/worktree、套用 patch、執行 check/test、啟動 candidate health probe 並移除 worktree。驗證成功只代表 candidate evidence，不等於自動 merge。保留人工 acceptance 可避免 validated candidate 靜默改變 stable source；缺點是需要額外 review 與 conflict handling。

## ADR-008 — 明確 broker cancellation 與 next-command CDP recovery

Phase 1 與 kill hierarchy 需要取消 pending page/CDP execution。決定新增 narrow `execution.cancel` IPC，broker 可取消指定或全部 active execution；broker-owned CDP command 取消時 detach。非預期 detach 會記錄，下一個獨立 command 重新 attach，但不自動重播可能具有 side effect 的失敗 command。Windows smoke 已驗證兩個 execution 均為 `EXECUTION_CANCELLED`、remaining=0。Page 已開始的 Chromium JavaScript 不保證立即停止，必須在結果中誠實保留此限制。

## ADR-009 — 第一個真實 model transport 採無憑證 loopback adapter

決定加入 `local.openai-compatible`，endpoint/model 由 configuration 決定；endpoint 僅允許 HTTP(S) loopback，URL 禁止 credentials，不送 Authorization header，request 仍拒絕 secret-shaped keys。此設計可連接本機 OpenAI-compatible server，而不擴大 credential scope；hosted provider、streaming 與非 loopback endpoint 需要新的明確決策。

## ADR-010 — 強制重要文件維護繁中 companion

本機全域治理要求重要 public/operator/release Markdown 提供 `.zh-tw.md` companion，但 repo 原先只有語言原則，沒有 executable gate。決定保留英文 publishable technical source 為權威來源、保留原生繁中 `README_HANDOFF.md`，為 active important set 建立 companion 與 `KEY_DOCUMENTS.zh-tw.md`，並讓 `npm run check` 檢查 14 份必要 companion。歷史報告不預設全部翻譯，除非成為目前 operator 文件。

## ADR-011 — Model tool call 必須經過有界的 Kernel evolution loop

Phase 5 adapter 原本能解析 OpenAI-compatible `tool_calls`，卻只把它當 dead-end output，不能 dispatch raw capability、把結果餵回下一回合，也不能自動重現 Phase 4 的 failure/correction/reuse。決定新增 main-process-only `EvolutionRunManager` 與 `RawCapabilityDispatcher`；internal contract 保持 provider-neutral，由 adapter 負責 provider wire format。Dispatcher 只呼叫既有 page/CDP/process/module/checkpoint service，不讓 model text 選任意 IPC channel，也不加入 summarize/translate 等 task whitelist。

WP-11 loopback fixture 已實際完成 snapshot、建立故意回傳 BigInt 的 candidate、觀察 `SERIALIZATION_FAILED`、產生修正版、test/commit/activate/invoke，並在第二個 Electron session reuse。每個 run 保存 checkpoint、完整 transcript/action result、source hash、metrics 與 run/turn/action correlation identity。這證明 protocol 與 correction evidence path，不代表 real-model quality 或 prompt-injection robustness。Hosted credentials、non-loopback transport、parallel evolution、dependency mutation 與自動接受 source change 均需另行 review。

## ADR-012 — 在 loopback-only research profile 評估真實本機模型

WP-11 已用 deterministic fixture 關閉 Phase 5 protocol gap，但無法證明真實模型的 task quality、evidence-driven correction 或 prompt-injection robustness。決定採用 `11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.md`：固定一個無憑證本機模型，以四個 scenario family、每類三個獨立 trials 執行；每次使用隔離狀態、synthetic canary、完整 manifest 與明確 pass/hold/stop gates。

WP-12 採專用 `workspace-research-loopback-only` profile，先縮小高風險試驗的 network 與 data exposure，但不新增 semantic task whitelist，也不改變 Kernel raw-tool catalog 或人工 source acceptance boundary。Series 若失敗或 HOLD，仍是不可刪除的研究證據；WP-12 通過也不授權 hosted credentials、自動接受 source change 或更廣 host access。若無法維持 evidence、process cleanup 或 loopback-only control，立即停止並回復 pre-run checkpoint；更換 provider、network profile、scenario matrix、Kernel tools 或 protected-data boundary 前必須重新 review。

## ADR-013 — 以 redacted adapter catalog 提供 Agent Console

Kernel 已有 `evolution.run`，但 trusted control renderer 原本沒有 Task composer
與 model selection，operator 必須手動呼叫 preload API。決定在既有控制台新增
Agent Console，且只投影 adapter ID、label、provider、model、transport class、
availability 與 hosted/local 分類。Task、turn/action budget 與非 secret options
仍使用既有 `evolution.run`；endpoint 與 credential 僅留在 main process。

此設計讓 operator 可直接啟動與取消有界 Agent Run，也為日後列出 Hosted
adapter 保留安全介面。Catalog availability 只代表 configuration，不代表
provider health 或 model quality。若 renderer 可讀到 credential、unrestricted
endpoint 或其他 secret-bearing configuration，應移除此投影；在 renderer IPC
加入可編輯 endpoint／credential 前必須重新 review。

## ADR-014 — 將導航與版本 Rollback 納入 brokered raw tools

Agent loop 原本能觀察／執行目前 Target，也能 Activate Module，卻不能導航到
使用者指定 URL，亦不能選擇先前 committed Module version。決定把既有
`TargetViewController.navigate()` 與 `ModuleStore.rollback()` 投影為
`target_navigate`、`module_rollback`，且仍只經既有 service 與 event path。

成功導航會改變 `documentGeneration`，因此同一 run 必須以回傳的 `targetId`
與 `documentGeneration` 更新 expected target identity，之後的 page/CDP action
才不會被誤判為 stale。Module Rollback 仍只改變 active mapping，不宣稱能
反轉 external side effect；若任一 tool 繞過 URL/version validation、遺失
event evidence，或未完成導航便更新 identity，應立即移除並 review。

## ADR-015 — 將 Checkpoint restore 限制為 atomic active-Module mapping

Checkpoint 原本只擷取 status，若把它稱為完整 backup 會誇大 recovery 能力。
Committed Module 已有 immutable identity 與 `sourceHash`，active selection 則是
可完整驗證與 atomic replacement 的小型 mapping。決定建立含 state hash、明確
restore scope 與 exclusions 的 versioned Checkpoint。

Restore 需要 operator confirmation、owned Runtime 已 idle、app version 與
Checkpoint hash 相符，且所有 committed Module source hash 通過驗證。系統先建立
safety Checkpoint，再以 compare-and-swap 只替換完整 `modules.active`；stale
mapping 或部分驗證失敗時不得 mutation。Navigation、browser storage、
configuration、credentials、events、Module files、Git state 與 external effects
全部在 scope 外。若無法保證 hash validation、safety capture、atomic mapping
replacement 或 owned-runtime stop，應停用 restore；擴大 scope 必須另立決策。

## ADR-016 — 隔離 provider credential 並加入固定 GPT-5.6 Responses adapters

Loopback adapter 無法呼叫 Hosted GPT-5.6，而 Electron `utilityProcess.fork()`
若未指定 environment，會繼承 `process.env`；generated Node source 因此可能讀到
provider key，且 stdout/stderr 會被保留。決定讓每個 generated utility process
只取得 explicit operational environment allowlist，排除 provider credential。

另新增 Main-Process-only OpenAI adapter，固定使用
`https://api.openai.com/v1/responses` 與 `gpt-5.6-sol`、`gpt-5.6-terra`、
`gpt-5.6-luna`。Redirect 與 secret-shaped payload field 一律拒絕，request 使用
`store: false`、停用 parallel function call、明確指定 reasoning effort，event
只保留 redacted egress/provider metadata。WP-12 loopback evaluation profile 仍
分開治理。若 credential 出現在 Renderer state、generated environment、
event/evidence、error detail、redirect 或非 allowlisted request，應停用所有
Hosted adapter；新增 provider、endpoint、credential source、streaming 或 automatic
hosted evaluation protocol 前必須 review。

## ADR-017 — Multi-Agent activation 必須具備 session-anchored handoff evidence 與 operator Apply

**Status:** Accepted
**Date:** 2026-07-20

### Context

Runtime 已能執行 bounded Agent run 並 Activate committed Module；但若 model-to-model review 沒有 role identity、evidence binding 與獨立 authority gate，generated output 就可能靜默成為 activation policy。第一版 Multi-Agent contract 必須沿用 raw broker、Module API 與 recovery model，不重新設計 Runtime。

### Evidence

Module Commit 已提供 immutable `id`、`version` 與 `sourceHash`；Checkpoint restore 已具備 integrity check、safety capture 與 atomic active-mapping replacement；evolution loop 也會記錄 run、turn、action 與 tool evidence。這些 primitive 足以綁定 review，無須把 mutating tool 交給 Reviewer。

### Alternatives

- Reviewer approve 後直接呼叫 `module_activate`。
- 不建立獨立 Agent identity 與 persisted handoff，只把同一 run 的兩次 model turn 視為 review。
- 等待完整 parallel scheduler、policy engine 與 quorum system 後才實作。

### Decision

加入 sequential `MultiAgentRuntime`，為 Proposer 與 Reviewer 建立不同且 immutable 的 `agt_*` identity。兩個 role 都只能使用 read-only 的 `page_snapshot` 與 `module_list`；Proposal、handoff、review、optional activation target 與 committed source identity 都以 hash 綁定，保存 `gov_*` decision，並以同一 session 的 Main Process memory anchor 持有 Apply authority。Reviewer approve 只是 advisory。Activation target 會維持 `awaiting_operator`，直到明確呼叫 `governance.apply`，重新驗證 memory anchor、不同 identity、evidence hash、`sourceHash` 與 expected active version，建立 safety Checkpoint，再以 compare-and-swap Activate。App restart 後，persisted decision 不可 Apply。

### Consequences

- Multi-Agent review 可檢視且可復原，不需要加入 semantic task whitelist，也不改變 Module lifecycle。
- Hash mismatch、self-review、verdict 格式錯誤、source 改變或 stale active state 都會 fail closed。
- 第一版是 sequential，不證明 reviewer、provider、organization 或 failure domain 彼此獨立。
- Activation policy authority 仍由 human confirmation 掌握。
- 若 activation/restore 已到達 target mapping、completion evidence 卻失敗，保留 `applied_unknown` 與 durable transition record，不得錯誤回到 unapplied state。

### Rollback/review trigger

若 persisted evidence 能取代同一 session 的 memory anchor、Reviewer 能取得 mutating tool、model verdict 可在沒有 operator confirmation 時 Activate，或 active-state compare-and-swap 被繞過，應停用 governed Apply。加入 parallel orchestration、delegated policy authority、independent-provider quorum、remote governance service 或更廣 tool profile 前，必須重新 review。

## ADR-018 — 只在明確的 ephemeral governance sandbox profile 允許 Agent auto-Apply

**Status:** Accepted
**Date:** 2026-07-20

### Context

ADR-017 規定一般 Runtime 中 Reviewer approve 只具 advisory 性質，仍需 operator Apply。本次研究另需證明不同 Agent 能在受限情境核准並套用 committed Module，但不得弱化預設產品 authority boundary，也不能把 generated Node execution 誤稱為 secure sandbox。

### Evidence

既有 decision anchor、immutable Module `sourceHash`、safety Checkpoint 與 compare-and-swap activation path 已具 fail-closed 行為。Deterministic 10-task Electron/CDP suite 實際涵蓋 Page、CDP、受監督 Node、Candidate、Test、Commit、Activate、Invoke、失敗修正及 governed Agent auto-Apply；最終 `generated.sandbox.counter@1.1.0` 回傳 `42`。

### Alternatives

- 讓所有 Reviewer approve 直接 Activate Module。
- 只加 UI switch，繞過 Main Process governance。
- 等到具備 OS/container/VM security sandbox 後才測試 delegated policy。

### Decision

一般 Runtime 維持 ADR-017 不變。只有設定 `BLANKSEED_SANDBOX_AGENT_AUTO_APPLY=1`，且 Main Process policy 驗證 workspace 與 data root 都位於同一個專用 `%TEMP%/blankseed-sandbox-*` root 之下、model endpoint 為 HTTP loopback 時，才允許 automatic Apply。Policy 只能授權已 approve、同一 session 內以 hash anchor 綁定、且 Proposer 與 Reviewer identity 不同的 decision。Auto-Apply 必須重用 operator Apply 的 source verification、safety Checkpoint、expected-active-version check 與 compare-and-swap path。Evidence 以 `agent-sandbox-policy` 記錄 authority，不得偽造 operator identity。

Profile metadata 必須明示 `hostFilesystem: not-isolated` 與 `securitySandbox: false`。Profile 未啟用時，UI control 維持 disabled；API 若要求 auto-Apply，必須在 model execution 前 fail closed。

### Consequences

- 一般使用仍需明確 operator Apply。
- Research profile 可測試 delegated Agent authority，但不建立通用 autonomous activation capability。
- 成功執行會在刪除 temporary runtime 前另存 workspace/data evidence；失敗執行則保留 temporary root 供診斷。
- 這是 governance 與 lifecycle isolation，不是 OS security boundary。

### Rollback/review trigger

若 root 可逃出 owned temporary tree、接受非 loopback model egress、auto-Apply 未具 approved same-session anchor、任何 integrity/checkpoint/compare-and-swap check 被略過，或 evidence 誤述 authority／isolation claim，應移除此 profile 與 UI control。擴大 tool、改用 persistent root、hosted provider 或 production use 前必須重新 review。

## ADR-019 — 允許從受信任控制面板提供只存於記憶體的 OpenAI 憑證

**Status:** Accepted
**Date:** 2026-07-21

### Context

ADR-016 原本只允許 Main Process 環境變數提供憑證。操作員現在需要直接在可見的 Agent 面板設定既有的本機與 OpenAI 介接器，同時不能把供應者機密寫入版本庫或產生的 Runtime。

### Evidence

控制 Renderer 已隔離，並且只公開明確的 preload 呼叫。IPC 只記錄通道資料，不記錄 payload 值。`ModelTurnManager` 可在沒有進行中模型回合時替換介接器目錄；產生的 utility process 也已使用明確的環境允許清單，排除供應者憑證。

### Alternatives

- 維持只能透過環境變數設定。
- 使用 Electron `safeStorage` 持久化加密金鑰。
- 開放可編輯的遠端供應者端點與逐回合憑證。

### Decision

新增專用模型設定 IPC。密碼欄位送出後立即清空。面板提供的 OpenAI 金鑰只保留於本次程式執行的 Main Process 記憶體，而且不得出現在狀態、事件、錯誤或結果。環境變數憑證仍是替代來源。託管模型仍只允許固定的 OpenAI Responses 端點與模型。本機端點只接受本機回環，並拒絕憑證、查詢參數與片段。模型回合進行中不得替換介接器。

### Consequences

- 操作員可直接從 Agent 面板接入本機與 OpenAI 模型。
- 受信任的控制 Renderer 會在清空欄位前短暫處理輸入的憑證，因此控制 Renderer 遭入侵仍屬風險範圍。
- 重新啟動會清除面板提供的憑證；本次不新增持久化機密儲存。

### Rollback/review trigger

若任何金鑰進入持久化狀態、日誌、事件、錯誤、結果、產生程序的環境或非允許清單的對外連線，應移除面板憑證輸入。新增持久化、其他供應者、可編輯託管端點或背景憑證更新前，必須重新審查。

## ADR-020 — 模組建立預設使用具操作員關卡的自動化流程

**Status:** Accepted
**Date:** 2026-07-21

### Context

模組面板原本把每個生命週期動作分開，導致一般的「建立候選 → 測試 → 提交 → 啟用 → 呼叫」流程需要重複操作。自動化不得靜默跨越不可變提交或作用中版本對應的邊界。

### Evidence

既有 IPC 已驗證每個生命週期轉換。建立候選與測試是可逆的準備；提交會建立不可變版本身分；啟用會變更作用中對應；呼叫可立即提供結果證據。

### Alternatives

- 只保留逐項手動按鈕。
- 不經確認直接執行完整生命週期。
- 每次本機模組迭代都要求受控多代理決策。

### Decision

將一鍵流程設為預設介面。系統自動建立並測試候選，接著在提交前顯示 YES／NO 視窗，啟用前再次顯示 YES／NO 視窗。使用者允許啟用後，自動呼叫一次進行驗證。選擇 NO 會停在已測試候選或已提交版本，不執行回復。所有逐項控制仍保留於「手動操作（進階）」中。

### Consequences

- 一般模組迭代只需一次啟動與兩次重大決定。
- 既有 API、證據、版本身分、回復與治理路徑維持不變。
- 自動化流程只是介面協調，不是新的 Runtime 權限。

### Rollback/review trigger

若自動流程可略過任一確認視窗、在選擇 NO 後繼續、隱藏失敗的生命週期結果，或移除逐項復原控制，應停用此流程。自動提交、自動啟用或政策式核准前，必須重新審查。

## ADR-021 — Module 發布與啟用必須通過操作員關卡

**Status:** Accepted
**Date:** 2026-07-21

### Context

ADR-020 只在 Module 自動流程中對 Commit 與 Activate 設置關卡；手動 Commit、Activate、Rollback 按鈕與預設 Agent tool catalog 仍可在沒有同等決定的情況下跨越相同邊界。這與步驟導向介面顯示的安全說明矛盾，也可能讓操作員把未審核或已停止的路徑誤認為已核准變更。

### Evidence

獨立的 UX、Runtime 與 Governance reviewer 指出 Module 生命週期邊界的手動確認缺口；最終 Governance reviewer 建議讓 Rollback 與 Commit、Activate 採用一致關卡。既有 checkpoint restore 與 governance apply 已證明可在 Main Process 使用 fail-closed 的確認檢查。

### Alternatives

- 只修改介面文字，保留直接變更路徑。
- 只在手動按鈕加入 dialog，不在 IPC 強制執行決定。
- 允許預設 Agent 先發布與啟用，再於變更後要求核准。

### Decision

Module Commit、Activate 與 Rollback 必須在 Main Process IPC 邊界收到 `confirmed: true`。所有受信任控制介面路徑都必須先顯示語意化 YES／NO dialog，才能送出這個值；NO 不得產生變更。預設 Agent profile 排除 Commit、Activate 與 Rollback tool；只有另外取得授權的明確 allowlist 才能使用。Agent 仍可建立與測試 Candidate，留下可供操作員審查的內容。

### Consequences

- 受信任控制介面的所有發布、啟用與回復路徑都使用相同操作員關卡。
- 一般 Agent 可準備與測試 Candidate，但不能改變已提交或作用中的 Module 狀態。
- 特殊研究 profile 只有在提供明確 tool allowlist 並保留完整證據時，才能維持自動生命週期測試。
- 既有 Module 身分、checkpoint、rollback 資料與遠端內容隔離都維持不變。

### Rollback/review trigger

若任何介面路徑可省略確認、NO 仍產生事件或狀態變更、一般 Agent 取得高風險 Module tool，或特殊 allowlist 缺少可檢視的授權來源，必須停止 Commit、Activate 或 Rollback。將這些操作委派給新的 Runtime profile 前，必須重新審查。
