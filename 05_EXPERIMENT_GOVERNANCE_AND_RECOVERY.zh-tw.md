# 實驗治理與復原

> 本檔為 `05_EXPERIMENT_GOVERNANCE_AND_RECOVERY.md` 的繁體中文 companion；英文原檔為權威來源。

## 目的

在不假裝任意 code 無害的前提下，維持 open-ended AI experiment。治理層應負責觀察與復原，不應預先決定模型可發明哪些能力。

## Profiles

### Workspace Research

建議初始 profile：generated source 存於 project workspace；remote renderer 與 Node 隔離；generated Node runtime 為 separate disposable process；network 可以使用；Node/process primitives 可能影響 host，必須記錄。高風險 trial 建議使用 disposable VM 或 dedicated OS account。

### Host Research

後續可選 profile：AI 可刻意檢查／修改 workspace 外路徑並呼叫 installed tools。必須明確變更 experiment configuration 並建立 checkpoint；不得稱為 sandboxed。

## 固定保護機制

Visible execution source、chronological event log、timeout/stop、process supervisor、source/module version、checkpoint/rollback、remote renderer isolation 與 exact environment identity 都是 infrastructure control，不是 semantic restriction。

## Kill hierarchy

1. Cancel active model turn。
2. Cancel pending broker request。
3. Stop generated utility runtime。
4. Kill descendant process tree。
5. Disable active generated modules。
6. Close target WebContentsView。
7. Restart application 至最後 checkpoint。
8. Restore Git/workspace checkpoint。

UI 必須區分「stop requested」與「confirmed stopped」。

## Checkpoint 時機

在啟用新 capability profile、安裝 dependency、啟用 persistent generated module、修改 application source、重新啟動 candidate build 前，以及 user-verified milestone 後建立 checkpoint。

## Evidence retention

不得默默丟棄 failed source、runtime error、被 environment 拒絕的 model request、user correction、permission/profile change 與 rollback action。Secret 必須在 capture boundary redaction，但 redaction event 本身仍應可見。

## Generated dependency policy

安裝前保存 package/version、registry、理由、license、install command、lockfile diff、lifecycle scripts、native binary 與 rollback checkpoint。Initial Kernel 維持 dependency-light，generated module 後續可有 isolated dependency space。

## Source self-modification gate

只有在 process stop、module rollback、deterministic baseline checks、candidate health 與 stable repository/workspace restore 均已證明後才能開始。

## 解讀規則

Recovery layer 不會讓任意 execution 變安全；它讓 failure 更可見、實驗更可重現。
