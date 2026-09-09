# Handoff: redrob-work

Current state of `main` as of 2026-08-29, checked against the tree at `14a4bdd`.

Where a number below was re-measured in this change it says so. Everything else is
carried forward from the 2026-08-28 measurement at `d274cb6` and has not been re-run.

## What this repo is

Redrob Work: a desktop app (Electron) plus a local `redrob-server`, both operating on the
user's own files. **Local-only.** No sign-in, no account, no organization, no hosted control
plane. The Den control plane and every cloud surface that depended on it are gone.

**Redrob Work is the sole GUI.** There is no second client, no web console, and no hosted
dashboard. Everything a user can do happens in this app.

- `apps/app`: the React web UI, built with Vite, rendered by both the browser and the desktop
  shell.
- `apps/server`: `redrob-server`, the local HTTP server. It manages the engine, MCP servers,
  workspaces, sessions and the environment-variable store.
- `apps/desktop`: the Electron shell. It packages the engine as a sidecar.
- `packages/` (14): `codemode`, `docs`, `email`, `enterprise-mcp-client`,
  `enterprise-mcp-mock-server`, `handsfree`, `headless-threads`, `install-config`, `mcp-apps`,
  `paths`, `redrob-bootstrap`, `redrob-ui-mcp`, `types`, `ui`.

### The engine is Redrob Code, pinned in constants.json

`constants.json` at the repo root is the single pin:

```json
{ "redrobCodeVersion": "v0.0.12" }
```

Everything reads that one value:

- `apps/desktop/electron/runtime.mjs` (~line 1777) resolves `constants.json` and throws if
  `redrobCodeVersion` is missing.
- `apps/desktop/scripts/prepare-sidecar.mjs` reads it to fetch the sidecar.
- `apps/desktop/scripts/redrob-code-release.mjs` resolves the matching
  `redrob-labs/redrob-code` release.
- `apps/desktop/scripts/electron-build.mjs` copies `constants.json` beside the server dist so
  the packaged asar can resolve it.
- `apps/server/src/server.ts` imports it directly and surfaces `redrobCodeVersion` through
  `apps/server/src/routes/core.ts`.
- `apps/desktop/electron/runtime.test.mjs` asserts the value is exactly `v0.0.3`, so bumping
  the engine means editing both the constant and that assertion.

The desktop shell resolves the engine binary from `REDROB_CODE_BIN` or the packaged sidecar,
both named `redrob`, and spawns it from `runtime.mjs`. Directory routing is the
`x-redrob-directory` header, set in `apps/app/src/app/lib/opencode.ts` and read in
`apps/server/src/server.ts`; upstream OpenCode's `x-opencode-directory` is not accepted.

### The engine owns the Redrob Key

Inference is the Redrob provider. The user pastes a key issued at console.redrob.ai on the
onboarding key step (`apps/app/src/react-app/domains/onboarding/redrob-key-step.tsx`), and
from there the key belongs to the engine, not to Redrob Work:

- `apps/server/src/server.ts` exposes `GET`, `PUT`, and `DELETE /redrob-auth`, all on the
  `host-token` scope.
- `apps/server/src/redrob-auth.ts` forwards to the engine's own `PUT /auth/redrob`. The
  engine's `auth.json` is the single source of truth. `PUT` is also the rotation path.
  Errors are deliberately opaque so the key cannot leak back through an echoed body.
- **The Work env store does not persist `REDROB_API_KEY`.** `RESERVED_PREFIXES` in
  `apps/server/src/env-file.ts` covers `REDROB_`, and `REDROB_API_KEY` is deliberately absent
  from `PERSISTABLE_INTERNAL_KEYS`, so a write attempt throws `reserved_env_key`. The store
  rejects the name rather than becoming a second place a credential can live.
- Installs that predate that ownership are drained by `migrateLegacyRedrobKey`
  (`redrob-auth.ts`): read the legacy entry, `PUT` it to the engine, delete it only after the
  engine confirms. Deliver-first ordering, so an unreachable engine cannot destroy the only
  copy. Once per process, never logged.

Other providers are added with their own API keys, and credentials the engine needs go through
`Settings > Environment`. MCP servers, skills, commands, agents and Anthropic-compatible
plugins are workspace-local; Claude Code plugin bundles install from public GitHub repos.

Localization is exactly English and Korean, locked at four layers by
`apps/app/tests/supported-locales.test.ts`. `ko.ts` is deliberately smaller than `en.ts` (430
keys against 1171): it is an overlay and `t()` falls back to English, which the test asserts by
allowing missing Korean keys but rejecting Korean keys English lacks.

## Current main

`14a4bdd`, `chore(desktop): pin the sole-GUI Redrob Code engine v0.0.3 (#11)`

Recent landings:

| PR | What |
| --- | --- |
| #11 (`14a4bdd`) | Pinned the sole-GUI Redrob Code engine to `v0.0.3` in `constants.json`, with `runtime.test.mjs` asserting the value |
| #10 (`1cfcb08`) | Made Redrob Code own the Redrob Key: host-token `/redrob-auth` routes, engine `PUT /auth/redrob`, legacy-key migration, and `REDROB_API_KEY` reserved again in the env store |
| #8 (`d274cb6`) | AGENTS.md only: Kiro is the worker, Cursor Cloud the commander |
| #7 (`ef9b7d6`) | Paused automatic GitHub Actions for local-dev |
| #6 (`b99c9a1`) | Ran Redrob Work on Redrob Code: engine wiring, en/ko locales, plus `engine-directory-header.test.ts`, `redrob-code-spawn.test.ts`, `supported-locales.test.ts` |

Before that: the cloud-removal series (`278f810`, `f7f70da`, `bcdc9fc`) deleting the Den wire
types, connect links, automations and every cloud UI surface, then `auto` becoming the canonical
Redrob model id and the engine reporting itself as Redrob Code everywhere the version surfaces.

**CI is paused.** All 14 workflows in `.github/workflows` are `workflow_dispatch` only
(`aur-validate.yml` also declares `workflow_call`, which only another workflow can reach).
Local runs are the only gate.

## Open related PRs, not on main

- **#12, branch `cursor/server-test-fixes-5724`** (`b0674b1`,
  `fix(server): clear the six reproducible redrob-server failures`). Reports 557 pass / 0 fail
  on the server suite. Seven files: `env-file.ts`, `env-routes.e2e.test.ts`,
  `mcp.authorization-link.e2e.test.ts`, `mcp.engine-sync.e2e.test.ts`, `serve-node.ts`,
  `serve-node.test.ts`, `server.ts`. It makes `REDROB_MODELS_API_KEY` canonical for the voice
  broker and keeps `REDROB_CLOUD_API_KEY` readable as a legacy alias, because that is the name
  existing installs carry on disk. **This is not merged.** Do not describe the six failures as
  fixed on `main`, and do not re-fix them here.
- **This PR, branch `cursor/docs-handoff-5724`.** Deletes `packages/docs/cloud` (19 pages) and
  the dead `snippets/redrob-connect-installer.jsx`, rewrites every page that pointed into that
  tree, and rewrites this file. After it lands, `packages/docs/cloud` is gone and follow-up 2
  from the previous handoff is closed.

## How to verify locally

`pnpm@11.4.0` (root `packageManager`), Node 24 (`.nvmrc`).

```bash
pnpm install
pnpm typecheck                          # only filters @redrob/app
pnpm --filter redrob-server typecheck   # root typecheck does NOT cover the server
pnpm --filter @redrob/app test          # 422 pass / 0 fail, 86 files, ~25s
pnpm build:ui                           # exit 0, ~10s
pnpm --filter @redrob/desktop test      # 220 tests: 216 pass / 0 fail / 4 skip
pnpm --filter redrob-server test        # 530 pass / 5 skip / 6 fail on main; see #12
pnpm check:outbound-access              # manifest covers 33 hosts, 28 scanned, no stale entries
```

Those counts are the 2026-08-28 measurement and were **not** re-run for this change. A
docs-only change does not need them: this one was proved with the docs-relevant checks below.

```bash
pnpm --filter redrob-server typecheck                                            # exit 0
cd apps/server && bun test src/opencode-plugins/redrob-capabilities-knowledge.test.ts
# 7 pass / 0 fail, 26 expect() calls
```

That test file is the docs search and index gate. It now also asserts the docs tree itself:
`packages/docs/cloud` is absent, `packages/docs/self-host/deploy-to-your-cloud/overview.mdx`
still exists, `docs.json` navigation contains no `cloud/` page and no redirect destination
under `/cloud/`, every navigation page id resolves to a bundled `.mdx`, and a docs search for
cloud org terms surfaces nothing. Restoring the deleted tree turns two of those assertions red,
which is how the gate was confirmed to mean something.

Navigation and internal links were checked directly against the tree: 51 navigation page ids,
all resolving, and 0 broken internal `/...` links across all 51 remaining `.mdx` pages.

Prose in this file was verified by reading the code it describes, not by running the app. Every
claim above about `constants.json`, `/redrob-auth`, `env-file.ts`, the workflow triggers, the
locale counts, and the `Do not` entries was checked by opening the file named. No runtime proof
was gathered for them, and none is claimed.

`pnpm typecheck` at the root is `pnpm --filter @redrob/app typecheck` and nothing else, so
server and desktop are not covered by it. Typecheck the server explicitly.

Clear `apps/server/dist` before running the server suite. A stale build leaves compiled copies of
deleted tests that `bun test` also runs; regenerate with `pnpm --filter redrob-server build`.
`apps/desktop/server/dist` carries the same hazard and currently holds a compiled tree.

The Windows-only failure counts that used to be recorded here (120 `EBUSY` server failures, 15
desktop failures) do not reproduce on Linux.

## Follow-ups that are still real, prioritized

1. **`Settings > Debug` has no agent diagnostics panel.** `apps/server/src/agent-context-*` was
   deleted because its schema required cloud catalog probes, organization connection rows and
   cloud tool IDs as preconditions. If that local visibility is wanted, rebuild it around local
   checks only: engine config, MCP inventory, runtime health. Nothing depends on it today, so
   this is a want, not a break.
2. **Orphaned i18n keys outside the removed namespaces.** The 812-key deletion was safe because
   this repo constructs no `t()` keys dynamically. A further sweep would need to confirm each key
   is unreachable first. Known stragglers: `extensions.disabled_by_organization` in
   `apps/app/src/react-app/domains/settings/pages/mcp-view.tsx`, and
   `settings.redrob_server_desc` in `en.ts`, which still calls the local server a "control
   plane".
3. **One surviving evidence script.** `packages/redrob-bootstrap/evals/agent-test-evidence-redrob-app-install.mjs`
   is the only file in that directory; the other two required a live den-api and are gone. The
   root `evals/` harness is gone with them.
4. **`docs/enterprise/outbound-access.json` still lists the retired hosted origins.**
   `packages/docs/start-here/outbound-network-access.mdx` now marks `app.redrob.io`,
   `api.redrob.io`, and the `.software` pair as not required, but the machine-readable manifest
   that `pnpm check:outbound-access` guards was left alone. Reconcile the two together, since the
   script scans source for host literals and will complain if the manifest and the code disagree.
5. **`packages/ui/src/react/roadmap.tsx` no longer says Cloud is the control plane.** The
   central-management section now describes a Redrob Work server the team hosts, so the
   component and `packages/docs/roadmap.mdx` agree again.
6. **`packages/docs/changelog.mdx` still names Redrob Work Cloud in historical entries.** That
   file is generated by `scripts/generate-changelog.mjs` from `changelog/release-tracker-*.md`,
   so hand-editing it would be overwritten and would also falsify a dated record. Left as is on
   purpose.

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
