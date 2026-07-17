# BlankSeed Browser 重要文件繁中索引

本索引列出專案目前要求維護的繁體中文 companion。除原本即以繁中撰寫的 `README_HANDOFF.md` 外，未加語言 suffix 的英文檔案維持權威來源。

## 入口與治理

- [外部代理主提示](00_EXTERNAL_AGENT_MASTER_PROMPT.zh-tw.md)
- [研究章程](01_RESEARCH_CHARTER.zh-tw.md)
- [產品定義](PRODUCT.zh-tw.md)
- [專案代理規則](AGENTS.zh-tw.md)
- [目前專案狀態](PROJECT_STATUS.zh-tw.md)
- [開發交接（原生繁中）](README_HANDOFF.md)

## 架構與執行

- [架構規格](02_ARCHITECTURE_SPECIFICATION_v0.1.zh-tw.md)
- [執行計畫](03_EXECUTION_PLAN_v0.1.zh-tw.md)
- [驗收與停止條件](04_ACCEPTANCE_AND_STOP_CONDITIONS.zh-tw.md)
- [實驗治理與復原](05_EXPERIMENT_GOVERNANCE_AND_RECOVERY.zh-tw.md)
- [協定與資料契約](06_PROTOCOL_AND_DATA_CONTRACTS.zh-tw.md)
- [WP-12 真實本機模型評估協定](11_WP12_REAL_MODEL_EVALUATION_PROTOCOL.zh-tw.md)
- [代理工作包](08_AGENT_WORK_PACKAGES.zh-tw.md)
- [架構決策紀錄](09_DECISION_LOG.zh-tw.md)

## 操作與驗證

- [程式使用說明](USER_GUIDE.zh-tw.md)
- [Starter 操作說明](starter/README.zh-tw.md)
- [驗證報告](VALIDATION_REPORT.zh-tw.md)
- [WP-10 操作 hardening 證據](starter/reports/wp-10-operational-hardening.zh-tw.md)
- [WP-11 自動化本機演化迴圈證據](starter/reports/wp-11-automated-evolution-loop.zh-tw.md)

## 維護規則

- 更新英文權威文件時，同一變更應同步更新對應 companion。
- `starter/scripts/check-doc-companions.mjs` 會檢查上述必要 companion 是否存在並標示英文權威來源。
- 歷史報告與封存研究資料不預設要求逐份翻譯；仍在使用者或 operator 工作流中的文件才列為必要 companion。
