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

## Checkpoint manifest

保存 schema、checkpoint ID/label/time、app version、target、configuration hash、module versions、event sequence 與選擇性的 Git identity。

## Limits

IPC payload、page source、execution timeout、stdout/stderr retention、event rotation、snapshot limits、evolution turn/action limits 與 action-result/run-evidence byte budget 都應是可設定且有紀錄的 infrastructure values，不得暗藏。這些限制不定義 AI 能建立哪些 semantic function。
