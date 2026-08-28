# Handoff — redrob-work

Current state of `main` as of 2026-08-28. Everything below was checked against the tree at
`d274cb6` and re-measured locally on this date.

## What this repo is

Redrob Work: a desktop app (Electron) plus a local `redrob-server`, both operating on the
user's own files. **Local-only.** No sign-in, no account, no organization, no hosted control
plane. The Den control plane and every cloud surface that depended on it are gone.

- `apps/app` — the React web UI, built with Vite, rendered by both the browser and the desktop
  shell.
- `apps/server` — `redrob-server`, the local HTTP server. It manages the engine, MCP servers,
  workspaces, sessions and the environment-variable store.
- `apps/desktop` — the Electron shell. It packages the engine as a sidecar.
- `packages/` (14): `codemode`, `docs`, `email`, `enterprise-mcp-client`,
  `enterprise-mcp-mock-server`, `handsfree`, `headless-threads`, `install-config`, `mcp-apps`,
  `paths`, `redrob-bootstrap`, `redrob-ui-mcp`, `types`, `ui`.

**The engine is Redrob Code.** The desktop shell resolves the engine binary from
`REDROB_CODE_BIN` or a packaged sidecar, both named `redrob`, pinned to a release of
`redrob-labs/redrob-code` by `apps/desktop/scripts/redrob-code-release.mjs` and spawned from
`apps/desktop/electron/runtime.mjs`. Directory routing is the `x-redrob-directory` header, set
in `apps/app/src/app/lib/opencode.ts` and read in `apps/server/src/server.ts`; upstream
OpenCode's `x-opencode-directory` is not accepted.

Inference is the Redrob provider by default: the user pastes a `REDROB_API_KEY` issued at
console.redrob.ai on the onboarding key step
(`apps/app/src/react-app/domains/onboarding/redrob-key-step.tsx`). Other providers are added
with their own API keys in `Settings > AI Providers`. MCP servers, skills, commands, agents and
Anthropic-compatible plugins are workspace-local; Claude Code plugin bundles still install from
GitHub.

Localization is exactly English and Korean, locked at four layers by
`apps/app/tests/supported-locales.test.ts`. `ko.ts` is deliberately smaller than `en.ts` (~430
keys against ~1171): it is an overlay and `t()` falls back to English, which the test asserts by
allowing missing Korean keys but rejecting Korean keys English lacks.

## Current main

`d274cb6` — `Merge PR #8: docs: make Kiro the worker and Cursor Cloud the commander`

Recent landings:

| PR | What |
| --- | --- |
| #8 (`d274cb6`) | AGENTS.md only: Kiro is the worker, Cursor Cloud the commander |
| #7 (`ef9b7d6`) | Paused automatic GitHub Actions for local-dev — 12 workflows, +20/−77 |
| #6 (`b99c9a1`) | Ran Redrob Work on Redrob Code: engine wiring in `apps/app/src/app/lib/opencode.ts`, `redrob-provider.ts`, `apps/desktop/electron/runtime.mjs`, `electron-builder.base.yml`, en/ko locales, plus new tests `engine-directory-header.test.ts`, `redrob-code-spawn.test.ts`, `supported-locales.test.ts` |

Before that: the cloud-removal series (`278f810`, `f7f70da`, `bcdc9fc`) deleting the Den wire
types, connect links, automations and every cloud UI surface, then `auto` becoming the canonical
Redrob model id and the engine reporting itself as Redrob Code everywhere the version surfaces.

**CI is paused.** All 14 workflows in `.github/workflows` are `workflow_dispatch` only. Local
runs are the only gate.

## How to verify locally

`pnpm@11.4.0` (root `packageManager`), Node 24 (`.nvmrc`).

```bash
pnpm install
pnpm typecheck                          # 0 errors — but note: this only filters @redrob/app
pnpm --filter redrob-server typecheck   # 0 errors — root typecheck does NOT cover the server
pnpm --filter @redrob/app test          # 422 pass / 0 fail, 86 files, ~25s
pnpm build:ui                           # exit 0, ~10s
pnpm --filter @redrob/desktop test       # 220 tests: 216 pass / 0 fail / 4 skip
pnpm --filter redrob-server test        # 530 pass / 5 skip / 6 fail — see follow-up 1
pnpm check:outbound-access              # manifest covers 33 hosts, 28 scanned, no stale entries
```

`pnpm typecheck` at the root is `pnpm --filter @redrob/app typecheck` and nothing else, so
server and desktop are not covered by it. Typecheck the server explicitly.

Clear `apps/server/dist` before running the server suite. A stale build leaves compiled copies of
deleted tests that `bun test` also runs; regenerate with `pnpm --filter redrob-server build`.

The Windows-only failure counts that used to be recorded here (120 `EBUSY` server failures, 15
desktop failures) do not reproduce on Linux. On Linux the desktop suite is fully green and the
server suite has exactly 6 failures, all of which reproduce when run file-by-file in isolation —
they are real, not load artifacts.

## Follow-ups that are still real, prioritized

1. **Six reproducible `redrob-server` failures.** All confirmed to fail in isolation, so none is
   a flake:
   - Three `env routes > voice realtime session …` cases in `src/env-routes.e2e.test.ts`. The
     cause is a concrete name mismatch left by the cloud removal: the tests write
     `REDROB_CLOUD_API_KEY`, but `resolveRedrobWorkModelsVoiceConfig` in `apps/server/src/server.ts`
     reads `REDROB_MODELS_API_KEY` (falling back to `process.env`). With no key it returns
     `null`, the broker branch is skipped entirely, and the request falls through to direct
     OpenAI — hence 500 where 200 is expected and 400 where 503 is. Both names are still in
     `PERSISTABLE_INTERNAL_KEYS` in `apps/server/src/env-file.ts`, so the decision is which one
     is canonical, and whether `REDROB_CLOUD_API_KEY` should be read as a legacy alias for
     existing installs.
   - `src/mcp.authorization-link.e2e.test.ts` — `authorization-required MCP tool error
     pass-through` hangs and times out at 30s.
   - `src/mcp.engine-sync.e2e.test.ts` — `does not overlap startup registration with explicit
     cloud reconciliation`. The name still describes cloud reconciliation, which was removed, so
     check whether the test is asserting a contract that no longer exists.
   - `src/serve-node.test.ts` — `handles a malformed raw Node TRACE request without an unhandled
     rejection`.
2. **`packages/docs/cloud/**` still ships 19 cloud pages** (enterprise, SCIM, SSO, shared
   workspaces, cloud MCP, team quickstart). It is inert content, but the docs search tool indexes
   it, so an agent can still surface features the product does not have.
3. **`Settings > Debug` has no agent diagnostics panel.** `apps/server/src/agent-context-*` was
   deleted because its schema required cloud catalog probes, organization connection rows and
   cloud tool IDs as preconditions. If that local visibility is wanted, rebuild it around local
   checks only: engine config, MCP inventory, runtime health.
4. **Orphaned i18n keys outside the removed namespaces.** The 812-key deletion was safe because
   this repo constructs no `t()` keys dynamically. A further sweep would need to confirm each key
   is unreachable first.
5. **One surviving evidence script.** `packages/redrob-bootstrap/evals/agent-test-evidence-redrob-app-install.mjs`
   is the only file in that directory; the other two required a live den-api and are gone. The
   root `evals/` harness is gone with them.

## Do not

- **Do not delete `apps/server/src/cloud-plugins.ts`.** The name says cloud; the file is the
  plugin install/uninstall engine that local Claude Code plugin bundles persist through.
- **Do not remove `LEGACY_MANAGED_MCP_SERVER_NAME_PREFIX`** (`"redrob-connect-"`) from
  `apps/server/src/runtime-opencode-config-store.ts`. An existing install's runtime DB still
  carries rows under that prefix. It is imported by `redrob-runtime-config.ts` and `server.ts`.
- **Do not remove the `REDROB_EVAL_*` env hooks** in `apps/desktop/electron` (`runtime.mjs`,
  `main.mjs`, `preload.mjs`, `updater.mjs`). They are generic fault-injection and
  recovery-fixture seams with their own unit coverage, not leftovers from the deleted eval
  harness.
- **Do not remove `connectSkillSlashCommandOptions`** or the `[connect-skill …]` composer regex
  alternatives (`slash-command.ts`, `composer/editor.tsx`, `queued-messages-panel.tsx`,
  `session-surface.tsx`). Unreachable today, but inert and covered by
  `apps/app/tests/prompt-file-parts.test.ts`.
- **Do not rebuild the Den control plane, Connect links, scheduled automations, or the `cloud`
  and `enterprise` desktop distributions.** Both distributions gated sign-in and an activation
  only a control plane could grant, so either build would now be permanently locked.
- **Do not call bare `fetch` in `apps/server/src`.** External egress goes through `externalFetch`
  and loopback through `loopbackFetch` (`apps/server/src/server-fetch.ts`); `loopbackFetch` is
  only for 127.0.0.1, localhost and managed engine traffic. `pnpm check:outbound-access` and
  `apps/desktop/electron/no-bare-external-fetch.test.mjs` enforce the boundary, and adding a new
  external host requires updating the outbound-access manifest.
- **Do not add a third locale.** `apps/app/tests/supported-locales.test.ts` asserts the language
  registry, the UI options list, the bundle barrel and the locales directory are all exactly
  `en, ko`.
- **Do not accept `x-opencode-directory`.** Redrob Code reads only `x-redrob-directory`.
- **Do not use an HTTP header name containing a space.** `X-Redrob Work-Host-Token` was such a
  bug and every request that set it threw instead of authenticating. The code is correct now
  (`x-redrob-host-token` / `X-Redrob-Host-Token`); do not reintroduce the pattern when renaming.
