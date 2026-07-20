# BlankSeed Browser Security Model

> 本檔為 `SECURITY_MODEL.md` 的繁體中文 companion；英文原檔為權威來源。

## 目的與 security claim

BlankSeed Browser 研究 self-extending Agent behavior，同時維持 execution 可觀察、具版本 identity，並保留 recovery path。目前 security model 是圍繞實驗性 local Runtime 的 defense in depth；它**不宣稱** generated Node code 已受到安全 sandbox 保護或不會造成危害。

目標是在不導入 semantic task whitelist 的前提下，降低 silent authority change、保留 evidence，並提供 bounded recovery path。

## Protected assets 與 trust boundaries

Protected assets 包含：

- 固定 Kernel 與 trusted UI 的 integrity；
- 任意 remote content 與 Node、Electron authority 之間的 isolation；
- generated Module source 與 version 的 identity、integrity；
- Node Runtime、Browser Target 與 control console 的 availability；
- chronological execution、validation、activation 與 recovery evidence；
- generated Node code 可存取的 local workspace 與 host resource。
- Main Process 持有的 hosted model provider credential。

Main Process 與 local application source 屬於 trusted。Remote Target、generated source、model output、Module Candidate 與 external page data 都是 untrusted input。Committed 或 active Module 代表已被 version 與 selection，不代表自動成為安全可信。

## Threat Model

### Generated code risk

Generated Node source 可能失敗、hang、消耗 resource、存取可達的 host resource、啟動 child process，或產生不希望的 side effect。Page source 或 CDP command 可能修改 Target、將 page context 已可取得的資料外傳，或在 caller 停止等待後仍讓 Chromium work 持續執行。

Process separation、timeout 與 evidence collection 可降低 impact 並改善 diagnosis，但不構成完整 capability sandbox。

### Uncontrolled Module growth

Agent 可能建立重複 Candidate、造成 version churn、Activate 未經 review 的 Module，或讓 provenance 過大、難以稽核。即使每次 operation 各自成功，storage growth 與不明確的 capability ownership 仍會降低 recovery 與 governance 的可靠度。

因此 lifecycle 將 Candidate、Test、Commit、Activate、Invoke 與 Rollback 分離，並要求穩定 identity 與保留 evidence。

### Runtime failure

Node Runtime、Target renderer、CDP attachment、Main Process 或 local model transport 可能 timeout、crash、detach 或失去回應。Stop request 也可能不同於 confirmed termination，external effect 可能在 invocation failure 後繼續存在。

Runtime failure 必須以 observable event 與 normalized result 表達。Recovery 不得假設取消 result 就會自動復原已完成的工作。

### Remote content 與 instruction risk

Remote page 是 untrusted content，可能嘗試影響 Agent、觸發不安全 Page behavior，或利用 browser functionality。它不得取得 Node integration、trusted UI object 或 IPC 的直接 access。

### Evidence 與 identity loss

缺少 source hash、request 或 execution identity、Test result、activation history 或 environment identity，可能讓 run 無法重現。因此 silent evidence loss 是 security 與 governance failure，不只是 logging defect。

### Hosted credential 與 egress risk

若 provider key 被 generated Node code 繼承、由 Renderer IPC 接受、寫入 event，或送往非 allowlisted endpoint，就會跨越 trust boundary。Redirect 也可能把 Authorization header 帶離預期 origin。Hosted context 是 external data transfer，必須限制在使用者要求的 Agent operation 範圍內。

## Control Mechanism

### Candidate isolation

Candidate source 分開儲存在 `workspace/modules/.candidates/`，預設為 inactive。Candidate creation 不會改變 active Module mapping。Test execution 仍會執行 generated Node code，並可能影響可達的 host resource；這是 lifecycle isolation，不是 security sandbox。

### Validation gate

Module Store 要求 Test 成功後才能 Commit。Test 會記錄 execution result 並與 Candidate 關聯；Commit 會再次驗證 source hash。目前 built-in gate 是 execution-oriented，不得解讀成 semantic safety、dependency safety 或 policy approval 的證明。

### Version control

Committed Module version 具有穩定 Module `id`、semantic `version` 與 `sourceHash`。重複 committed version 會被拒絕，Activate 或 Rollback 只能選擇既有 committed manifest。這提供 immutable local identity，但不等於 publisher authentication 或 signed supply chain。

### Checkpoint

Checkpoint creation 會擷取目前 application state、active Module metadata、Target state、configuration，以及 Runtime status 可取得的 version identity。Evolution run 會建立 pre-run Checkpoint，並在 run evidence 中保留其 identity。

Checkpoint Store 實作的是刻意收斂的 restore API。operator 必須確認 restore；owned work 必須先停止；state hash、application version、committed manifest 與 Module source hash 都必須通過驗證；並先建立 safety Checkpoint。Restore 之後以 atomic compare-and-swap 只還原完整 active Module mapping，不宣稱能反轉 application source、Target navigation、browser storage、configuration、credentials、events、operating-system state 或 external effects。

### Rollback

Module Rollback 將 active mapping 切換至指定的舊 committed version，並記錄 transition。Runtime stop/kill control 可終止受監督的 Node execution；另行治理的 Git/worktree procedure 則可用於 application source recovery。

以上機制都不會自動逆轉 network request、remote page change，或 code 已修改的 host file 等 external side effect。

### Broker 與 event pipeline

Page、CDP、Node、Module、model、evolution 與 Checkpoint operation 使用 observable broker 或 shared event pipeline。Sender validation、payload validation、structured result envelope、source hash、execution limit 與 correlation identity，可限制 hidden behavior 並支援 review。

### Remote content isolation

Target `WebContentsView` 使用 `nodeIntegration: false`、`contextIsolation: true` 與 `sandbox: true`。Page code 在 isolated world 執行，Target 不會取得 trusted preload API。Target `webContents` 會隨 owner 明確銷毀。

### Hosted provider boundary

Hosted OpenAI request 固定使用官方 HTTPS Responses endpoint 與一個已設定的 GPT-5.6 adapter identity。Main Process 把 `OPENAI_API_KEY` 注入 Authorization header；Renderer/model payload 會拒絕 secret-shaped field。Redirect 一律拒絕，明確使用 `store: false`，event 只保留 provider/model/origin/response identity、usage、hash 與 redacted decision metadata。Generated utility process 使用 explicit environment allowlist，排除 provider key 與無關 environment variable。

## Failure containment 與 recovery order

優先使用影響最小且適用的 control：

1. cancel active model turn 或 evolution dispatch；
2. cancel pending Page/CDP broker result lifecycle；
3. stop 並確認 generated Node Runtime 已終止；
4. disable 或 Rollback active Module version；
5. 必要時關閉或重建 Browser Target；
6. 檢查 Event Timeline 與相關 Checkpoint；
7. 對 source change 使用受治理的 Git/workspace recovery procedure。

停止 execution 與復原 version selection 是不同動作。Operator 必須分別驗證 termination 與最後 active state。

## Current limitations

- Generated Node execution 不是 capability sandbox。
- Candidate Test 不是完整 security review。
- Module growth 尚無 quota、review quorum 或 garbage-collection policy。
- Checkpoint restore 僅限通過 integrity check 的 active Module mapping。
- Module version 具有 local hash，但沒有 signature 或 publisher authentication。
- Rollback 無法逆轉 external side effect。
- Policy decision 仍屬於 model output 之外的 operator/governance responsibility。
- Hosted transport 本身不等於 data-loss-prevention policy，也不授權傳送與 task 無關的 local content。

## Future Extension

### Permission system

未來 permission system 可針對 filesystem、process、network、Target 與 persistence operation 表達 least-privilege grant。Grant 應附著於 versioned capability identity，並產生可 review 的 event。Permission 不得只由 generated text 或 Test success 推斷。

### Capability sandbox

未來 capability sandbox 可依 experiment profile 加入 OS、container、VM、process-token、network、filesystem 與 resource isolation。它必須清楚說明實際阻止哪些 host effect，並保留既有 broker 與 evidence model。

### Policy engine

未來 policy engine 可評估 Candidate provenance、Test evidence、requested permission、compatibility 與 activation context。Policy outcome 應明確、具版本、可解釋，並與產生 Candidate 的 Agent 分離。

### Registry 與 governance controls

Skill Registry、Capability Marketplace 與 Multi-Agent Governance 可加入 publisher identity、signature、review quorum、revocation、retention policy、compatibility declaration 與 activation authority。這些 control 應建立在 Candidate isolation 與 immutable Commit identity 上，而不是繞過它們。

## Security invariants

1. Remote content 永遠不取得 Node integration。
2. Generated code 不直接在 Main Process 執行。
3. Candidate、Commit 與 Activate 維持獨立 transition。
4. Test evidence 是必要條件，但不等於 trust。
5. 每個 active Module 都解析到明確 committed version 與 source hash。
6. Stop、Rollback 與 Checkpoint 是三種 claim 不同的 control。
7. Failed code、validation result、error 與 recovery action 維持可檢視。
8. Hosted credential 只留在 Main Process，不進入 generated Runtime environment、Renderer IPC payload 或 retained evidence。
