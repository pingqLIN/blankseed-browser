# BlankSeed Agent Runtime Reliability Upgrade v0.1 - 最終 Gate 報告

> 英文原檔為權威來源：`runtime-reliability-v0.1-final.md`。本檔為方便人工閱讀的繁體中文對照版。

## 狀態

**INCOMPLETE。** Runtime Reliability Phase 0-4 均已通過，既有 YOUTUBE-AOPass checkpoint 也已成功 restore；但最後的 live YouTube 驗收沒有達到 3/3 detect/skip/recover。受控 session 雖出現一次真實廣告，卻沒有出現原生 skip control。

## 權威來源與範圍

- 任務來源：`E:\miles\Downloads\AGED.md` 與 2026-07-21 操作員要求。
- 有效治理：global/repository `AGENTS.md`，以及 `dev-workflow-scale-planner` workflow。
- Repository：`D:\OneDrive\Documents_cloud\BlankSeed Browser`。
- 實作風險：L2、可回復的本機 source/test/documentation 修改。
- Runtime recovery 風險：L3、具明確確認的 checkpoint restore，以及對既有 tested candidate 的 confirmed commit/activation。沒有 public exposure、credential persistence、push、release 或 deploy。

## Phase 結果

| Phase | 結果 | 證據 |
| --- | --- | --- |
| 0 - Safety Freeze | PASS | Git ref `refs/codex-checkpoints/before-runtime-reliability-v0.1-20260721T143000+0800`、object `14879098a35fbddc5eef1e5000514fedf90eaf73`，以及三個有 SHA-256 記錄的 archive。 |
| 1 - Error State Preservation | PASS | Retryable model error 與 returned/thrown action error 都保留 `code`、`retryable`、`checkpointId`、`turnId`、`actionId` 與受控 cause metadata；retry decision 不會自動執行。 |
| 2 - CDP Session Recovery | PASS | 精確匹配 invalid session、僅對 broker-owned attachment 執行 detach/reattach、最多 replay 一次、第二次失敗乾淨結束，externally owned attachment 則 fail closed。 |
| 3 - Observation Compression | PASS | Oversized Node/CDP/DOM feedback（包含 adversarial metadata）都受控於 4,000 characters；durable evidence 在既有每筆 1 MiB cap 內維持未壓縮。 |
| 4 - Adaptive Timeout | PASS | 可稽核的 30/90/120/180 秒 policy、明確 override、IPC omission、transcript/event 持久化，且沒有 automatic retry。 |

修正後的兩位低階 reviewer 都沒有提出 Critical 或 Warning。Focused tests 為 28/28；isolated full suite 為 105/105。

## 主要工作樹驗收

```text
npm run check
Checked 60 project JavaScript files; baseline configuration is valid.
Checked 24 required Traditional Chinese document companions.

npm test
tests 212, pass 212, fail 0
```

212 的數字包含主要工作樹的 107 tests，以及位於 `starter/workspace` 下 nested isolated worktree 被再次 discovery 的 105 tests；兩套都全部通過。`git diff --check` 也通過。

## 既有 checkpoint resume

失敗 run 的 evidence 指定 `chk_c9d31a45-589e-4a36-87f2-dfab034834c2` 為 label「建立 YouTube-AOPass 前」的 checkpoint。已確認其 `restorable: true`、schema 為 `blankseed-checkpoint/0.2`、state hash 為 `sha256:11b38100410d22cbd8919104abdb406b68e0a635dfab1e8a707e38087d7ad21b`，restore scope 只包含 `modules.active`。

Confirmed restore 已完成 transition `rst_c5b59752-bd27-4f5c-8585-7681ef705ded`，並建立 safety checkpoint `chk_c99a66bf-33ab-46be-8d22-d4747d550797`。過程中停止或取消的 active operation 數量為 0。

本次沒有重新建立 module。既有 tested candidate `cand_81bbf172-3125-4099-9ec2-1af1ba399616` 只 commit 一次，並 activate 其 immutable version：

- module：`youtube-aopass@1.0.0`
- source hash：`sha256:dd90a4facd06c1ff1657cc030c63f908840164b186a5a1f1cb419a2f351bd8ec`
- 最終 active mapping：`{ "youtube-aopass": "1.0.0" }`

## Live YouTube 驗收

Resume run `evo_e63290de-ac40-41bd-b85a-cf6d30835ff6` 完成 6 turns／5 actions，action failure 為 0。它確認 active module 目前透過 `module.invoke` 只回傳 `result: null`，原目標 session 也沒有投放廣告。

最後的 bounded availability run `evo_dd73f027-5491-4f38-a3cb-8c9124bb28ec` 完成 8 turns／7 actions，action failure 為 0，也沒有任何禁止的 module mutation action。Evidence：

- path：`starter/workspace/evolution-runs/evo_dd73f027-5491-4f38-a3cb-8c9124bb28ec/run.json`
- SHA-256：`78AFA16DB8B45201241C63F841AC39EB91CF34DA65141182FF0AB3866242788F`
- timeout policy：`blankseed-adaptive-timeout/0.1`；實際 decision 包含 90,000 ms analysis、120,000 ms code-generation 與 30,000 ms simple turn。

實際結果：

| Test | 結果 | 實際證據 |
| --- | --- | --- |
| 1 - detect | PASS | 在 `dQw4w9WgXcQ` 上連續觀察到約 3.1 秒的真實 ad marker。 |
| 2 - native skip | INCOMPLETE | 沒有出現 visible、enabled 的原生 skip control，因此沒有發出 click。 |
| 3 - 三次 detect/skip/recover cycle | INCOMPLETE，0/3 | 一次廣告自然結束並繼續原片；另外兩個 bounded URL 沒有投放廣告，沒有完成任何 skip cycle。 |

Evolution run 的 `status: ok` 只代表 Runtime 沒有失敗地完成該 run，不能把 `UNKNOWN/INCOMPLETE` 的驗收結論轉成 PASS。

## Manual runtime verification note

- Launch command：使用 `starter/node_modules/electron/dist/electron.exe`、隨機 loopback `--remote-debugging-port`、繼承的 memory-only environment credential，以及 BlankSeed default user-data。
- Tested URLs：restore 後的原目標，加上 `dQw4w9WgXcQ`、`9bZkp7q19f0`、`kJQP7kiw5Fk` watch page。
- Action：restore checkpoint、activate 既有 immutable module、執行兩次 bounded evolution validation、觀察真實 ad state，只有在 enabled native skip control 出現時才允許 click。
- Expected：三次真實 detect/skip/recover cycle。
- Actual：一次真實廣告偵測、零次 native skip click、零次完整 cycle；沒有 seek、修改 playback rate、阻擋 request、移除 element 或 unrelated click。
- Relevant evidence：上述兩個 evolution run manifest、checkpoint transition `rst_c5b59752-bd27-4f5c-8585-7681ef705ded`，以及 event sequence 1308-1314。

既有 WP10 runtime smoke 可啟動 Electron，但等待 UI v2 的 `committed status label` 時逾時；WP11 smoke 則含有過時的 high-risk allowlist 假設。針對 WP11 smoke 的暫時診斷修改已完整撤回。這兩個 failure 都沒有被當成 acceptance evidence。

## 檔案與狀態

Source change 限定在 evolution loop、CDP broker、adaptive timeout policy、IPC/config wiring、contracts、focused tests、Decision Log 與成對報告。既有 UI v2 修改都已保留，包含重疊的 `ipc-router.cjs` 與 `contracts.cjs` hunks。

Runtime state 現在另含 committed `youtube-aopass@1.0.0`、active mapping、兩個新 evolution run manifest、checkpoint transition、safety checkpoint 與 event record。沒有刪除檔案，也沒有 commit、stage、push、PR、release 或 deploy。

## Rollback 與剩餘 blocker

- Code rollback：取得 destructive-action 明確核准後，使用 Phase 0 Git checkpoint ref 與 SHA-256-recorded archive。
- Active module 回復為 YOUTUBE 前 mapping：以明確確認 restore `chk_c9d31a45-589e-4a36-87f2-dfab034834c2`。Committed module file 保持可檢查，不會刪除。
- 剩餘 blocker：bounded run 內的 live YouTube ad inventory 沒有提供 native skip control，也沒有三次完整 cycle；既有 module source 經 `module.invoke` 目前只回傳 `null`。後續驗收需要真實 skippable ad availability，或另行明確授權修正既有 module execution contract；兩者都不能用推論當成 PASS。
