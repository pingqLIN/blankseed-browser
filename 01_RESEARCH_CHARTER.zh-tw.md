# 研究章程 v0.1

> 本檔為 `01_RESEARCH_CHARTER.md` 的繁體中文 companion；英文原檔為權威來源。

## 研究問題

當 AI model 可以與使用者互動、檢查環境、執行程式、觀察真實結果、保存有效能力，並持續修改自己的工具時，它能把一個初始極小的 Chromium 應用程式擴展到什麼程度？

## 假設

若模型取得低階且可組合的 primitives，它會逐步建立可重用 abstraction 與自身所需的開發基礎設施，而不是每次都以一次性 script 解決需求。

可能出現的行為包括 semantic locator、generic DOM inspection、共享 log/test helper、generated UI framework、error diagnosis、page-specific adapter、module dependency management、persistent task memory，以及重構 Kernel 的提案。

## 變數

Independent variables 包含 model family/version、system prompt、可用 raw capability、conversation history、user intervention、permission profile、既有 module library 與 target complexity。

Dependent variables 包含首次驗證成功所需 turns、失敗次數、自主修正率、人工修正次數、module reuse rate、跨站泛化、新 abstraction、regression、rollback frequency，以及有 execution evidence 支持的 model claim 比例。

## 初始實驗控制條件

- Windows 本機或 disposable VM。
- 同一系列試驗使用相同 Electron major/minor。
- 相同初始 module store。
- 使用相同 fixture pages 比較。
- 啟用完整 event 與 source logging。
- 每次實驗只使用一個 target browsing session。

## 「無邊界」的意義

研究移除 developer-authored semantic/task boundary，但不主張軟體能超越作業系統、網路、法律或物理限制。環境提供 general primitives；access expansion 必須成為可見的 user/AI interaction 與 experiment record。

## 研究階段

- R0 — Manual model loop：人工在 model 與 BlankSeed 間複製訊息。
- R1 — Model API loop：provider-neutral adapter 執行 structured tool turns。
- R2 — Runtime self-extension：AI 建立、測試並組合 page/Node modules。
- R3 — Source self-modification：透過 Git checkpoint 與 restart verification 修改應用 source。
- R4 — Engine-boundary investigation：只有重複證據顯示 Electron 受限時，才評估 CEF 或 Chromium fork。

## 必要證據

每次實驗必須保存 initial state、model/prompt identifier、user/AI messages、generated source、exact execution inputs、stdout/stderr/errors、page URL/navigation state、module versions、permission/config changes、前後 checkpoint，以及 user acceptance/rejection。

## 研究完整性

- 區分 model intention 與已驗證 system behavior。
- 保存失敗，不得從 transcript 中抹除。
- 若失敗程式影響後續推理，必須保留。
- 不得隱藏未記錄的人工修正。
- 外部人工 code contribution 必須明確標示。
