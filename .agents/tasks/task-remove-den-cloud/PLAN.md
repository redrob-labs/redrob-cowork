# Remove the Den control plane: Redrob Work becomes local-only

## Decision

Redrob Work stops talking to a hosted control plane. There is no sign-in, no
organization, no server-delivered policy, and no server-delivered branding.
Authentication collapses to a single locally-stored `REDROB_API_KEY`, entered
in onboarding (`domains/onboarding/redrob-key-step.tsx`) or Settings, and used
only as an LLM provider credential.

## Fate of each Den-backed feature

| Feature | Today | After |
| --- | --- | --- |
| Sign-in / session | Den token, org selection, handoff + `den://` deep links | **Removed.** No account concept. |
| Enterprise activation gate | Blocks app until an org server is entered | **Removed.** |
| Org onboarding (`/onboarding`) | Picks org + resources after sign-in | **Removed.** |
| Forced sign-in (`/signin`) | Gates the app when bootstrap demands it | **Removed.** |
| `redrob://connect` deep links | Verify/accept a connect link, re-bootstrap | **Removed.** |
| Desktop policy / restrictions | `getDesktopConfig(orgId)` from Den | **Removed.** Nothing is restricted locally. |
| Org branding (name/logo/icon) | Pushed from Den, can relaunch the app | **Removed.** Fixed Redrob Work branding. |
| Memory | `listMemory(orgId)` / `deleteMemory(orgId, id)` on Den | **Moved local.** SQLite via the local redrob-server. |
| Automations | Defined in Den, scheduled by Den, executed by a registered desktop runner | **Removed.** A scheduler that fires while the app is closed is inherently hosted; there is no local equivalent to move to. |
| Extension marketplaces | Org marketplaces + cloud plugin imports | **Removed.** Local extension install stays. |
| Cloud LLM providers | Org-managed providers, keys distributed to members | **Removed.** User's own key, stored locally. |
| Cloud MCP (`redrob-cloud`) | Org-managed MCP connections, minted tokens | **Removed.** Locally configured MCP stays. |

"Can it be stored locally?" is the test. Memory is pure storage, so it moves.
Automations need an always-on scheduler and cloud MCP/providers need a shared
org, so they have no local form and are deleted rather than reimplemented.

## Why memory becomes global rather than workspace-scoped

The Den memory bank was org-scoped: one set of memories that followed the user
across projects. Workspace-scoping it during the move would silently change the
feature. The local store keeps a single global scope so a memory saved while
working in one repo is still available in the next.

## Sequence

Each step keeps `pnpm typecheck` and `bun test --isolate tests/` green.

1. **Local memory store** (additive; nothing removed yet)
   - `packages/types/src/memory.ts` — wire types, independent of Den.
   - `apps/server/src/local-memory-store.ts` — SQLite-backed, following the
     `createWorkspaceKvStore` pattern already used by
     `redrob-workspace-config-store.ts`.
   - `GET`/`POST`/`DELETE /memory` on the local server.
   - Client methods on `app/lib/redrob-server.ts`.
2. **Point `memory-view.tsx` at the local store**, drop `useCloudSession`, and
   delete the sign-in / no-active-org empty states it no longer needs.
3. **Delete the cloud-only UI surfaces**: `cloud-account`, `cloud-providers`,
   `cloud-marketplaces`, and `connect` settings tabs; `/signin`; `/onboarding`;
   `DenSigninGate`; `EnterpriseActivationGate`; `ConnectLinkProvider`.
4. **Collapse the 19 `useDenAuth()` call sites** to their local branch and
   remove `DenAuthProvider`, `DesktopConfigProvider`, `BrandThemeProvider`, and
   `RestrictionNoticeProvider` from the provider tree.
5. **Delete `app/lib/den*.ts`, `domains/cloud/`, `domains/settings/cloud/`**, and
   the automations domain.
6. **Local server**: drop `routes/cloud-mcp.ts`, `cloud-provider-sync.ts`,
   `cloud-mcp-health.ts`, `cloud-plugins.ts`, `connect-state.ts`, the
   `connect-*-catalog.ts` set, `enterprise-den-origin.ts`, and
   `agent-context-cloud-probe.ts`.
7. **Electron main**: drop `connect-link*.mjs` and the `den://` deep-link path.
8. **Shared packages**: drop `packages/types/src/den/`, `packages/connect-link/`,
   and `packages/enterprise-mcp-client/`.
9. **Tests, eval specs, i18n, docs**: delete the specs covering removed
   surfaces, prune the now-unreferenced `den.*` / `connect.*` / `account.*` /
   `restrictions.*` keys from `en.ts` and `ko.ts`, and remove the cloud docs.

## Known consequences

- Roughly 40 eval specs cover surfaces that stop existing. They are deleted, so
  regression coverage for that behaviour goes away with the behaviour.
- A green typecheck and green unit tests do not prove the desktop app still
  boots. The app needs a manual smoke test: fresh profile, onboarding with a key,
  onboarding via browse mode, and a session that calls a model.
- Existing installs have a Den token and org in `localStorage` plus a
  `bootstrap` file on disk. Those keys are simply never read again; no migration
  reads them, and no memory is carried over from the hosted memory bank.
