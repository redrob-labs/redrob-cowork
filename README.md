# Redrob Work

Redrob Work (레드롭 워크) is a free, open-source desktop and MCP app for doing work with AI agents on your own files. It runs on macOS, Windows, and Linux, is built on the OpenCode engine, and ships in English and Korean.

Add one Redrob Work MCP to Codex, Claude Code, Cursor, or another compatible agent and reuse the same skills, MCPs, and connected services across your tools, teammates, and machines. Create something once, share it with coworkers or friends, or keep it for yourself.

The desktop app is there when you want a dedicated workspace, but it is not required. You can use Redrob Work from the agent you already have. For larger organizations, the admin interface lets you publish capabilities, manage access, and configure shared or per-user connections.

[**Download Redrob Work**](https://redrob.io/download)

> **Note on hosts:** `console.redrob.ai` is the only confirmed Redrob host today. The other `redrob.io` addresses referenced below (for example `redrob.io/download`, `redrob.io/start.md`, `redrob.io/docs`, and `api.redrob.io/mcp/agent`) are provisional placeholders that are not live yet and are subject to change. Use `console.redrob.ai` to issue your API key; treat the download, docs, and MCP-gateway links as to-be-confirmed until this note is removed.

<img width="1481" height="842" alt="Redrob Work desktop app" src="https://github.com/user-attachments/assets/66a8dd9b-5260-488c-957d-e54331e78c1c" />

## Inference provider

Redrob Work uses **Redrob** as its only inference provider, and it is selected by default. There is no provider picker: the app talks to the Redrob endpoint at `https://console.redrob.ai/api/backend/v1` using the model `redrob-ai`.

To connect:

1. Go to [console.redrob.ai](https://console.redrob.ai) and issue an API key.
2. In Redrob Work, open the connect screen and paste your key. It is stored as the `REDROB_API_KEY` credential and is never embedded in the app.

That is the whole setup. Onboarding sends you straight to the console to issue and paste a key, so there is no separate account sign-in step.

## Install with your AI agent

Already use an AI agent? Copy this prompt and paste it into Claude Code, Cursor, Codex, ChatGPT, or any agent that can run commands on your computer.

```text
Install Redrob Work on my computer, set up my first workspace, and open it ready to use. Follow the steps in https://redrob.io/start.md?v=hero
```

1. Installs Redrob Work
2. Creates your workspace
3. Opens it ready to run

## Use Redrob Work from any agent

The Redrob Work MCP brings your assigned skills, plugins, MCP connections, Google Workspace, and Microsoft 365 capabilities into any compatible agent.

It exposes two tools: `search_capabilities` finds what you can use, and `execute_capability` runs it. After adding the MCP, your client opens a browser so you can connect and choose your Redrob Work organization.

> The `api.redrob.io/mcp/agent` gateway URL below is a provisional placeholder and is not live yet. It is documented here for the intended setup; expect the final host to change.

### Codex

```bash
codex mcp add redrob --url https://api.redrob.io/mcp/agent
```

### Claude Code

```bash
claude mcp add --transport http redrob https://api.redrob.io/mcp/agent
```

### OpenCode

Add this to `opencode.json`:

```json
{
  "mcp": {
    "redrob": {
      "type": "remote",
      "enabled": true,
      "url": "https://api.redrob.io/mcp/agent",
      "oauth": {}
    }
  }
}
```

### Any MCP client

Use this remote MCP server URL:

```text
https://api.redrob.io/mcp/agent
```

## Redrob Work Den

Redrob Work Den is the control plane for managing Redrob Work across a team or organization.

- Provision inference at scale and control which members and teams can use it.
- Invite teammates, create teams, and manage access from one place.
- Set desktop policies, restrict local model access, and control which app versions your organization can use.
- Publish skills and plugins through marketplaces, then assign them to the organization, a team, or specific people.
- Import Anthropic-compatible plugins and make their supported skills and remote MCPs available through the Redrob Work MCP.

<img width="1546" height="915" alt="Redrob Work Den organization control plane" src="https://github.com/user-attachments/assets/033dbbfe-5661-4f7c-869c-46278406d6cc" />

## Documentation

[Read the Redrob Work docs.](https://redrob.io/docs)

## Deep links

Redrob Work registers the `redrob://` URL scheme (and `redrob-dev://` in development) so connect links and other deep links open the app directly.

## Local development

Redrob Work is a pnpm + Turborepo monorepo. Use **pnpm** only, and Node 24 (pinned in `.nvmrc`, e.g. `nvm use 24`).

For one checkout, keep using `pnpm dev`; with no extra environment variables it reuses the existing shared dev profile.

To run multiple git worktrees at once, use:

```bash
pnpm dev:worktree
```

That sets `REDROB_DEV_PROFILE=auto`, derives a stable profile name from the worktree path, lets Electron choose a free CDP port, and asks Vite for a free dev-server port. You can also choose a named profile, for example `REDROB_DEV_PROFILE=my-feature REDROB_ELECTRON_REMOTE_DEBUG_PORT=0 PORT=0 pnpm dev`.

`dev:worktree` also defaults `REDROB_ELECTRON_USE_MOCK_KEYCHAIN=1`. A brand-new profile has no stored credentials, so on macOS the real keychain prompts as soon as Chromium persists an authenticated cookie, and that modal blocks Electron's main loop until it is dismissed. Set `REDROB_ELECTRON_USE_MOCK_KEYCHAIN=0` if you specifically want the system keychain in an isolated profile.

Dev startup prints a banner like `[redrob] dev profile=... cdp=http://127.0.0.1:9223`; use it to find the profile directory and pass the CDP URL to local tooling.

If a second instance cannot get the profile lock it now says so and exits, instead of lingering with an open CDP port and no window.

### Headless web (no Electron)

To run the Redrob Work UI in a browser against a local `redrob-server` (no desktop shell):

```bash
pnpm dev:headless-web
```

This is an isolated launcher:

- Writes `tmp/headless-server.json` and never reads `~/.config/redrob/server.json`
- Authorizes the chosen workspace root automatically, and merges (never rewrites) that config on relaunch, so workspaces you add through the UI survive `--replace`
- Starts Vite + `redrob-server` with a stable owner bearer forced into the UI. Crash-restarts reuse that bearer so open tabs keep working; `--replace` mints fresh tokens (pass `--keep-tokens` to preserve them). The privileged host token stays on the server process and is never inlined into the Vite bundle.
- Proxies Den Cloud calls same-origin: Vite serves `/api/den` (forwarded to the Den control plane) and the app pins its Den API there via `VITE_DEN_API_BASE_URL`, so Cloud calls are never CORS-blocked and stale `localStorage` base URLs are cleared on load
- Publishes agent-facing URLs/tokens at `tmp/dev-headless-web.json` (owner-only, `0600`), and allows browser calls to the local server only from the web app's own origins, not every site you visit
- Uses stable ports by default (web `5178`, server `8778`; falls back to free ports when taken, override with `REDROB_WEB_PORT` / `REDROB_PORT`)
- Is single-instance per worktree: re-running it reuses a healthy instance and prints its URL; stale instances are cleaned up automatically; `--replace` forces a restart
- Detaches the servers from the launching terminal, so they survive the terminal closing
- Supports `--detach` to run the whole stack independent of the invoking shell (recommended for agents): it starts detached, waits for health, prints the URLs, and exits

Point Den at a local stack with `REDROB_DEV_DEN_PROXY_TARGET=http://127.0.0.1:3005` while `pnpm dev:web-local` is running. Set `REDROB_DEV_HEADLESS_WEB_DEN_PROXY=0` to disable the Den wiring.

## Supported languages

Redrob Work ships in English and Korean.

README translations: [English](./README.md), [한국어](./README_KO.md).
