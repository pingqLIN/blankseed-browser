# WP-09 Git Source Evolution Report

Date: 2026-07-13 Asia/Taipei

## Scope

Demonstrated a Git-backed source self-modification prototype using a stable
baseline commit, a candidate branch/worktree, an inspectable patch, candidate
checks/tests, candidate Electron launch health and rollback by removing the
candidate worktree. The candidate branch is retained as local evidence and is
not merged into `main`.

## Stable Checkpoint

```text
stableCommit: 1e2515396350031717488782eafb332a68396e40
candidateBranch: codex/wp09-source-evolution-1783928693189
candidateCommit: 4b708041c53ffc1292b5514988797194b446a199
worktreePath: D:\OneDrive\Documents_cloud\BlankSeed Browser\starter\workspace\source-evolution\worktrees\wp09-2026-07-13T07-44-53-185Z
patchPath: D:\OneDrive\Documents_cloud\BlankSeed Browser\starter\reports\wp-09-candidate.patch
```

## Candidate Change

The candidate patch adds a visible source-evolution health status cell to the
trusted console UI. It does not alter the remote target renderer settings and
does not enable Node integration for remote pages.

Patch evidence:

```text
starter/reports/wp-09-candidate.patch
```

## Commands

- `git rev-parse --show-toplevel` in `.` -> 0 (314 ms)
- `git rev-parse --verify HEAD` in `.` -> 0 (348 ms)
- `git status --porcelain` in `.` -> 0 (370 ms)
- `git worktree add -b codex/wp09-source-evolution-1783928693189 D:\OneDrive\Documents_cloud\BlankSeed Browser\starter\workspace\source-evolution\worktrees\wp09-2026-07-13T07-44-53-185Z 1e2515396350031717488782eafb332a68396e40` in `.` -> 0 (1115 ms)
- `git apply D:\OneDrive\Documents_cloud\BlankSeed Browser\starter\reports\wp-09-candidate.patch` in `starter\workspace\source-evolution\worktrees\wp09-2026-07-13T07-44-53-185Z` -> 0 (350 ms)
- `cmd.exe /d /s /c npm run check` in `starter\workspace\source-evolution\worktrees\wp09-2026-07-13T07-44-53-185Z\starter` -> 0 (9704 ms)
- `cmd.exe /d /s /c npm test` in `starter\workspace\source-evolution\worktrees\wp09-2026-07-13T07-44-53-185Z\starter` -> 0 (3158 ms)
- `git status --short` in `starter\workspace\source-evolution\worktrees\wp09-2026-07-13T07-44-53-185Z` -> 0 (488 ms)
- `git add starter/src/renderer/index.html` in `starter\workspace\source-evolution\worktrees\wp09-2026-07-13T07-44-53-185Z` -> 0 (334 ms)
- `git commit -m WP09 candidate source evolution health marker` in `starter\workspace\source-evolution\worktrees\wp09-2026-07-13T07-44-53-185Z` -> 0 (703 ms)
- `git rev-parse --verify HEAD` in `starter\workspace\source-evolution\worktrees\wp09-2026-07-13T07-44-53-185Z` -> 0 (322 ms)
- `git worktree remove --force D:\OneDrive\Documents_cloud\BlankSeed Browser\starter\workspace\source-evolution\worktrees\wp09-2026-07-13T07-44-53-185Z` in `.` -> 0 (535 ms)
- `git worktree list` in `.` -> 0 (350 ms)

## Candidate Health

```json
{
  "ready": true,
  "title": "BlankSeed Browser Console",
  "marker": "candidate",
  "markerText": "Source candidate ok",
  "statusCellCount": 5,
  "stderr": "DevTools listening on ws://127.0.0.1:9343/devtools/browser/b33c6c18-5ac2-48b2-8840-6ddc8812f386"
}
```

## Rollback Result

```text
worktreeRemoved: true
remainingWorktrees:
D:/OneDrive/Documents_cloud/BlankSeed Browser 1e25153 [main]
```

Rollback state: `main` remains at the stable source evolution implementation
lineage and the candidate patch is not merged. To accept the candidate later,
review and merge `codex/wp09-source-evolution-1783928693189`; to discard it, delete that local branch.

## Manual Verification Note

Launch command:

```powershell
node scripts\runtime-wp09-source-evolution.mjs
```

Tested URL:

```text
https://example.com/
```

Action performed:

```text
Create candidate Git worktree, apply UI patch, run candidate check/test, launch
candidate Electron, verify console readiness and the candidate source-evolution
health marker, then remove the candidate worktree.
```

Expected result:

```text
Candidate checks and tests pass; candidate Electron reports console readiness;
the source-evolution marker exists; stable main is not modified by the
candidate patch after rollback.
```

Actual result:

```text
Candidate checks and tests passed, candidate Electron health returned ready=true
and marker=candidate, and the candidate worktree was removed.
```

Relevant log/checkpoint path:

```text
starter/reports/wp-09-source-evolution.md
starter/reports/wp-09-candidate.patch
```

## Residual Risk

- The prototype keeps acceptance manual by design; it does not auto-merge
  candidate source into `main`.
- Dependency installation policy is not exercised because the candidate patch
  adds no dependency.
- Future source-evolution runs should add conflict handling before merging
  candidate branches into the stable line.
