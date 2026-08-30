# Redrob Work

Redrob Work (레드롭 워크) is a free, open-source desktop and MCP app for doing work with AI agents on your own files. It runs on macOS, Windows, and Linux, is built on the OpenCode engine, and ships in English and Korean.

Add one Redrob Work MCP to Codex, Claude Code, Cursor, or another compatible agent and reuse the same skills, MCPs, and connected services across your tools, teammates, and machines. Create something once, share it with coworkers or friends, or keep it for yourself.

The desktop app is there when you want a dedicated workspace, but it is not required. You can use Redrob Work from the agent you already have.

[**Download Redrob Work**](https://redrob.io/download)

> **Note on hosts:** `console.redrob.ai` is the only confirmed Redrob host today. The other `redrob.io` addresses referenced below (for example `redrob.io/download`, `redrob.io/start.md`, `redrob.io/docs`, and `api.redrob.io/mcp/agent`) are provisional placeholders that are not live yet and are subject to change. Use `console.redrob.ai` to issue your API key; treat the download, docs, and MCP-gateway links as to-be-confirmed until this note is removed.

<img width="1481" height="842" alt="Redrob Work desktop app" src="https://github.com/user-attachments/assets/66a8dd9b-5260-488c-957d-e54331e78c1c" />

## Inference provider

Redrob Work uses **Redrob** as its only inference provider, and it is selected by default. There is no provider picker: the app talks to the Redrob endpoint at `https://console.redrob.ai/api/backend/v1` using the model `auto`.

To connect:

1. On the connect screen, press **Redrob로 연결**. Redrob Work asks the console for a short code and opens [console.redrob.ai](https://console.redrob.ai) in your browser.
2. Sign in, check the code matches the one the app is showing, and approve it. The console issues one workspace API key and the app collects it by itself.

That is the whole setup. There is no account sign-in inside the app and no key to copy: the key is handed to the Redrob Code engine as the `REDROB_API_KEY` credential and is never shown, never embedded in the app, and revocable from the console's key list at any time.

If a machine cannot open a browser, the same screen still takes a key you paste yourself. Issue one at [console.redrob.ai](https://console.redrob.ai) and paste it there.

## Install with your AI agent

Already use an AI agent? Copy this prompt and paste it into Claude Code, Cursor, Codex, ChatGPT, or any agent that can run commands on your computer.

```text
Install Redrob Work on my computer, set up my first workspace, and open it ready to use. Follow the steps in https://redrob.io/start.md?v=hero
```

1. Installs Redrob Work
2. Creates your workspace
3. Opens it ready to run

## Use Redrob Work from any agent

A hosted Redrob Work MCP gateway is planned: one URL that brings your skills, plugins, MCP connections, Google Workspace, and Microsoft 365 capabilities into any compatible agent through two tools, `search_capabilities` and `execute_capability`.

> That gateway is not available yet and its server is not part of this repository. This repo ships the desktop app and the local `redrob-server`. Setup instructions will land here once the hosted URL is live.

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

## Supported languages

Redrob Work ships in English and Korean.

README translations: [English](./README.md), [한국어](./README_KO.md).
