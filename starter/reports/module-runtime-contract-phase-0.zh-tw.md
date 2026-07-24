# Module Runtime Contract Upgrade v1.1 — Phase 0 安全基線

> 英文原檔為權威來源：`module-runtime-contract-phase-0.md`。本檔為供人閱讀的繁體中文 companion。

## 證據狀態

- `VERIFIED`：Git branch 為 `codex/ui-v2-hardening`，HEAD 是 `2fe07a107086f47157eb893472ff3dd08cd9f4ed`。
- `VERIFIED`：本任務修改檔案前已盤點既有 dirty worktree；這些修改均保留，且不會被算成本任務產出。
- `VERIFIED`：`starter/workspace/state/active-modules.json` 將 `youtube-aopass` 對應至 `1.0.0`。
- `VERIFIED`：BlankSeed application data root 中共有 16 個既有 application checkpoint；沒有 checkpoint 被修改或取代。
- `VERIFIED`：`youtube-aopass@1.0.0` 是 Module Store 的 committed version，其 manifest 與實際 source 均對應以下 source hash。

```text
sha256:dd90a4facd06c1ff1657cc030c63f908840164b186a5a1f1cb419a2f351bd8ec
```

## 目前 Runtime contract

Generated Node runtime 透過 `AsyncFunction` 執行 source，且只使用該 function 的直接回傳值。目前 implicit `undefined` 會被 normalize 成 `null`。Runtime 雖提供 CommonJS 形式的 `module` 與 `exports` object，但 source 執行後不會檢查或呼叫其中匯出的 entry point。

## 目前 Module contract

`youtube-aopass@1.0.0` 將含有 `evaluate`、`normalize` 與 `metadata` 的 object 指派給 `module.exports`。它不會直接回傳值，也沒有匯出 `execute`。既有 ad detection 與 native-skip proposal 行為位於 `evaluate(observation, state)`。

因此產生以下不一致：

```text
module.invoke -> 載入 source -> source 回傳 undefined -> undefined 被 normalize 成 null
```

## 不可變性評估

`youtube-aopass@1.0.0` 透過 Module Store 維持邏輯上的 immutable：

- 位於 `modules/youtube-aopass/versions/1.0.0`，status 為 `committed`；
- `commitCandidate` 會拒絕已存在的 version directory；
- invocation 會依 manifest 驗證 persisted source；
- 實測 source hash 與 manifest 一致；
- 本任務不會修改該 version directory、manifest、source 或原始 checkpoint。

此處不宣稱 filesystem permission 構成 immutability boundary；有效證據是已驗證的 Module Store 檢查與保留的 hash。

## 風險評估

- L2：範圍受控的 runtime source、test 與 documentation 修改。
- L3：Module Store candidate／test／commit／activate，以及實際需要時的 application runtime restart。
- 主要 compatibility 風險：破壞 direct-return 行為，或傳錯參數給 legacy `evaluate` module。
- Governance 風險：candidate test 未通過就 activate `1.0.1`，或未保留 `1.0.0` 作為 rollback target。
- Evidence 風險：把 synthetic observation 當作 live YouTube acceptance。Synthetic fixture 只能用於 contract regression test，不能作為 Phase 6 acceptance。

## Rollback 方法

1. 保留 `youtube-aopass@1.0.0` 與所有既有 checkpoint，不做修改。
2. 對本任務開始前為 clean 的檔案，以 pre-task Git blob 作為 rollback baseline；若檔案原本已有使用者修改，只反向移除本任務的 scoped additions。
3. Activation 前新增 application checkpoint，記錄 active mapping `{ "youtube-aopass": "1.0.0" }`。
4. 若 `1.0.1` activation 或 invocation 失敗，使用受治理的 Module Store rollback operation 重新啟用 `1.0.0`；pre-activation checkpoint 是次要的 active-mapping recovery path。
5. 不刪除 committed `1.0.1`；保留 immutable version history，後續修正以新 version 取代。

## Phase 0 決定

分析與修改前安全狀態為 `PASS`。可開始修改 runtime source，但必須保留已盤點的既有工作，且不得變更 `youtube-aopass@1.0.0`。
