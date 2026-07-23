# BlankSeed Module Runtime Contract v1.2

> 英文原檔為權威來源：`MODULE_RUNTIME_CONTRACT.md`。本檔為供人閱讀的繁體中文 companion。

## 狀態與權威性

本文件定義 BlankSeed supervised utility runtime 執行 generated Node module 時所使用的正式 Module API v1.2 contract。它擴充既有 direct-return 行為，不變更 Module Store lifecycle，也不改變 `blankseed/0.1` execution envelope。

## 目標

- 保留直接 return value 的既有 source。
- 支援匯出 `execute(context)` 的 modern CommonJS module。
- 支援匯出 `evaluate(observation, environment)` 的 legacy CommonJS module。
- Source 沒有可用 entry point 時回傳 structured error，不再把 implicit `undefined` 靜默轉成 `null`。
- 維持 JSON-serializable result，並繼續經由既有 Process Supervisor 與 event pipeline 留下可觀察證據。

## Source evaluation environment

Runtime 以 asynchronous function 執行 source，並提供以下參數：

```javascript
environment, input, require, process, module, exports, __dirname, __filename
```

`module` 初始值是 `{ exports: {} }`，`exports` 一開始與 `module.exports` 指向同一 object。既有 security 與 supervision boundary 不變：execution 位於受監督的 Electron `utilityProcess`；本 contract 不宣稱 Node execution 是 security sandbox。

## Invocation context

對 exported entry point，runtime 會建立：

```javascript
{
  environment, // caller 提供的 invocation environment；預設 {}
  input,       // supervisor input；預設 {}
  observation // 依下列規則解析
}
```

Observation resolution 順序固定：

1. 若 `input` 自己具有 `observation` property，使用 `input.observation`；
2. 否則若 `environment` 自己具有 `observation` property，使用 `environment.observation`；
3. 否則使用整個 `environment` object。

最後一項 fallback 會保留過去直接以 Module invocation environment 傳入 normalized observation 的 caller。

## 支援的 contract

### Contract A — direct return

```javascript
return { status: 'ok' };
```

只有在不存在支援的 exported function 時，才會採用 direct value。

### Contract B — modern module

```javascript
module.exports.execute = async (context) => ({
  action: 'test',
  observation: context.observation
});
```

Runtime 會 await `execute(context)`。

### Contract C — legacy module

```javascript
module.exports.evaluate = function (observation, environment) {
  return { action: 'legacy' };
};
```

Runtime 會 await `evaluate(context.observation, context.environment)`。同步與 asynchronous function 都有效。

## Entry-point 優先順序

完成 top-level source evaluation 後，runtime 只選擇一個 result source：

```text
module.exports.execute()
  > module.exports.evaluate()
  > direct return value
```

只有 callable exported entry point 會參與選擇。Module 因此可以保留 `evaluate` 作為內部 compatibility function，同時以 `execute` 作為正式 entry point。

## Result 與 error 規則

- Runtime 會 await 被選中的 entry point。
- Explicit `null` 是有效 result。
- 最終 result 為 implicit 或 explicit `undefined` 時無效。
- 最終 result 必須通過既有 JSON serialization normalization。
- 沒有 callable `execute`、callable `evaluate`，也沒有 direct return 的 module，會以 structured error code `MODULE_CONTRACT_INVALID` 失敗。
- 被選中的 entry point resolve 為 `undefined` 時，同樣使用 `MODULE_CONTRACT_INVALID`。
- Serialization failure 繼續使用 `SERIALIZATION_FAILED`。
- Runtime exception 繼續使用既有 generated-runtime error envelope。

因此 invalid module 會產生 `status: "error"`、`result: null` 且含 structured `error` 的 execution envelope；不會再因 implicit `undefined` 而回報成功的 silent `null`。

## Versioning 與 governance

Module API v1.1 改變 runtime interpretation，不改變 committed module immutability。既有 committed source 不得原地修改。Module 變更仍必須依序通過：

```text
candidate -> test -> commit -> activate
```

Rollback 只切換 active version mapping；已 committed 的 corrective version 仍保留於 immutable history。

Corrective version 可以在 Module Store manifest 加入 optional `parentVersion` 與 `migrationReason`。Store 會在 candidate、test 與 commit 狀態中驗證並保留兩個欄位；未包含這些欄位的既有 manifest 仍然有效。

## Migration 指引

新 module 應匯出 `execute(context)`。Legacy module 可以加入薄 adapter，而不改變 detection 或 action logic：

```javascript
module.exports.execute = async (context) => {
  return module.exports.evaluate(
    context.observation,
    context.environment
  );
};
```

Source 必須確保 adapter 執行時，`module.exports.evaluate` 仍指向預期的 legacy function。

## 頁面測試橋接

Node module 可以產生 page-local 行為，但不得在 utility runtime 執行該行為。若要在 remote page 證明 generated capability，已通過測試的 candidate 可從支援的 entry point 回傳下列 `pageTest` descriptor：

```javascript
module.exports.execute = async () => ({
  pageTest: {
    installSource: '/* 安裝後回傳 { ok: true } */',
    verifySource: '/* 僅在預期行為存在時回傳 { ok: true } */',
    uninstallSource: '/* 還原後回傳 { ok: true } */',
    rollbackVerifySource: '/* 僅在確認已還原時回傳 { ok: true } */'
  }
});
```

`module_candidate_page_test` 只接受已測試 candidate 的 identifier。Module Store 會在 supervised utility runtime 再次執行已儲存的 source、驗證四個字串 descriptor，然後 dispatcher 依 install、verify、uninstall、rollback verify 的順序，將每個結果 script 經由既有 isolated-world page broker 執行。模型不能藉此操作直接送入獨立的 page script。

每個 phase 都必須回傳含有 `ok: true` 的 JSON-serializable object。broker 會記錄 candidate ID、已儲存 source hash、plan execution ID、target identity、各 phase execution ID 與失敗狀態。若某 phase 失敗，只要提供的 script 仍可執行，系統仍會進行 uninstall 與 rollback verification，然後回報 structured failed action。此 bridge 不會讓 remote content 取得 Node、不會使 candidate 成為 committed 或 active，也不會取代既有 commit 與 activation 的明確確認機制。

## Acceptance boundary

Synthetic observation 可以在 automated test 中證明 contract dispatch 與 result shape，但不能證明 live website behavior、advertisement availability 或端對端 acceptance。Live validation 必須使用實際 page observation，並保存 page-test action evidence，包括成功的 rollback verification。
