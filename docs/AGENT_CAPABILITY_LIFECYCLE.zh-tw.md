# Agent Capability Lifecycle

> 本檔為 `AGENT_CAPABILITY_LIFECYCLE.md` 的繁體中文 companion；英文原檔為權威來源。

## 目的與邊界

本規格為 generated Agent capability 建立共通 vocabulary 與 state model。內容描述目前 Module Store lifecycle，不變更 Module API，也不授予 Agent 繞過 validation、activation 或 recovery control 的 authority。

## Capability Lifecycle

```text
Generate
   |
   v
Candidate
   |
   v
Test
   |
   v
Commit
   |
   v
Activate
   |
   v
Invoke
   |
   v
Rollback
```

此 sequence 將 creation 與 authority 分離。Generated source file 不是 active capability；通過測試的 Candidate 不是 committed version；committed version 也必須明確 Activate 後才會被 Invoke。

## State model

| Stage | Durable identity 或 evidence | 能否作為 active capability 被 Invoke？ |
| --- | --- | --- |
| Generate | Source 與 generation context | 否 |
| Candidate | `candidateId`、Module metadata、source、`sourceHash`、validation state | 否 |
| Test | Test execution result、`executionId`、更新後 validation state | 否 |
| Commit | Module `id` + semantic `version` + `sourceHash` | 否，直到 Activate |
| Activate | Module `id` 指向 committed `version` 的 active mapping | 是 |
| Invoke | Execution result 與關聯的 Module/event identity | Invoke active version |
| Rollback | 從目前 active version 切換至指定 committed version 的 transition | Mapping 更新後為是 |

## Generate

Generate 由 user、model turn 或其他 observable workflow 產生 source 與 supporting metadata。Generated artifact 必須經由 Candidate creation 進入 Module Store。Generate 不會將 hidden behavior 寫入固定 Kernel，也不代表已完成 validation 或取得 Runtime authority。

可用的 provenance 包含 originating session、execution、evolution run、model、action 與 Checkpoint identity。

## Candidate

Candidate 是尚未正式啟用的 capability version。目前 Module Store 會分配 `cand_*` identity，並將其儲存在 `workspace/modules/.candidates/`。

Candidate 包含：

- Module metadata：穩定的 `id`、semantic `version`、description、entry 與 declared Runtime；
- source 與對應 `sourceHash`；
- 可取得時的 session、execution、evolution-run、model 與 Checkpoint provenance；
- validation state：初始為 `candidate`，只有成功完成 Test 後才改為 `tested`；
- 已執行 Test 時所產生的 Test result evidence。

Candidate source 維持 inactive。建立 Candidate 不得改變 active Module mapping。

## Test

Test 透過受監督的 Node Runtime 執行 Candidate source，並記錄 result 與 execution identity。此 gate 檢查三類問題：

- **Correctness：** Candidate 是否完成定義的 Test，並回傳預期的 structured result？
- **Runtime safety：** 是否維持在設定的 execution limit 內，且 failure 或 timeout 能否被觀察與終止？
- **Compatibility：** 是否符合 declared Module metadata、Runtime 與 project-defined integration expectation？

目前 built-in gate 證明的是 execution-oriented Test result。更廣泛的 semantic correctness、host safety、dependency review 與 cross-version compatibility，仍需額外 project 或 operator check。Test 失敗時 artifact 保持 Candidate state，不得 Commit。

## Commit

Commit 將成功通過 Test 的 Candidate 轉為 immutable Module version。其 identity 由穩定的 Module `id`、semantic `version` 與驗證過的 `sourceHash` 組成。

Commit 前，Module Store 會確認：

- Candidate status 為 `tested`；
- 儲存的 source 仍與 `sourceHash` 相符；
- target Module version 尚不存在。

Commit 類似 Git commit 或 model registry version，因為它讓特定 artifact 可被定址與稽核。但它不是 Git operation，也不會自行 publish 或 Activate Module。

## Activate

Activate 明確將 committed version 加入 active Runtime capability set。Module Store 會驗證所選 committed manifest 存在，再更新 `workspace/state/active-modules.json` 中 Module `id` 對應的 version，並記錄 previous version。

只有 committed version 可以 Activate。若 capability 具有持久性或 operation 影響，Activate 前應建立 Checkpoint。

## Invoke

Invoke 會解析 Module `id` 的 active version、以 `sourceHash` 驗證 stored source，然後把 source 與指定 environment、timeout 送至受監督的 Node Runtime。

Event Store 會記錄 invocation start，以及 completion 或 failure，其中包含 Module identity、version、execution identity、status 與 normalized error。Invoke 不會選擇 uncommitted Candidate，也不會靜默改變 active mapping。

## Rollback

Rollback 將 Module selection 復原到指定的先前 committed version。Module Store 會驗證該 version、記錄 current version、更新 active mapping，並附加 `module.rollback.completed` evidence。

Rollback 有明確限制：

- 它只改變 active Module version，不刪除較新的 version；
- 它不會逆轉 Invoke 已造成的 external side effect；
- 它不同於 Checkpoint restore；
- 它也不同於 application source 的 Git/worktree rollback。

Checkpoint evidence 可協助 recovery decision，但目前 Checkpoint Store 只擷取 state，沒有提供通用 automatic restore API。Application source recovery 仍屬於另行治理的 Git/workspace procedure。

## Failure transitions

- Generate 或 Candidate creation 失敗時，不會產生 active capability。
- Test 失敗時，Candidate 維持 uncommitted。
- Commit conflict 會保留既有 immutable version。
- Activate 失敗時，保留原本 active mapping。
- Invoke 失敗時會記錄 evidence，但不改變 version selection。
- Rollback 失敗時，保留目前 active mapping，並要求 operator 檢查 requested version 與 evidence。

## Lifecycle invariants

1. Candidate 預設為 inactive。
2. Test 必須成功後才能 Commit。
3. Commit 建立唯一的 immutable version identity。
4. Activate 只能選擇 committed version。
5. Invoke 只能解析 active version，並驗證 source hash。
6. Rollback 指向既有 committed version，且過程保持 observable。
7. 任何 lifecycle step 都不會清除 failed source、Test result 或 transition event。

## 與未來 registry 的關係

未來的 Skill Registry 或 Capability Marketplace 可索引 committed Module version、validation evidence、provenance、compatibility declaration 與 policy decision。Discovery 或 distribution 不得把 Candidate、Commit 與 Activate 合併成單一操作。Multi-Agent Governance 可協調由誰 propose、review 或 activate capability，但 lifecycle state machine 仍是共通 technical contract。
