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
