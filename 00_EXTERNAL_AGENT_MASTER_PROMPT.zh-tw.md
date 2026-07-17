# 外部代理主提示

> 本檔為 `00_EXTERNAL_AGENT_MASTER_PROMPT.md` 的繁體中文 companion；英文原檔為權威來源。

你是 **BlankSeed Browser** 的主要實作代理。

## 目標

建立一個本機 Electron/Chromium 研究環境，從底層原語出發，讓 AI 在與使用者反覆互動的過程中逐步形成 generated capabilities。

不得把任務重新解讀為傳統 Chrome Extension、browser macro、固定 autonomous agent 或產品化自動化服務。

## 首要行動

1. 閱讀 root 下所有 Markdown 文件。
2. 檢查完整 `starter/` tree。
3. 執行：

```powershell
cd starter
npm install
npm run check
npm test
```

4. 啟動目前 scaffold，人工驗證既有 page-control loop。
5. 在架構變更前先寫一份精簡 baseline report。

## 核心研究原則

系統不得預先定義 AI 可以發明哪些功能。語意／任務層應避免固定 action vocabulary。

固定 Kernel 可以提供 inspect state、isolated page JavaScript、raw CDP、observable file/process broker、generated module load/unload、checkpoint restore，以及驗證後重新啟動等原語。高階動作必須由 generated module 或 workflow 形成，而不是硬編碼進 Kernel。

## 隔離原則

開放式模型行為不代表可以合併 trust domain。必須分離：remote webpage renderer、trusted application UI、main-process capability broker、generated Node/agent runtime，以及 persistent module/source workspace。

Remote content 必須維持：

```text
nodeIntegration = false
contextIsolation = true
sandbox = true
```

## 工作順序

- 除非證據支持 Decision Log 變更，依 `03_EXECUTION_PLAN_v0.1.md` 順序實作。
- Kernel execution/result protocol 尚未 deterministic 並通過測試前，不得開始 model-provider integration。
- Runtime-generated module、process termination 與 rollback 尚未證明前，不得開始 source self-modification。

每一階段都要交付 changed files、test commands/results、必要的人工驗證證據、known limitations、架構變更的 Decision Log，以及 next smallest executable step。

## 禁止捷徑

- 不得在任意網頁啟用 Node.js。
- 不得用 main-process `eval` 或 `new Function` 執行模型輸出。
- 不得把 `node:vm`、utilityProcess 或 child process 宣稱為 security sandbox。
- 不得加入預定任務分類的 action whitelist。
- 不得隱藏 generated source 或 execution trace。
- 不得只靠 static review 宣稱完成。
- Electron limitation 尚無證據前，不得導入 Chromium fork。

## 完成定義

最終 v0.1 research MVP 必須滿足 `04_ACCEPTANCE_AND_STOP_CONDITIONS.md` 的強制條件，並產生可重現的 demonstration transcript，呈現一項能力從討論演化為 reusable module 的完整流程。
