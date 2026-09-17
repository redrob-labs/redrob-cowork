# Handoff: redrob-work

Current state as of 2026-09-17 16:00 UTC, checked against `develop`, which is now the default branch.

Where a number below was re-measured it says so. A number carried forward from an earlier
measurement is marked as such and has not been re-run.

## What this repo is

Redrob Cowork: a desktop app (Electron) plus a local `redrob-server`, both operating on the
user's own files. **Local-only.** No sign-in, no account, no organization, no hosted control
plane. The Den control plane and every cloud surface that depended on it are gone.

**Redrob Cowork is the sole GUI.** There is no second client, no web console, and no hosted
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
{ "redrobCodeVersion": "v1.18.31-redrob.9" }
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
from there the key belongs to the engine, not to Redrob Cowork:

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

`8cde784`, `Summarise when the button is pressed, instead of typing into the composer (#36)`.
Released: **`v0.1.12`**, 30 assets, four `latest*.yml`, all six platform builds green. The
Windows download was verified by downloading it: 200, 199,558,792 bytes.

Recent landings:

| PR | What |
| --- | --- |
| #36 (`8cde784`) | The paraphrase and compare controls, the streaming variant panel, the summarise-directly button, and the context row that no longer takes its button with it |
| #35 (`a455836`) | Engine pin to `v1.18.31-redrob.9` |
| #34 (`5c8a079`) | Routed model beside the cost, answer chips |
| #33 (`18e4664`) | Transcript on the composer's column, manual-summarise gate removed |
| #32 (`899e346`) | Engine pin to `redrob.8`, the first that carries the billed cost |

The engine's side of the same work: `redrob-code` #24 named `routedModel` and `upstreamProvider`
through v1 and v2 `Assistant`, `getUsage` and the processor, and #25 added the compaction cost
ceiling (`compaction.maxTurnInputCostUsd`, default `0.5`). The console's side: #105 through #108,
merged and deployed, which put the billed cost in the streaming response and added model
popularity to the usage page.

**CI runs the tests now.** `ci-tests.yml` was `workflow_dispatch` only and is now on `pull_request`
plus pushes to `main` and `develop`. That change alone surfaced six defects that had been sitting on
`develop` unreported, because a suite that runs only on request is a suite nobody runs:

| Defect | Why it was invisible |
| --- | --- |
| `buildNukeManifest` could not clear a dev profile's own data dir | desktop suite never ran on a PR |
| the chain repair total timeout was `unref`'d, so the bound never fired | same |
| the engine pin was asserted by equality against a literal five releases stale | failed on every bump, silently |
| a server test expected `OpenCode base URL is missing` after the rename to `Redrob Code` | server suite never ran on a PR |
| `typecheck:electron` failed on `develop` on a `spawnSync` overload | that step only ran on dispatch |
| `redrob-labs/redrob-work` (404) in the rollback script, the changelog generator and its own checker | the checker agreed with the generator, and both were wrong |

The last one is the one to remember: the updater assertions that named the dead repository carry
`skip: process.platform !== "darwin"`, so they never run on Linux either. A macOS-only assertion behind
a paused workflow had not been executed since the rename.

`ci-tests.yml` is **not yet a required check.** It should report green on real pull requests, in both
matrix legs, before anything is gated on it.

## Gitflow, and what enforces it

`develop` is the default branch in all twelve repositories, `main` is released state, and
`main` is contained in `develop` in every one of them (`git rev-list --count origin/develop..origin/main`
is 0 across the board).

`.github/workflows/gitflow.yml` is installed in all twelve and carries two jobs on two triggers,
because the two questions can only be answered at different moments:

- `branch name follows the convention`, on `pull_request`: the head branch must be `<type>/<slug>` with
  a type this repository's own documentation declares. `develop` and `main` pass as themselves, since a
  promotion or a back-merge is not named after a type.
- `main is contained in develop`, on push to `main`: fails while `main` holds a commit `develop` does
  not, listing them.

Neither job has a branch filter on `pull_request`, deliberately. A filter that omits the default branch
silently stops running: that happened in `redrob-design`, where `ci.yml`, `preview.yml` and
`native-contracts-image.yml` all filtered on `[main, master]` and reported **zero** checks on a pull
request once `develop` became the default.

**A promotion always leaves `main` one commit ahead**, because the merge commit lives there alone. That
is not a tooling accident, it is the shape of gitflow, and the back-merge check fires on it every time.
Open the back-merge immediately after the promotion; the release guard in the release workflow refuses
to tag a `main` that `develop` has moved past.

## Verifying in the running app, not in the suite

Every defect in #36 passed a green suite. The suite is a floor, not a gate, and the two traps below
are what made "tested" and "works" different words.

```bash
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
cd apps/app && pnpm exec vite --port 5433 --host 127.0.0.1 --strictPort &
cd ../.. && DISPLAY=:0 ELECTRON_DISABLE_SANDBOX=1 \
  REDROB_ELECTRON_START_URL=http://127.0.0.1:5433 pnpm --filter @redrob/desktop exec electron . &
```

Vite HMR picks up edits, so a change is testable in the window that is already open.

**Trap 1: the app starts its own engine.** Starting one by hand and pointing at its port proves
nothing: the app spawns a per-workspace engine and talks to it at
`/workspace/<ws>/opencode/...`. An engine change is therefore NOT verifiable this way, only an app
change is. Engine work has to go through a release and the pin.

**Trap 2: the pricing catalogue does not load in dev.** `GET /pricing` answers 200 with all 323
rows, but sends no `access-control-allow-origin` for `http://127.0.0.1:5433`, so the renderer's
fetch throws and the app falls back to an empty catalogue. Consequence: every price column reads
`—` and the context percentage is unknown. That is a dev-origin artifact, not a product defect, and
anything downstream of the catalogue cannot be judged in this window.

The app's own request log is the fastest diagnostic there is. A feature that silently does nothing
usually shows up as a request that was never made: #36's fork was invisible in the app and equally
invisible in the log, and that absence is what identified the wrong client.

## Open related PRs, not on main

- **#12, branch `cursor/server-test-fixes-5724`** (`b0674b1`). Reports 557 pass / 0 fail on the
  server suite. Makes `REDROB_MODELS_API_KEY` canonical for the voice broker while keeping
  `REDROB_CLOUD_API_KEY` readable as a legacy alias, because that is the name existing installs
  carry on disk. **Still not merged.** Do not describe the six server failures as fixed on `main`,
  and do not re-fix them here.

## How to verify locally

`pnpm@11.4.0` (root `packageManager`), Node 24 (`.nvmrc`).

```bash
pnpm install
pnpm typecheck                          # only filters @redrob/app
pnpm --filter redrob-server typecheck   # root typecheck does NOT cover the server
pnpm --filter @redrob/app test          # 859 pass / 0 fail, 135 files, ~26s  (2026-09-17)
pnpm --filter @redrob/desktop typecheck:electron  # 0 errors; CI runs this and it used to fail here
pnpm build:ui                           # exit 0, ~10s
pnpm --filter @redrob/desktop test      # 285 tests: 281 pass / 0 fail / 4 skip  (2026-09-17)
pnpm --filter redrob-server test        # 590 pass / 5 skip / 0 fail  (2026-09-17)
pnpm check:outbound-access              # manifest covers 33 hosts, 28 scanned, no stale entries
```

App, desktop and server were all re-measured on 2026-09-17 and all exit 0. The remaining counts are
the 2026-08-28 measurement and were not re-run.

**Judge by the exit code, not by the pass count.** `pnpm test` prints `859 pass / 0 fail` and still
exits 1 when a file fails to LOAD: a module-level throw is reported as `1 error` beside the
summary, its tests are never counted, and grepping for `(fail)` finds nothing. That happened in
this round and was briefly reported as green.

```bash
pnpm --filter @redrob/app test > /tmp/app.log 2>&1; echo "exit=$?"; tail -5 /tmp/app.log
```

`pnpm typecheck` at the root is `pnpm --filter @redrob/app typecheck` and nothing else, so server
and desktop are not covered by it. Typecheck the server explicitly.

Clear `apps/server/dist` before running the server suite. A stale build leaves compiled copies of
deleted tests that `bun test` also runs; regenerate with `pnpm --filter redrob-server build`.
`apps/desktop/server/dist` carries the same hazard.

The Windows-only failure counts once recorded here (120 `EBUSY` server failures, 15 desktop
failures) do not reproduce on Linux.

## Follow-ups that are still real, prioritized

1. **`routedModel` is stored but not rendered beside the cost.** The console sends it (measured on
   the wire: the final stream chunk carries `routedModel`, `upstreamProvider`, `costUsd`) and the
   engine stores it, so the break is in the engine-to-app hop or in the app's `readMessageUsage`.
   Note that `usechat-adapter.ts` narrows its cast and must name every field, which is the shape of
   the bug that once lost the cost for streaming callers only.
2. **A 384k-token request was billed entirely at the short-context rate.** `384,023 x $3.15/M +
   12 x $15.75/M = $1.209861` matches the logged charge exactly, so the long-context rate was not
   applied past the model's 200k boundary, while the billing card says it is. Either the billing is
   wrong or the card is; both are ours.
3. **Fork sessions from early variant runs are still in the sidebar.** They predate the discard fix
   in #36, which now deletes a run's forks. Existing ones need clearing by hand.
4. **Popularity in the model picker needs a proxy.** The column was built and then removed on
   request. It cannot be sourced honestly from the renderer: the renderer holds no API key by
   design, so the console's account-scoped `request_logs` aggregate is out of reach from there. A
   local per-send counter is the alternative, and it can only count from the day it ships. Doing
   this properly means the main process or the engine proxying an API-key-authenticated call.
5. **The resolved out-of-credit card still shows its call to action.** It is a transcript record of
   a turn that failed, and it keeps telling the user to add credit after later turns have succeeded.
6. **Steering is deferred.** `delivery` is already on the v2 HTTP API
   (`packages/server/src/handlers/session.ts:148`); the app talks to v1, so bridging is an
   architecture change and its own release.
7. **`Settings > Debug` has no agent diagnostics panel.** `apps/server/src/agent-context-*` was
   deleted because its schema required cloud catalog probes as preconditions. Nothing depends on it
   today, so this is a want, not a break.
8. **Orphaned i18n keys outside the removed namespaces.** Known stragglers:
   `extensions.disabled_by_organization` in `mcp-view.tsx`, and `settings.redrob_server_desc` in
   `en.ts`, which still calls the local server a "control plane".
9. **`docs/enterprise/outbound-access.json` still lists the retired hosted origins.** The prose page
   marks them as not required; the machine-readable manifest that `pnpm check:outbound-access`
   guards was left alone. Reconcile the two together.

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
- **Do not gate a control on a number it does not need.** The context row returned `null` when the
  percentage was unknown and took the summarise button with it, which in dev is always. Whether a
  reading can be computed has nothing to do with whether the action behind it is available, and the
  same mistake had already been made once by hiding the button below 50% full.
- **Do not construct a second engine client.** `session-route.tsx` uses the app's own
  `opencodeClient`. A client built from the endpoint and token looks equivalent and is not: its fork
  request never reached the server, with no error and no log line.
- **Do not put layout classes on a row instead of the shared column.** `CHAT_COLUMN` and
  `CHAT_COLUMN_OUTER` in `components/chat/chat-column.tsx` are the only place the inset lives, so a
  row cannot lose it to an overriding component or apply it twice. Three separate alignment defects
  came from copies of those classes.
- **Do not translate `paraphrase` or `compare` in `ko.ts`.** Both name a specific action in this
  product, and the translated forms read as an edit and as the retry button beside them. They are
  registered in the residual-English guard's allow list for that reason.
- **Do not use an HTTP header name containing a space.** `X-Redrob Cowork-Host-Token` was such a
  bug and every request that set it threw instead of authenticating. The code is correct now
  (`x-redrob-host-token` / `X-Redrob-Host-Token`); do not reintroduce the pattern when renaming.
