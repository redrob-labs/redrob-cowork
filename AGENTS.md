# AGENTS.md

Redrob Cowork (레드롭 코워크) is a free, open-source desktop and MCP app (macOS,
Windows, Linux) for doing work with AI agents on your own files. It is built on
the OpenCode engine, ships in English and Korean, and uses Redrob as its only
inference provider (console.redrob.ai, model `auto`), connected by pasting
a `REDROB_API_KEY`. Files stay local. This repo holds one surface:

- **Desktop app** (`apps/`, `packages/`) — local-first agent workspace: chat on
  files, skills, browser automation, Anthropic-compatible plugins, and a local
  `redrob-server` that any MCP client can talk to.

The app consumes Redrob Cowork server surfaces (self-hosted or hosted) rather than
inventing parallel behavior. Anything OpenCode can do is available in Redrob Cowork,
even before a dedicated UI exists.

## Branches

Gitflow. **`develop` is the default branch and the base of every pull request.** Opening one
against `main` is wrong unless it is a release promotion or a hotfix.

- **`develop`** integrates. Cut working branches from it, `<type>/<slug>`.
- **`main`** is released state. It moves by merging `develop` into it, and release tags are cut
  from it.
- **Hotfix**: branch from `main`, merge into `main`, release, **then merge `main` back into
  `develop`**. Skipping that last step is how the sibling engine repository spent a month with a
  lockfile its own default branch could not install from.
- Both branches are protected: pull requests only, force pushes and deletions blocked, zero
  required reviews, admin enforcement off. Required checks are `i18n-audit` and
  `Syntax & dry-run publish`.
- The release workflow tags `origin/main` HEAD and **refuses to run while `develop` is ahead of
  `main`**, listing the unpromoted commits. `allow_unpromoted: true` is the override for a hotfix
  already on `main`.

See CONTRIBUTING.md, or CONTRIBUTING.ko.md for the same in Korean.

## Verification (every change)

- **Judge by the exit code, never by the pass count.** `pnpm test` prints `859 pass / 0 fail`
  and still exits 1 when a file fails to LOAD: the failure is one `1 error` line beside the
  summary, that file's tests are never counted, and grepping for `(fail)` finds nothing. Capture
  the run and read `echo "exit=$?"`.
- **CI does not run the test suite.** `ci-tests.yml` is `workflow_dispatch` only, so a pull
  request gets three checks and none of them is the app suite. Green checks are not a green
  suite; run it locally.
- The proof path is the repo's own checks: `pnpm typecheck`, the unit suites
  (`pnpm --filter @redrob/app test`, `pnpm --filter redrob-server test`,
  `pnpm --filter @redrob/desktop test`), `pnpm build`, and the app-driving smoke
  scripts (`pnpm test:e2e`, `apps/app/scripts/*.mjs`). Prose, screenshots, and
  recordings never decide pass/fail — a command's exit code and output do.
- New runtime behavior needs an observable assertion in the matching unit suite
  (`apps/app/tests/**`, `apps/server/**/tests`, `apps/desktop/**/tests`).
- Skills own the mechanics: `prove-a-pr` for the verdict, `diagnose-a-red-run`
  when a check is red.
- Verdicts: `Passed` only when every claim has an observable assertion in a run
  you executed; otherwise `Incomplete` or `Failed` with repro steps. Skips are
  never passed.
- Docs/comments, types-only, and inert agent config may skip runtime proof — say so.

## Pull requests

- Do not default to draft PRs. A request to create or make a PR means a
  ready-for-review PR once the required proof is published. Use a draft only
  when the requester explicitly asks for one or the current verdict is
  `Incomplete` or `Failed`, and state exactly what proof is missing.
- Run tests and report commands + results. A runtime-observable change is not
  done until its test evidence is visible on the PR. If validation cannot run,
  say why and give exact repro steps.

## Coding

- pnpm only, never npm/yarn. TypeScript: never `any`, typecasts, or `as` unless
  100% necessary or instructed.
- Prefer Tailwind, React, shadcn/ui (Base UI), TanStack Query, Zustand, Zod,
  Drizzle, Better-Auth. Reuse `@/components`; end users are non-technical.
- Smallest possible diff, then make it smaller. Propose the simpler solution. No
  fallback expressions when types or control flow already guarantee a value.
- If asked to do too much at once, stop and say so.

## Cloud commander (Kiro)

Cursor Cloud is the control commander only. Token split is Kiro 9, commander 1.

Kiro owns planning, implementation, tests, code review, and spawning its own
sub-agents. The commander does not plan, write product code, or drive large
test matrices.

Dispatch one Kiro run from the repo root:

```bash
export KIRO_API_KEY="${KIRO_KEY:-$KIRO_API_KEY}"
kiro-cli chat --no-interactive --model claude-opus-5 --effort max --trust-all-tools "$PROMPT"
```

The prompt must tell Kiro to plan, implement, review, spawn sub-agents as
needed, then stop with DONE, files changed, proof commands plus exit codes,
and remaining risks.

Kiro writes append-only one-line checkpoints to a progress file the commander
names in the prompt, using the exact prefix `CHECKPOINT n: `. At minimum:
start, after reading the current state, after each deliverable, after
commit/push, after merge, and DONE. The commander reads that file to follow a
long run without interrupting it.

The commander waits until Kiro reports DONE, then spot-checks the diff and
the proof. Reject and re-dispatch if the proof is missing or the diff is
wrong. Accept only after that review. Do not redo Kiro's work in the
commander session.
