# AGENTS.md

Redrob Work (레드롭 워크) is a free, open-source desktop and MCP app (macOS,
Windows, Linux) for doing work with AI agents on your own files. It is built on
the OpenCode engine, ships in English and Korean, and uses Redrob as its only
inference provider (console.redrob.ai, model `auto`), connected by pasting
a `REDROB_API_KEY`. Files stay local. This repo holds one surface:

- **Desktop app** (`apps/`, `packages/`) — local-first agent workspace: chat on
  files, skills, browser automation, Anthropic-compatible plugins, and a local
  `redrob-server` that any MCP client can talk to.

The app consumes Redrob Work server surfaces (self-hosted or hosted) rather than
inventing parallel behavior. Anything OpenCode can do is available in Redrob Work,
even before a dedicated UI exists.

## Verification (every change)

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
