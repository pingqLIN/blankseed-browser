# BlankSeed Module Runtime Contract Upgrade v1.1 — 最終報告

> 英文原檔為權威來源：`module-runtime-contract-v1.1-final.md`。本檔為供人閱讀的繁體中文 companion。

## 狀態

- Runtime Contract：`PASS`
- `youtube-aopass@1.0.1`：`CREATED`
- Candidate test：`PASS`
- Activation：`ACTIVE`
- YouTube-AOPass 3/3 acceptance：`NOT CLAIMED`

## 1. 問題說明

Generated Node runtime 雖提供 CommonJS 形式的 `module` 與 `exports` object，卻只使用 `AsyncFunction(source)` 的 direct return value。`youtube-aopass@1.0.0` 透過 `module.exports.evaluate` 提供能力，因此 source 能成功載入，但 implicit `undefined` 會被 normalize 成成功的 `null`。Agent 無法檢查 detection state 或 action proposal。

## 2. Root cause

Module Store 已正確載入並依 hash 驗證 committed source；不一致發生於 generated runtime result contract：

```text
module.invoke
  -> 執行 source
  -> 忽略 module.exports.evaluate
  -> implicit undefined
  -> normalize 成 null
```

這是 runtime compatibility defect，不是 source integrity、loader、checkpoint 或 YouTube discovery failure。

## 3. Runtime contract 設計

Module Runtime API v1.1 只執行 source 一次，再依下列順序選擇一個 result source：

```text
module.exports.execute(context)
  > module.exports.evaluate(context.observation, context.environment)
  > direct return value
```

`context.observation` 依序從 `input.observation`、`environment.observation`、整個 environment 解析。Runtime 會 await 被選中的 entry point。Explicit `null` 仍有效；缺少 entry point 或最終 result 為 `undefined` 時，產生 structured `MODULE_CONTRACT_INVALID`，不再回報由 implicit `undefined` 造成的成功 silent `null`。

Module Store 也會保留 optional manifest fields `parentVersion` 與 `migrationReason`，但不變更既有 schema identifier。

## 4. 修改檔案

本任務 source 與 test：

- `starter/src/utility/agent-runtime.cjs`
- `starter/src/main/module-store.cjs`
- `starter/test/agent-runtime-contract.test.mjs`
- `starter/test/module-store.test.mjs`
- `starter/scripts/runtime-module-contract-v1.1-governance.mjs`
- `starter/src/shared/contracts.cjs`
- `starter/src/preload/preload.cjs`
- `starter/src/main/ipc-router.cjs`
- `starter/src/main/target-view.cjs`
- `starter/src/renderer/index.html`
- `starter/src/renderer/styles.css`
- `starter/src/renderer/app.js`
- `starter/test/target-view-layout.test.mjs`
- `starter/scripts/runtime-workspace-resizer-smoke.mjs`

Contract、governance 與 discovery documentation：

- `MODULE_RUNTIME_CONTRACT.md`
- `MODULE_RUNTIME_CONTRACT.zh-tw.md`
- `09_DECISION_LOG.md` — 保留既有修改並附加 ADR-025
- `09_DECISION_LOG.zh-tw.md` — 附加繁中 ADR-025 companion
- `KEY_DOCUMENTS.zh-tw.md`
- `starter/scripts/check-doc-companions.mjs`
- `starter/reports/module-runtime-contract-phase-0.md`
- `starter/reports/module-runtime-contract-phase-0.zh-tw.md`
- `starter/reports/module-runtime-contract-v1.1-final.md`
- `starter/reports/module-runtime-contract-v1.1-final.zh-tw.md`
- `starter/reports/module-runtime-contract-v1.1-governance.json`
- `starter/reports/ui-v2/workspace-resizer-smoke.json`
- `starter/reports/ui-v2/qa-workspace-resizer.png`

Runtime state 只透過受治理的 Module Store 與 checkpoint API 變更；既有不相關 dirty files 均保留。

## 5. Test 與 verification

### Automated contract tests

Focused runtime 與 Module Store suite：`10/10 PASS`。

涵蓋：

1. direct return object；
2. asynchronous `module.exports.execute`；
3. legacy `module.exports.evaluate`；
4. invalid module structured error；
5. `execute > evaluate > return` 優先順序；
6. selected entry point 回傳 `undefined`；
7. optional migration metadata persistence；
8. 既有 Module Store immutability、activation、rollback 與 restore 行為。

Workspace divider focused suite：`4/4 PASS`，涵蓋 width clamping、受治理的 native-view bounds 變更、layout event evidence，以及既有 target-overlay 行為。

完整 `npm test`：`221/221 PASS`。Node 預設 test discovery 也會走訪既有 `starter/workspace/source-evolution/worktrees/runtime-reliability-v0.1` worktree，因此 unchanged baseline suites 會出現兩次；新的 runtime-contract、migration-metadata 與 layout tests 只存在於目前 worktree。

最終必要 validation：

- `npm run check`：將 documentation companion 納入 gate 後為 `PASS`。
- `npm test`：`221/221 PASS`。
- `git diff --check`：完成最終 documentation 後為 `PASS`。

### Manual/runtime verification note

- Launch command：`node scripts/runtime-module-contract-v1.1-governance.mjs`，之後以沒有 remote-debugging flag 的正常 `electron.exe .` 啟動。
- Tested URL：`https://www.youtube.com/watch?v=Yppak4lbl6Y&t=33s`。
- 執行動作：重用既有受治理的 CDP observation expression，normalize real page observation，呼叫 active module；只有 module 提出 `click-native-skip` 且原生 skip control visible、enabled 時，才允許 CDP click。
- Expected：`module.invoke` 回傳 structured result，不再出現 defect 的 silent `null`。
- Actual：structured `{ state, action: null, success: false }`；當時沒有廣告或 native skip control，因此未發出 CDP click。
- Evidence：`starter/reports/module-runtime-contract-v1.1-governance.json` 與 checkpoint `chk_b746dde1-c732-49b3-a44b-6d0552075a0b`。

### Workspace divider runtime verification note

- Launch command：使用獨立 temporary data、workspace 與 user-data roots 執行 `node scripts/runtime-workspace-resizer-smoke.mjs`。
- Tested surface：Electron control renderer 與相鄰的 native `WebContentsView`。
- 執行動作：使用真實 CDP mouse input，在 500 px 位置按下 separator，向右拖曳 140 px 後放開。
- Expected：control renderer、separator accessibility value、main-process layout 與 native target bounds 一致，且左右兩側至少各保留 320 px。
- Actual：控制介面由 500 px 變為 640 px，target width 為 846 px；separator 提供 `role="separator"`、`aria-valuenow="640"` 與對應繁中 value text。
- Keyboard support：Arrow keys 每次調整 16 px，Shift+Arrow 調整 48 px，Home/End 移至安全界線。
- Evidence：`starter/reports/ui-v2/workspace-resizer-smoke.json` 與 `starter/reports/ui-v2/qa-workspace-resizer.png`。

## 6. Migration 狀態

受治理的 lifecycle 已依序完成：

```text
candidate -> test -> checkpoint -> commit -> activate -> invoke
```

- Candidate：`cand_9021ca44-f7e4-46cb-b57b-be5cce53d084`
- Candidate test：`PASS`，取得 structured non-null result
- Pre-activation checkpoint：`chk_b746dde1-c732-49b3-a44b-6d0552075a0b`，記錄 active mapping 為 `1.0.0`
- Commit：`youtube-aopass@1.0.1`
- Activate：previous `1.0.0`，current `1.0.1`
- Live invoke：`status: ok`，取得 structured non-null result

## 7. youtube-aopass version 狀態

`youtube-aopass@1.0.0` 維持不變且為 committed：

```text
sha256:dd90a4facd06c1ff1657cc030c63f908840164b186a5a1f1cb419a2f351bd8ec
```

`youtube-aopass@1.0.1` 已 committed 且 active：

```text
sha256:d42ca8d31384617d1e43dbe8caff7281ca6465c319b23bc00616a194e16e6255
parentVersion: 1.0.0
migrationReason: runtime contract compatibility
```

新 source 保留原 detection 與 action logic，只加入正式 `execute(context)` compatibility adapter。

## 8. 剩餘 blocker 與 limitation

- Live page 當時沒有廣告，也沒有 native skip control；本次 bounded run 因此未觀察到 `ad-detected`、`skip-ready` 或 `click-native-skip`。
- CDP action stage 已驗證為受治理且 conditional；因沒有 action proposal，所以未發出 click。
- 本任務證明 Module Runtime contract 與 migration chain，不滿足也不宣稱 YouTube-AOPass 3/3 live acceptance。
- Divider width 僅保留於目前 session；新 app session 會從 configured default width 開始。
- 兩次 post-launch probe 的廣域 PowerShell process/filesystem discovery 逾時；改用窄範圍 PID、window、port 與 canonical active file 查詢後均成功。直接正常 `electron.exe .` fallback 有回應，沒有 temporary CDP port 正在監聽，active mapping 維持 `1.0.1`。

## Rollback

使用受治理的 Module rollback operation 重新啟用 `youtube-aopass@1.0.0`。上述 pre-activation checkpoint 是次要 active-mapping recovery path。不得刪除 committed `1.0.1`，也不得原地修改任一 committed version。
