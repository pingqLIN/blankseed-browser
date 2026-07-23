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

## ADR-022 — 只重試因 CDP session 失效而被拒絕的 command

**Status:** Accepted
**Date:** 2026-07-21

### Context

ADR-008 禁止重播失敗的 raw CDP command，因為非預期 detach 無法證明 Chromium 是否已套用具有狀態的 command。一次長流程 Agent run 出現更精確的 `No session with given id` 拒絕；這代表 transient debugger session 已過期，且 broker 尚未取得 CDP result。Runtime 需要受控的 recovery path，但不能因此建立一般性的 command replay policy。

### Evidence

既有 broker 只會在下一個獨立 command 重新 attach，不會辨識 `No session with given id`、更新 broker-owned attachment，或重試被拒絕的 command。新的 regression fixtures 證明：只有該精確錯誤會觸發一次 detach/reattach 與一次 retry；第二次仍失敗會產生 structured `CDP_SESSION_INVALID`；其他 CDP failure 絕不 replay。

### Alternatives

- 維持 evolution action 失敗，要求完全重新建立 run。
- 任何 debugger error 或 detach 後都 replay command。
- Session 失效時重新載入或重建 target view。

### Decision

只有 cause 包含 `No session with given id` 的 error 才視為 invalid-session rejection。Runtime 記錄 `SESSION_INVALID`、更新 broker-owned debugger attachment，並將相同 command 重試一次。成功時記錄 `RECOVERED`；若 retry 仍失敗，回傳 retryable `CDP_SESSION_INVALID`，保留兩次 cause 與 `attempts: 2`。禁止第三次 retry，也不得把此例外擴張到 timeout、unexpected detach、method error 或其他 CDP failure。

### Consequences

- 長流程可從一種已知的 transient session identity failure 恢復。
- ADR-008 對模糊或可能已套用 command 的 no-replay 規則仍是預設值。
- Recovery 最多增加一次 command latency，並留下可稽核 event chain。
- Recovered result 後仍會執行 target freshness validation。

### Rollback/review trigger

如果 Electron 可能在回傳此精確拒絕前已執行 command、debugger ownership 改為共享、recovery 可能超過兩次總嘗試，或測試顯示其他 error 進入 retry path，應移除此例外。

## ADR-023 — 只在 model context 邊界壓縮大型 observation

**Status:** Accepted
**Date:** 2026-07-21

### Context

長流程 evolution run 會把完整 Node、CDP、DOM snapshot result 寫入 durable evidence，也會把相同 result 放回後續 model turn。大型 output 因此持續累積在 conversation，增加 model latency。若直接替換 durable result，會降低稽核能力，並違反 evidence-before-claims 邊界。

### Evidence

失敗的 YOUTUBE-AOPass run 含有超過 30,000 characters 的單一 action record。既有 generic model serializer 允許每個 tool result 最多 12,000 characters，沒有更低的 observation-specific budget。新的 regression tests 將 50,000-character Node、CDP 與 page snapshot result 傳入 model-facing serializer，同時確認 `run.json` 仍保留完整 50,000-character Node result。

### Alternatives

- 在 persistence 前截斷或拒絕大型 action evidence。
- 所有 tool kind 都維持 12,000-character generic preview。
- 在 Runtime 內加入外部 semantic summarization model。

### Decision

只有 `node.execute`、`cdp.send`、`page.snapshot` 的 model feedback 超過 `evolutionObservationMaxChars` 時，才套用 deterministic observation compression；初始上限為 4,000 characters。保留 status、identity、error code、retryability、hash、受控 structural keys、scalar previews，以及存在時的 metrics。Durable run evidence 仍保存完整 action result；小型 observation 與先前 model feedback 維持 byte-equivalent。

### Consequences

- 三種高輸出 tool 的 per-action observation growth 受到限制。
- Durable evidence 維持完整且可獨立檢查。
- Summary 是 deterministic structural compression，不是 semantic claim。
- 若省略的細節很重要，model 可能需要要求更窄的 follow-up observation。

### Rollback/review trigger

若 compressed output 超過設定 budget、error identity 或 metrics 遺失、durable evidence 被修改，或 workflow 持續需要 structural summary 省略的欄位，應重新審查。

## ADR-024 — 依 evolution work state 選擇 model-turn timeout

**Status:** Accepted
**Date:** 2026-07-21

### Context

所有 evolution model turn 都沿用 direct-model 的 30 秒預設值。這個 budget 適合簡單 request，但長時間 analysis、code generation、verification turn 會反覆過期。Node、Page、CDP execution 已有獨立且受控的 timeout，不能由 model policy 靜默 replay 或延長。

### Evidence

失敗的 YOUTUBE-AOPass run 在 turn 18 超過 30,000 ms 後終止，雖然 adapter 已將 timeout 標記為 retryable。在本決策前，evolution IPC 會先塞入 30,000-ms default，導致 `EvolutionRunManager` 無法選擇 turn-specific budget。新的 regression tests 證明 manager 對連續的 analysis、code-generation、verification turn 分別傳入 90,000、120,000、180,000 ms，並在 event 與 `run.json` 記錄相同決策。

### Alternatives

- 所有 model turn 一律提高為固定的大型 timeout。
- 允許 model-generated text 選擇任意 timeout。
- 將 Page、CDP、Node action timeout 與 model inference 一起延長。

### Decision

Evolution model turn 使用 policy `blankseed-adaptive-timeout/0.1`：

- simple：30,000 ms；
- analysis：90,000 ms；
- code generation/correction：120,000 ms；
- verification：180,000 ms。

第一個 evolution turn 分類為 analysis。後續 turn 依上一個 broker action 與 status 分類：observation input 導向 code generation，Node/candidate test/invoke result 導向 verification，action failure 導向 correction。保留操作員明確指定的 `timeoutMs`，範圍為 1 到 300,000 ms。每次選擇都要在 model turn 前記錄。禁止修改 action timeout，也不加入 automatic retry。

### Consequences

- 長時間 inference 可取得符合 work state 的受控 budget。
- Direct non-evolution model call 保留既有 30 秒預設值。
- 操作員仍可提供明確且受控的 override。
- Timeout decision 可由 event 與 run evidence 重現。

### Rollback/review trigger

若 classification 持續選錯 work state、任何值超過 300,000 ms、明確 override 被忽略，或 policy 開始修改或 replay Page、CDP、Node、Module action，應重新審查。

## ADR-025 — 依 Module API v1.1 entry-point 優先順序解析 generated Module result

**Status:** Accepted
**Date:** 2026-07-21

### Context

Generated Node runtime 雖提供 CommonJS 形式的 `module` 與 `exports` object，卻只使用 `AsyncFunction(source)` 的 direct return value。Committed generated module 若透過 `module.exports.evaluate` 提供能力，source 仍可成功載入，但 implicit `undefined` normalize 後只會得到成功的 `null` result。原地修改既有 committed module 會違反 immutable version governance。

### Evidence

`youtube-aopass@1.0.0` 的 verified source hash 為 `sha256:dd90a4facd06c1ff1657cc030c63f908840164b186a5a1f1cb419a2f351bd8ec`；它匯出 `evaluate`，但沒有 top-level return。Focused contract tests 已證明 direct return、asynchronous `execute`、legacy `evaluate`、invalid-module error、優先順序，以及 undefined-result rejection。受治理的 migration 已建立、測試、提交並啟用 `youtube-aopass@1.0.1`；candidate test 與 real YouTube page invocation 都取得 structured result。

### Alternatives

- 強制所有 generated module 使用 top-level direct return。
- 原地修改 committed module source。
- 呼叫所有 exported function，再合併 result。
- 繼續把 implicit `undefined` 接受為成功的 `null` result。

### Decision

採用 Module Runtime API v1.1。完成 top-level source evaluation 後，只依下列順序 await 一個 result source：callable `module.exports.execute(context)`、callable `module.exports.evaluate(context.observation, context.environment)`，最後才是已定義的 direct return value。`context.observation` 依序從 `input.observation`、`environment.observation`、整個 environment 解析。Explicit `null` 仍然有效；缺少 entry point 或最終 result 為 `undefined` 時，以 structured code `MODULE_CONTRACT_INVALID` 失敗。既有 execution envelope 與 JSON serialization 規則不變。

允許 optional manifest fields `parentVersion` 與 `migrationReason`，並在 candidate、test、commit 狀態中完整保留。Corrective Module source 仍必須遵守 `candidate -> test -> commit -> activate`；不得重寫 committed version。

### Consequences

- 既有 direct-return module 繼續運作。
- Modern 與 legacy CommonJS module 取得 deterministic dispatch。
- Invalid generated source 不再因 implicit `undefined` 而以 silent `null` 成功。
- Migration lineage 可被檢查，不必修改既有 manifest schema identifier。
- Runtime compatibility 不代表 live website behavior 或 YouTube-AOPass 3/3 acceptance 已完成。

### Rollback/review trigger

若 `1.0.1` invocation 失敗，將 active Module mapping rollback 至 `youtube-aopass@1.0.0`。若優先順序破壞既有 direct-return module、context resolution 暴露非預期資料、undefined rejection 阻擋已記錄的有效 contract，或 manifest migration fields 在任何 lifecycle transition 中遺失，應重新審查或取代本決策。

## ADR-026 — 透過受控 layout 邊界調整控制介面與目標頁寬度

**Status:** Accepted
**Date:** 2026-07-21

### Context

Control renderer 與 native target `WebContentsView` 原本使用固定的 configured split。若只用 CSS 調整 renderer，native view bounds 會不同步，可能蓋住 divider 或控制內容。

### Evidence

Focused tests 證明 bounded layout calculation 與 `target.layout.changed` event。獨立 Electron smoke 使用真實 CDP mouse input，把 separator 從 500 px 拖至 640 px；完成後 renderer width、main-process layout、native target width 與 ARIA state 一致。

### Alternatives

- 只用 CSS 調整 control renderer。
- 讓 renderer 直接存取 native `WebContentsView`。
- 維持固定 configured split。

### Decision

透過 preload/IPC 提供一個明確的 resize operation。Main process 擁有被接受的 control-panel width，確保兩側至少各 320 px，更新 native view bounds，回傳 canonical layout，並記錄受控 event。Renderer 拖曳時可 optimistic update，但必須依回傳的 canonical width 校正。Accessible vertical separator 同時支援 pointer drag 與鍵盤 Arrow、Home、End 操作。Width 僅保留於目前 session。

### Consequences

- Resize 過程中 control 與 target panes 維持同步。
- Remote page 保持 sandbox isolation，不取得 Node 或 layout authority。
- 操作員可用滑鼠或鍵盤調整，且不會完全隱藏任一側。
- 新 session 從 configured default width 開始。

### Rollback/review trigger

若 native 與 renderer bounds 可能分歧、pointer capture 無法跨越 view boundary、accessibility state 過期，或 minimum widths 阻礙必要內容存取，應一併移除 separator 與 resize IPC。

---

## ADR-027 — 透過綁定 candidate 的 broker bridge 驗證 generated page behavior

**Status:** Accepted
**Date:** 2026-07-21

### Context

生成的覆蓋式廣告 candidate 透過不受支援的 `run()` export 回傳 installer string。Node-only candidate test 正確拒絕該 module；即使修正 Node result，也無法證明 installer 已在 remote page 執行，或之後能還原頁面。

### Evidence

受監督 Module Runtime 只接受 `execute`、`evaluate` 或 direct return。既有 isolated-world page broker 已能記錄 source hash、target identity、timeout、cancellation 與 page execution event，且不會讓 remote content 取得 Node。聚焦測試現已證明：tested candidate 會再次執行以產生四階段 plan，dispatcher 會在同一個 expected target identity 上依序執行 install、verify、uninstall 與 rollback verification。

### Alternatives

- 將 Node candidate test 視為 page behavior 的證明。
- Candidate test 後讓模型直接送出任意 installer 給 `page_execute`。
- 在 Node utility runtime 執行 generated page source。

### Decision

新增 `module_candidate_page_test`。它只接受 tested candidate ID，依既有 Module Runtime contract 再次執行已儲存 source，並要求回傳含有 `installSource`、`verifySource`、`uninstallSource` 與 `rollbackVerifySource` 的 `pageTest` descriptor。每個 script 都必須經既有 isolated-world page broker 執行，並回傳 `{ ok: true }`。dispatcher 會在 event pipeline 保留 candidate ID、source hash、plan execution ID、target identity、phase execution ID 與失敗資訊。

### Consequences

- Candidate provenance 持續與實際執行的 page code 綁定。
- Remote page 保持 `nodeIntegration: false` 的 sandbox。
- 成功 candidate test 不再能在缺少 install 與 rollback evidence 時被誤認為 page 成功。
- Candidate page test 可逆，不會 commit 或 activate module。

### Rollback/review trigger

若 bridge 可以執行非來自已儲存 candidate 的 source、遺失 target-identity check、install 後未嘗試 uninstall，或讓 remote renderer 取得 Node authority，應移除此 bridge 並重新審查。
