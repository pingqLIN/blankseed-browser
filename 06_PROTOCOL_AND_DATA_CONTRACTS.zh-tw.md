# 協定與資料契約 v0.1

> 本檔為 `06_PROTOCOL_AND_DATA_CONTRACTS.md` 的繁體中文 companion；英文原檔為權威來源。這些 contract 定義 infrastructure message，不是 semantic task/action vocabulary。

## Common envelope

```json
{
  "protocol": "blankseed/0.1",
  "sessionId": "ses_...",
  "requestId": "req_...",
  "executionId": "exe_...",
  "kind": "page.execute",
  "createdAt": "2026-07-12T12:00:00.000Z",
  "payload": {}
}
```

各 kind 的必要欄位不同，但 identifier 必須在 request、events 與 result 間保持穩定。

## Page／CDP execution

Page snapshot 指定 `maxTextChars` 與 `maxElements`。Page execution 提供 `source`、`worldId`、`timeoutMs`，由 broker 包成 async function 並在 isolated world 執行。

CDP request 提供 raw `method` 與 `params`。Research Mode 不需要 semantic method whitelist，但 broker 必須保存 method、params、target identity、result/error 與 detach state。

## Broker execution cancellation

```json
{
  "kind": "execution.cancel",
  "payload": {
    "executionId": "exe_optional"
  }
}
```

省略 `executionId` 會要求取消所有 active page/CDP broker execution。取消後 broker result lifecycle 以 `EXECUTION_CANCELLED` 結束；已在 Chromium 內開始的 page JavaScript 不保證立即停止。非預期 CDP detach 會被記錄，下一個獨立 CDP command 會嘗試一次重新 attach；因 raw CDP method 可能有 side effect，不會自動重播失敗 command。

## Generated Node execution

`node.execute` 提供 source、cwd、timeout 與 environment，在 separate generated runtime 執行，永遠不在 main process 執行。

## Result 與 error

Result 包含 protocol、session/request/execution ID、request kind、status、時間、duration、source hash、result/error。Infrastructure error code 包含：

- `INVALID_REQUEST`
- `DUPLICATE_REQUEST_ID`
- `TARGET_UNAVAILABLE`
- `TARGET_NAVIGATED`
- `SERIALIZATION_FAILED`
- `EXECUTION_TIMEOUT`
- `EXECUTION_CANCELLED`
- `PROCESS_EXITED`
- `PROCESS_KILL_FAILED`
- `CDP_ATTACH_FAILED`
- `CDP_DETACHED`
- `MODEL_ADAPTER_FAILED`
- `CHECKPOINT_FAILED`
- `MODULE_VERSION_CONFLICT`
- `RESTART_HEALTH_FAILED`

## Provider-neutral model action loop

Main process 可透過 `evolution.run` 執行有界的 model/action loop。Provider adapter 只負責自己的 wire-format encode/decode；Kernel 接收 normalized raw capability request，包含 `act_*` action ID、provider tool-call ID、raw tool name 與 JSON arguments。

固定 dispatcher 只暴露 page snapshot/execute、raw CDP、受監督 Node execution、module lifecycle 與 checkpoint 等 infrastructure family，不加入 summarize、translate、purchase 等 business-task verb。未知或 malformed tool 會成為 structured `INVALID_REQUEST` action result 並回送模型，不會被當成任意 IPC channel。

每個 run 建立 `evo_*` identity 與 pre-run checkpoint。Model turn、action、broker/runtime execution 和 module provenance 都帶 run/turn/action correlation identity。完整 `blankseed-evolution-run/0.1` manifest 存於：

```text
workspace/evolution-runs/<evolutionRunId>/run.json
```

Manifest 保存 input messages、redacted context/input hash、normalized model output、action request/result、checkpoint、source hash、metrics 與 terminal outcome。`maxTurns`、`maxActions` 與每回合 timeout 是可觀察的 infrastructure limit，不是 semantic capability whitelist。

目前 local bound 另限制單一 normalized action result 最多 1 MiB、單一 run manifest 最多 16 MiB。Oversized action result 會成為包含 size/hash 的 structured error；run 到達 manifest budget 時會停止後續 dispatch，並以 evidence-truncation error 關閉最後一份完整 manifest，不寫入無界或無效 artifact。

Loopback OpenAI-compatible encoder 會實際傳送 packaged operational context，接受 `content: null` 的 tool-only assistant message，不送 Authorization，並在 tool result 保留 `tool_call_id`。Hosted credentials 與 non-loopback transport 仍不屬於此 contract。

## Module manifest

Manifest 使用 `blankseed-module/0.1` schema，保存 id/version/description/entry/runtime/createdAt/sourceHash/provenance/dependencies/tests/status。Runtime 後續可包含 page、node、hybrid 與 ui。

## Event record

每行保存一個 JSON object，包含 event ID、sequence、session/request/execution ID、可選的 evolution run/turn/action correlation ID、type、timestamp 與 data。

## 持久化去識別邊界

Event Store append、受監督 execution 寫入 experiment artifact、evolution 或
Multi-Agent run 寫入 run.json、governance decision 寫入，以及 Checkpoint
label 寫入前，Runtime 都會先建立去識別化副本。即時 tool result、記憶體中的
execution envelope、提供給模型的 observation 與同 session governance anchor
不會被改寫；此邊界只作用於 durable evidence。

在此邊界中，所有非本機 HTTP(S) target 預設都視為敏感。管線會以固定標記
取代 host、path、query 與裸露 host reference。若 object 含有這類 target，
title、text、DOM/HTML、accessible name、label、message 與 nested element
name 等 page-content field 都會改成 page-content 標記。去識別 metadata 不會
保存可逆 target hash，也不會保存原始 target。

Loopback 與 fixture address 仍可檢視：localhost、IPv4/IPv6 loopback、
*.localhost、*.test、*.invalid 與 example.com/example.net/example.org。發生
去識別時，object artifact 會取得 persistenceRedaction 計數。受監督 execution
也會在 experiment files 旁寫入可檢查的 redaction.json receipt；其中只包含
file name 與彙總計數。
若 Event Store data 無法安全檢查，會寫入僅含 metadata 的 failed_closed record，
不會寫入原始值。
若 experiment source file 被去識別，sourceHash 仍代表實際執行的原始 source；
receipt 會明確說明保留的 source file 是 evidence copy，無法重建可供 hash 驗證
的 executable。

新的 `blankseed-multi-agent-run/0.2` 與
`blankseed-governance-decision/0.2` artifact 會把相同邊界套用到 task、
proposal、handoff、review、error 與 nested evolution-result evidence。
`task`、`proposalContent`、review `reason` 等 narrative field 若識別外部 target，
會依 page-content field 處理。磁碟上的 governance file hash 綁定去識別版本；
同 session Main Process anchor 則保留原始 proposal、review 與 evidence hash，
供 authorization check 使用。持久化的 integrity hash 代表完整原始 evidence，
不是 target-only hash，也無法重建已移除內容。歷史 v0.1 artifact 不會被追溯
改寫。

此邊界不會改寫 generated Module candidate source 或 committed Module artifact，
因為改寫 executable source 會使 source hash 失效，也會改變待審查 capability。
candidate-source admission policy 必須另行決策，不是 evidence redaction 的隱含
副作用。

Checkpoint state 另有比文字去識別更嚴格的最小化邊界：新寫入的 v0.3
Checkpoint 只會從目前 status 投影出已宣告可還原的 mapping，絕不序列化完整
status object。因此它不會保留 `target`、page content、configuration、browser
state、credentials、events、Module files、Git state 或 external effects。為了
rollback 相容，既有 v0.2 file 仍可讀取，但系統不再建立新的 v0.2 file，也不會
追溯改寫舊 artifact。

## Checkpoint manifest

新 Checkpoint 使用 `blankseed-checkpoint/0.3`，保存 checkpoint ID/label/time、
app version、明確 `restoreScope`、`excludedState`、以及唯一可還原的
`state.modules.active` mapping 與 `stateHash`。v0.3 的 `state` 不得出現其他
key。label 含有外部 target 時會改成 page-content marker，並加入彙總的
`persistenceRedaction` metadata。

v0.2 僅作為 read-only compatibility schema：驗證通過後仍可還原其
`modules.active` mapping，但系統不會再寫入 v0.2 Checkpoint。

## Limits

IPC payload、page source、execution timeout、stdout/stderr retention、event rotation、snapshot limits、evolution turn/action limits 與 action-result/run-evidence byte budget 都應是可設定且有紀錄的 infrastructure values，不得暗藏。這些限制不定義 AI 能建立哪些 semantic function。
