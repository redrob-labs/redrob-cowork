---
name: prove-a-pr
description: Prove a PR, prepare merge verification, report the verdict, check a stacked PR. Use when declaring a PR Passed, Incomplete, or Failed.
---

# Skill: Prove a PR

## Verify the tree that will land

- Run every check on the PR head after its final rebase or cherry-pick. Re-run
  after any history rewrite; a verdict is bound to a commit SHA.
- Before merging a stacked PR, inspect
  `gh pr view <n> --json baseRefName,headRefName,headRefOid`. If its base PR
  merged first, the stack can merge into the feature branch instead of `main`;
  GitHub then recreates commits with new SHAs and orphans their evidence.
- Detect stray commits with `git log --oneline <branch> ^origin/main`. Remedy a
  bad stack by cherry-picking only the intended commits onto current `main`, then
  re-run every check.

## Run the checks

```bash
pnpm typecheck
pnpm --filter @redrob/app test
pnpm --filter redrob-server test
pnpm --filter @redrob/desktop test
pnpm build
```

- Add the app-driving smoke lanes when the change touches runtime behavior:
  `pnpm test:e2e`, plus the targeted `apps/app/scripts/*.mjs` runners
  (`pnpm test:health`, `pnpm test:sessions`, `pnpm test:events`, ...).
- Run one command at a time so each failure has one owner.

## Produce the verdict

- Give every claim an observable assertion in a run you executed. Prose,
  screenshots, and recordings never decide pass/fail.
- Report only `Passed`, `Incomplete`, or `Failed`. Always quote exact commands,
  exit codes, and passed/failed/skipped counts.
- Report each skip as `skipped — needs: X`; never call it passed. A green
  command containing skips makes the overall verdict `Incomplete`.
- Call a failure pre-existing only after the same command demonstrates it in a
  clean `origin/main` worktree. Quote the control command and matching failure.

## Publish human verification

- Post the commands, exit codes, and counts on the PR so a reviewer can audit
  the verdict without rerunning it. State the commit SHA they were run against.
- Never claim a check you did not run. If an environment prerequisite blocked a
  lane, name it and give exact repro steps instead.
