# WP-12A 預檢與證據基礎報告

> 本檔為 `wp-12-preflight-foundation.md` 的繁體中文 companion；英文原檔為權威來源。

日期：2026-07-18 Asia/Taipei

## 目標與判定

在任何真實本機模型 trial 之前，完成受限的 WP-12A 基礎：fail-closed
環境預檢、固定且具 hash 的評估 fixtures、evaluation sidecar validator，
以及可持久保存的 audit output。

實作結果為 `FOUNDATION VERIFIED`；實驗結果仍是
`PRE-FLIGHT HOLD / NOT RUN`。本次沒有執行 WP-12 model turn，也沒有任何
trial 被計數。

## 已完成的邊界

- `wp12:preflight` 從 Git 忽略的 `workspace/wp12-preflight/` 讀取 operator
  管理的 input，並寫出經約束的 structured audit record。
- validator 會檢查指定 branch、完整 commit、clean worktree，以及四項必要
  project command 的本次證據。
- model 與 fixture endpoint 只能使用 literal `127.0.0.1` 或 `::1` 的
  HTTP(S)；拒絕 user info、query string、fragment 與 `localhost`。
- 必須提供精確 model/server identity；placeholder、`UNKNOWN` 與
  secret-shaped configuration key 一律 fail closed。
- trial workspace 與 user-data path 必須全新、彼此不同，且位於專用 owned
  root。endpoint port 必須唯一、非 privileged，並與同一 launch ownership
  nonce 關聯。
- 非 loopback egress denial 必須由獨立的 OS/network attestation 證明；
  preflight 不會設定或放寬 firewall。
- 八個固定 B1/B2/I1/R1/prompt/canary fixture 均有受追蹤的 SHA-256 與明確
  trust label；canary 是 synthetic non-secret。
- `validate:wp12:evaluation` 會驗證 sidecar 位置與 schema，但 schema valid
  不等於 trial pass。
- preflight 會記錄 Kernel、Electron、OS、tool catalog、limits 與 fixture
  identity；不會啟動 Electron、聯絡模型、dispatch raw tool 或開始 trial。

範例 configuration 與 egress-attestation 僅是 template；複製或修改 template
並不能證明 OS egress control 已存在。

## 指令與結果

```powershell
node --test test/wp12-preflight.test.mjs
npm run check
npm test
```

結果：WP-12A 聚焦測試 8/8 通過；37 個 JavaScript 檔案檢查通過、20 組
必要繁中 companion 存在，完整測試 51/51 通過。

Fail-closed foundation verification：

```powershell
npm run verify:wp12:preflight
```

此指令先執行目前 static/unit verification，再檢查 preflight；預期的 HOLD
不會被誤判成 harness failure。耐久 audit path 為：

```text
starter/workspace/wp12-preflight/preflight.json
```

## 已記錄的預檢結果

以下 audit 是 2026-07-18 建立此基礎時留下的歷史 evidence，不代表
repository 當前的 `HEAD` 或 worktree 狀態：

```text
status: PRE-FLIGHT HOLD / NOT RUN
trialStarted: false
branch: main（protocol 要求 codex/wp12-real-model-evaluation）
commit: b57ad0e6c7787850e4c78910a7122a5f99c3cebf
```

當時記錄的 blocker 都是預期且保留證據的結果：

- worktree 目前位於 `main`，不是 protocol 指定 branch，且尚未 clean；
- `workspace/wp12-preflight/input.json` 刻意尚未建立；
- 未提供精確 model/server identity 與 fixture endpoint ownership；
- 未提供外部 OS/network egress-denial attestation。

本 task 的 `npm run verify:runtime` 與 `npm run verify:wp11` 均通過；之後帶入
四項本次 check result 執行 strict preflight，仍因上述 environment/input
condition 正確地以 exit code 2 結束。

以上 blocker 均未以推論消除；沒有啟動真實 WP-12 trial。

## 未來獲授權 trial 的 operator 順序

1. 使用 disposable VM 或專用 OS account，建立可獨立觀察的 non-loopback
   egress deny control。
2. 將 `config/wp12-preflight.example.json` 複製至 Git 忽略的
   `workspace/wp12-preflight/input.json`，以精確且非 secret 的值替換所有
   placeholder，並在忽略區提供外部 attestation。
3. 在 clean 且已記錄的 branch/commit 執行
   `npm run wp12:preflight:full`；此指令會執行兩個必要 Windows smoke，並把
   四項本次 check result 帶入 strict preflight。
4. 僅在 `wp12:preflight` 回傳 `READY` 時繼續；任何 HOLD 都表示不得進行
   model turn，也不得計入 trial。
5. 每個 sidecar 以以下指令驗證：

```powershell
npm run validate:wp12:evaluation -- workspace/evolution-runs/<evolutionRunId>/wp12-evaluation.json
```

## 手動驗證註記

- Launch command：`node scripts/wp12-preflight.mjs --allow-hold --verified-check npm-run-check --verified-check npm-test`
- Tested URL：無；preflight 不發出 network request。
- Action：評估目前 repository、fixture 與 environment evidence。
- Expected：缺少精確 model/egress evidence 時回傳 HOLD，且不啟動 trial。
- Actual：`PRE-FLIGHT HOLD / NOT RUN`、`trialStarted: false`；只有明確使用
  verification-only `--allow-hold` 時 exit code 才是 0。
- Evidence：Git 忽略的 `starter/workspace/wp12-preflight/preflight.json`
  與本耐久報告。

## 風險、回復與剩餘邊界

- 風險層級：L2 可回復的本機 code/document 變更；operator 執行既有 runtime
  verification 時仍屬 L3。
- 歷史 foundation Rollback baseline：commit
  `b57ad0e6c7787850e4c78910a7122a5f99c3cebf`；只需依 task diff 檢視／移除
  本次檔案。本次未修改 system/network configuration。
- 本基礎只證明 validator 行為，不證明 model quality、injection robustness、
  egress enforcement 或 WP-12 pass criteria。
- 外部 attestation 是 operator 提供並經 schema check 的證據；application
  不宣稱能獨立檢查所有 OS firewall 或 hypervisor rule。
