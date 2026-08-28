# Handoff: Redrob Work is local-only

The Den control plane and every cloud surface that depended on it are gone. This
document is the state of `main` after that removal: what the app is now, what was
taken out, what was deliberately left, and how to verify the tree.

## What the product is now

- A desktop app plus a local `redrob-server`, both operating on the user's own
  files. No sign-in, no account, no organization, no hosted control plane.
- Inference is the Redrob provider only: paste a `REDROB_API_KEY` issued at
  console.redrob.ai on the connect screen. Other providers are added with their
  own API keys in `Settings > AI Providers`.
- MCP servers, skills, commands, agents, and Anthropic-compatible plugins are all
  workspace-local. Claude Code plugin bundles still install from GitHub.

## Removed

Server (`apps/server`)
- Cloud MCP routes, health, and reconcile machinery.
- Connect state, skill catalog, automation catalog, MCP-server catalog, and their
  shared transport.
- Cloud provider sync, desktop cloud resource sync, enterprise Den origin gate,
  Cloud upload extension.
- The agent-context diagnostics feature. Its schema required cloud catalog
  probes, organization connection rows, and cloud tool IDs as preconditions, so
  with Cloud gone there is no report left to produce.
- Agent steering that described a control plane: the capabilities-knowledge
  document's Cloud/Connect/Automations sections, the provider adapters' Connect
  capability contribution, and Cloud-readiness extension steering (now always
  local extension discovery + local skill authoring).

App (`apps/app`)
- Cloud client methods (`getRedrobCloudMcpHealth`, reconcile, engine refresh) and
  the Advanced page's Cloud MCP diagnostics.
- The gateway runtime: nothing injected `window.__REDROB_GATEWAY__` after
  den-gateway was deleted, so the Den bearer, same-origin gateway base URL, and
  workspace-creation gate were unreachable.
- Den library publishing (`/v1/plugins` bundles, My Library polling) and the
  Library "Add" components.
- The unreachable Connect connection surface in the extensions inventory, the
  `redrob-connect` skill origin, and the `connect` settings tab (no renderer).
- 812 i18n keys the removal left unreachable, including the whole `den.*` and
  `connect.*` families (`en.ts` went from 1984 keys to 1172).

Desktop (`apps/desktop`)
- The `cloud` and `enterprise` distributions. Both gated sign-in and an
  activation only a control plane could grant, so either build would now be
  permanently locked: electron-builder configs, release matrix legs, package
  scripts, the IPC preactivation allowlist, and the activation checks are gone.
- Connect links: verifier, replay guard, embedded public keys, keypair
  generator, and the `connectLinkVerify` / `connectLinkAccept` IPC pair.
- The scheduled-automation runner (it polled a Den runner endpoint with
  server-signed credentials).
- The desktop bootstrap payload is reduced to local brand fields; the handoff
  grant, prepared org/skill, claim links, and enterprise activation are gone.

Shared and tooling
- `packages/types/src/den/**` (7 modules, no consumers), `connect-link`,
  `connection-action-app`, `automations`, `workflows`, the agent-context
  diagnostics schema.
- `packages/connect-link`, `packages/automations`, the connection-action MCP app.
- The `evals/` harness and its CI lanes (107 of its 141 specs drove Den), the
  eval-only agent skills, `scripts/dev-web-local.sh`, `scripts/dev-den-local.sh`,
  `check-connect-installer-parity`, `generate-desktop-versions`, the
  `update-models` workflow, and the `redrob-models` / `desktop-den-sync-review`
  skills.
- The bootstrap CLI's `cloud` command family; `start.md` is now a local install
  flow.
- `.env.dev` (its loader no longer exists) and the warden desktop↔den sync
  clearance path.

Also fixed on the way: `X-Redrob Work-Host-Token` was not a valid HTTP header
name, so every request that set it threw instead of authenticating. Readers
already used `x-redrob-host-token`; only the writers were broken. The Linux
`.desktop` keys had the same space-in-identifier bug.

## Kept deliberately

- `apps/server/src/cloud-plugins.ts` — named "cloud" but it is the plugin
  install/uninstall engine that local Claude Code plugin bundles persist through.
- `LEGACY_MANAGED_MCP_SERVER_NAME_PREFIX` in `runtime-opencode-config-store.ts`
  and the legacy `X-Redrob Work-*` `.desktop` key readers — an existing install's
  runtime DB and desktop entry still carry the old names.
- `REDROB_EVAL_*` env hooks in `apps/desktop/electron` — generic fault-injection
  and recovery-fixture hooks with their own unit coverage.
- The `[connect-skill ...]` composer regex alternatives and
  `connectSkillSlashCommandOptions` — unreachable now, but inert and covered by
  tests.
- `packages/docs/cloud/**` — documentation-site content, not code.

## Verification

```bash
pnpm typecheck                          # 0 errors
pnpm --filter @redrob/app test          # 414 pass / 0 fail
pnpm build:ui                           # exit 0
pnpm --filter redrob-server test
pnpm --filter @redrob/desktop test
```

Two caveats when running the non-app suites on Windows:

1. Clear `apps/server/dist` first. A stale build leaves compiled copies of
   deleted tests that `bun test` also runs; regenerate with
   `pnpm --filter redrob-server build`.
2. Both suites have pre-existing environment failures unrelated to this work:
   - `redrob-server`: 120 failures, all from `EBUSY` when `afterEach` removes a
     temp directory (Windows file locking) and `Managed OpenCode process did not
     exit after SIGKILL` (POSIX signal semantics).
   - `@redrob/desktop`: 15 failures — Linux AppImage integration, nuke cleanup,
     chain repair, and the `HOME`/`XDG` desktop-bootstrap precedence tests.

Both counts were confirmed identical to their pre-removal baselines, so a green
CI run on Linux is the real gate.

## Follow-ups

- `apps/server/src/agent-context-*` is gone, so `Settings > Debug` no longer has
  an agent diagnostics panel. If that local visibility is still wanted, rebuild
  it around local checks only (engine config, MCP inventory, runtime health).
- `packages/docs` still ships the cloud documentation tree. It is inert content,
  but the docs search tool indexes it, so an agent can still surface cloud pages.
- Several i18n keys outside the removed namespaces were already orphaned before
  this work; a sweep would need to confirm each key is unreachable first (this
  repo has no dynamic `t()` key construction, which is what made the 812-key
  deletion safe).
- `packages/redrob-bootstrap/evals/agent-test-evidence-redrob-app-install.mjs` is
  the only surviving evidence script; the other two required a live den-api.
