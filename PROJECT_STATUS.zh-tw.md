# BlankSeed Browser 專案狀態

> 本檔為 `PROJECT_STATUS.md` 的繁體中文 companion；英文原檔為權威來源。狀態日期：2026-07-18（Asia/Taipei）。

## 快照

- 穩定分支為 `main`；目前 UI 繁中化工作建立於 WP-11 baseline commit `59a0da3`。
- WP-00 至 WP-11 均已在 `starter/reports/` 留下證據報告。
- WP-09 candidate branch 只保留作本機證據，刻意未合併至 `main`。
- Trusted control surface 的使用者介面採用繁中，並有英文權威的 operator guide 與 `.zh-tw.md` companion。
- 專案仍是 Windows-first 的本機研究環境，不是可發布的瀏覽器產品。

## 階段判定

- Phase 0：已完成 Windows Electron runtime 驗證。
- Phase 1：deterministic protocol 已實作；本次 hardening 補上明確的 page/CDP cancellation 與下一次命令重新 attach 的 CDP recovery。
- Phase 2：generated Node runtime supervision 已完成。
- Phase 3：版本化 module lifecycle 與 rollback 已完成。
- Phase 4：已完成一次人工 capability-evolution 實驗，並在重新啟動後重用 module。
- Phase 5：provider-neutral adapter、無憑證 loopback transport 與有界的 model-to-raw-capability evolution loop 已完成。Phase 4 failure/correction/reuse 實驗已能由 automated model turns 執行並產生等價證據。
- Phase 6：candidate worktree、patch、check/test、health probe 與 rollback 已證明；接受候選版本仍須人工決定。
- Phase 7：因尚無可重現的 Electron engine blocker，尚未啟動。

## 目前決策

- 保留 `codex/wp09-source-evolution-1783928693189` 作為本機證據；未經產品負責人 review，不合併也不刪除。
- 本階段不處理 hosted-provider credentials。第一個真實 model transport 僅允許 loopback，且不送出 authorization header。
- 固定 tool catalog 只保留 raw infrastructure family，不把 summarize/translate 等 semantic task verb 加入 Kernel。
- 每個 automated run 都在 `workspace/evolution-runs/<evo_*>/run.json` 保存 pre-run checkpoint 與 run/turn/action correlation identity。
- 可發布技術文件以英文為權威來源，重要文件明確維護 `.zh-tw.md` companion。
- Protocol 與 manifest 的 status 原值維持英文，renderer 面向使用者時才映射為繁中。

## 剩餘風險

- Page JavaScript cancellation 能終止 broker 的結果生命週期，但不能保證 Chromium 立即停止已開始執行的 JavaScript。
- Deterministic fixture 證明 transport、dispatch、correction 與 reuse；real-model quality 與 prompt-injection robustness 仍未證明。
- Evolution cancellation 會阻止後續 dispatch 並可取消 active model request，但不保證立即停止 Chromium 已開始的 JavaScript。
- Source evolution 尚未證明 dependency change、merge conflict 與多個 concurrent candidate。
- CI 驗證 syntax、configuration、文件 companion 與 unit test；Electron smoke 仍是 Windows runtime workflow。

## 驗證指令

在 `starter/` 執行：

```powershell
npm run verify
npm run verify:runtime
npm run verify:wp11
```
