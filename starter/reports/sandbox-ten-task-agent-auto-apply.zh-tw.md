# Sandbox 十任務 Agent Auto-Apply 報告

> 本檔為 `sandbox-ten-task-agent-auto-apply.md` 的繁體中文 companion；英文原檔為權威來源。

## 結果

2026-07-20（Asia/Taipei）結果為 **PASS**。Deterministic Electron application run 已透過真實 preload／IPC／Main Process path 完成十項任務，使用無憑證 HTTP loopback model fixture 與 temporary workspace/data root。這不是真實模型評估，也不構成 OS security-sandbox claim。

## 範圍與證據

- 指令：`npm run verify:sandbox:ten-tasks`
- Tracked task 定義：`test/fixtures/sandbox-ten-tasks.json`
- Tracked runner：`scripts/runtime-sandbox-ten-tasks.mjs`
- 成功且由 Git 忽略的 evidence：`workspace/state/sandbox-ten-task-evidence/2026-07-20T11-15-22-543Z/summary.json`
- Model request：26 次
- Owned Electron 已關閉：是
- Evidence 封存後已移除 owned temporary runtime：是
- Workspace 與 data evidence 已封存：是

## 任務結果

| 任務 | 實際路徑 | 結果 |
| --- | --- | --- |
| TASK-01 | Page snapshot | PASS |
| TASK-02 | Isolated-world Page execution | PASS；heading `Fixture Page`、0 個 link |
| TASK-03 | CDP navigation history | PASS |
| TASK-04 | 受監督 Node execution | PASS；結果 `42` |
| TASK-05 | Module Store inventory | PASS；初始為空 |
| TASK-06 | Candidate、Test、Commit `1.0.0` | PASS |
| TASK-07 | Candidate、Test、Commit `1.1.0` | PASS |
| TASK-08 | Activate 與 Invoke `1.0.0` | PASS；結果 `41` |
| TASK-09 | 刻意 Node failure 與 correction | PASS；保留一次 failed action |
| TASK-10 | Proposer、Reviewer、policy Apply、Invoke `1.1.0` | PASS；結果 `42` |

TASK-10 產生 governance decision `gov_859f26a3-1a34-41d4-9364-ca2d7f55f69a`，狀態為 `applied`、authority kind 為 `agent-sandbox-policy`，safety Checkpoint 為 `chk_88d85e4d-56f5-49f5-ae9e-9b195ff5cb27`。最後 active mapping 是 `generated.sandbox.counter: 1.1.0`，且沒有 generated Runtime 留在執行中。

## 除錯發現

四次 fail-closed iteration 保留於系統 temporary directory：

1. `blankseed-sandbox-ten-tasks-H0lpK2`：注入 JavaScript 的 newline 格式錯誤。
2. `blankseed-sandbox-ten-tasks-aPn7Vb`：task request identifier 短於 protocol minimum。
3. `blankseed-sandbox-ten-tasks-nJU78h`：fixture server 在 scenario assertion 完成前就寫入 response header。
4. `blankseed-sandbox-ten-tasks-tcvNDn`：fixture 預期一個 link，但實際頁面為零；該次其餘 task run 均為 `ok`。

Runner 現在會在寫入 header 前先序列化 response，並安全處理已送出 header 的狀態。這些屬於 test harness defect，不是已接受的產品行為，失敗 evidence 也未被當成 PASS evidence。

## Auto-Apply 邊界

此能力預設停用。Main Process activation 必須同時符合：

- 明確設定 `BLANKSEED_SANDBOX_AGENT_AUTO_APPLY=1`；
- workspace 與 data root 位於同一個專用 `%TEMP%/blankseed-sandbox-*` root 下；
- model endpoint 為 HTTP loopback；
- decision 已 approve、由同一 session 的 hash anchor 綁定，且 Agent identity 不同；
- immutable committed `sourceHash`、expected active state、safety Checkpoint 與 compare-and-swap validation 均通過。

Profile 不可用時，auto-Apply request 會在 model call 前 fail closed。一般 Runtime 仍需要 Operator Apply。Sandbox profile metadata 明示 `hostFilesystem: not-isolated` 與 `securitySandbox: false`。

## Manual verification note

- Launch command：`npm run verify:sandbox:ten-tasks`
- Tested URL：owned loopback `http://127.0.0.1:<ephemeral>/fixture.html`
- Action：執行十項 fixture task，包含 governed Agent auto-Apply
- Expected：十項 PASS、最終 Module `1.1.0`、Invoke value `42`、zero remaining generated runtime、封存 evidence、owned Electron termination
- Actual：符合預期
- Checkpoint/evidence：上方列出的成功 ignored evidence path

## 限制

此測試只證明 deterministic policy 與 integration behavior；不證明 real-model quality、prompt-injection resistance、reviewer independence、operating-system layer 的 non-loopback egress control，也不證明 generated Node code 的 host filesystem containment。
