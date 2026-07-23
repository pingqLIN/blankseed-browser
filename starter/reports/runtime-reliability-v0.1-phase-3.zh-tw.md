# BlankSeed Agent Runtime Reliability Upgrade v0.1 - Phase 3 報告

> 英文原檔為權威來源：`runtime-reliability-v0.1-phase-3.md`。本檔為方便人工閱讀的繁體中文對照版。

## 目標

限制大型 `node_execute`、CDP 與 DOM snapshot observation 對 model context 的污染，同時不截斷 durable Runtime evidence。

## 現況發現

Action result 會在既有每筆 1 MiB evidence cap 內寫入 `run.json`，並序列化到下一輪 model conversation。既有 generic serializer 允許每個大型 result 最多 12,000 characters；失敗的 YOUTUBE-AOPass evidence 含有超過 30,000 characters 的單一 action record，因此重複 observation 會顯著增加後續 model latency。

## 最小修改

- 在受驗證的 Runtime defaults 新增 `evolutionObservationMaxChars: 4000`。
- `EvolutionRunManager` 只對超過上限的 `node.execute`、`cdp.send`、`page.snapshot` model feedback 套用 deterministic structural compression。
- Compressed feedback 保留 action identity、status、source/evidence hash、error code/retryability、受控 keys/scalars，以及存在時的 metrics。
- 小型 observation 維持不變。
- `evidence.actions` 在既有 1 MiB evidence cap 內保存未壓縮 result；本階段新增的 compression 只發生在建立 model-facing tool message 時。
- ADR-023 記錄此 evidence-preserving context boundary。

## 測試與驗收

```text
node --test test/evolution-loop.test.mjs
tests 13, pass 13, fail 0

npm run check
Checked 59 project JavaScript files; baseline configuration is valid.
Checked 24 required Traditional Chinese document companions.

git diff --check
PASS
```

Regression coverage 包含 50,000-character Node、CDP 與 DOM observation，model-facing output 均 `<= 4000` characters；status、metrics、error code、retryability 與 hash 都保留。對 adversarial oversized metadata 也維持 hard cap。Integration fixture 確認 durable Node evidence 仍含完整 50,000 output characters，因為該資料低於既有 1 MiB cap。

Phase 3 結果：**PASS**。

## Rollback

移除 `evolutionObservationMaxChars`、恢復舊 serializer call，並移除 Phase 3 serializer helpers/tests 與 ADR-023。Durable evidence schema 與已儲存 action result 均未改變，因此不需要 migration。
