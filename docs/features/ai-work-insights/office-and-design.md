# Work labels for Redrob Office and Redrob Design: scope

Status: agreed (2026-10-08). The model is **downloaded on first use**, silently, not bundled in the installer.

Today only Cowork labels its sessions. Office and Design appear in the Console's insights as usage-only traffic: cost, model and language from the gateway, with no mode, kind of work, outcome or habits. This document scopes giving both apps the same labels as Cowork (see `README.md` and `model-evaluation.md`), with the same rule: the text stays on the machine, and only labels go to the Console.

## What each app needs

1. **A session recorder.** It folds the app's agent events into one tally per session (the turns, things produced, checks, aborts and agent steps), the same way Cowork's `insights/recorder.ts` does.
2. **The work classifier.** It reads the session's first message on the machine and names the kind of work and its family.
3. **A session header.** Every model request carries `x-redrob-session`, so the Console can join a labeled session to what its requests cost.
4. **An outbox and sync.** Finished sessions are queued on disk and posted to `POST /v1/insights/sessions` with the app's Redrob key, in batches.
5. **The model, downloaded on first use.**

The Console needs no change. `office` and `design` are already labeling tools (`detail: 'full'` in console `insights/reference.ts`), and a device-flow key issued to `office` or `design` already reports under that tool (`PRODUCT_TOOL`).

## One shared package

Points 1, 2 and 4 are the same logic in all three apps, so they move out of Cowork into **`@redrob-labs/work-labeller`** (`packages/work-labeller`). It is published the way `@redrob-labs/route-labeller` is: from this repository, on a `work-labeller-v*` tag. Office and Design import it; Cowork's server imports it too, so the three cannot label differently.

| Entry | Contents | Used by |
| --- | --- | --- |
| `.` (runtime-neutral) | Tokenizer (`unigram.ts`), heads (`work-head.json`), `labelEmbedding`, pinned manifest, `SessionTally` → `labelSession` and the mode rules, the payload type, and `syncBatch`. Bytes in; no filesystem. | All three |
| `./node` | `onnxruntime-node` session, model download and cache, file outbox | Office, Cowork |
| `./web` | `onnxruntime-web` (WASM) session from bytes the caller provides | Design |

Each app maps its own events to the package's facts. Only that mapping is app-specific.

## Download on first use

- **Source.** The same GitHub release Cowork's build uses: `insights-model-e5-base-2026.10` on `redrob-labs/redrob-cowork`, which is a public repository. It holds `model_int8.onnx` (278 MB) and `tokenizer.json` (17 MB). The package pins both SHA-256 values in its manifest, so a new model means a new package version.
- **Checked:**
  - The release URL redirects (302) to `release-assets.githubusercontent.com`.
  - That host answers byte ranges (206), so a broken download can resume.
  - **Neither hop sends CORS headers.** A webview or browser `fetch` cannot read these files, so the download must run natively: Node in Office, Rust in Design.
- **When.** In the background, after the person's first AI chat finishes. Never at startup, and never while a chat is streaming.
- **Integrity.** The file is streamed to `<cache>/<revision>/<file>.partial` and hashed while it streams. It is renamed into place only if the hash matches, and hashed again on every load, as Cowork does. Before starting, the app checks there are 600 MB free. A failure retries later with back-off; it never interrupts a chat.
- **Cache location:**
  - Office: `userData/models/insights/`.
  - Design: the Tauri app-local data directory, under `models/insights/`.
  - An app update that pins a new revision deletes the old one.
- **Sessions finished before the model is ready** get their structural labels (mode, outcome, checks, agent figures) but no kind of work or family. Their first message is not held back to label later, because that would mean keeping text.
- **Status.** Settings shows the model's state: not downloaded, downloading with a percentage, ready, or failed with the reason, as Cowork reports `workModel`. This needs new strings in every locale of each app.

## Redrob Office (Electron)

- **Where it runs.** Run the recorder, classifier and outbox in an Electron `utilityProcess` started by the shell's main process. The model takes about 780 MB resident and 14 ms of CPU per label, and keeping that out of the main process keeps windows responsive. `onnxruntime-node` is added to `apps/shell`, with its native binaries unpacked from asar. Cowork's `electron-builder` configuration shows the rules.
- **What a session is.** Office has no session id. A session is one per-document chat (`projectApi.resolveChat` → `{projectId, chatId}`). It runs from its first run until "New chat" (`loop.reset()`), or until 15 minutes pass with nothing running. The external id is `of_` plus a hash of `chatId` and the session's start.
- **Events.** These come from `AgentLoopEvents` in `packages/agent-core/src/loop.ts`, which every editor's AI panel already wires:

  | Event | Fact |
  | --- | --- |
  | `run(instruction)` | user turn; the first one's instruction goes to the classifier, then is dropped |
  | `onToolStart` / `onToolExecuted` | tool call; a call with `execution.mutated` produced something |
  | `onDone({cancelled})` | turn end, abort |
  | `onError(code)` | failed turn |
  | `setDocSavedHook` | the document was saved: something was produced |

  The renderer sends these facts to the shell over one new IPC channel. Facts carry no text; the first instruction travels once, on its own message.
- **Header.** `authHeaders` in `packages/ai-provider/src/redrob-engine.ts` adds `x-redrob-session` when the caller passes a session id. `ai:stream` carries the id from the renderer.
- **Editors.** Docs, Sheets and Slides first, since they have agent panels. PDF, Markdown and Hangul follow if they use `AgentLoop`.
- **What Office cannot report.** Office has no subagents and no permission prompts, so mode tops out at Delegate (4) and "auto-approved" is always true. The Console already marks `office` as `orchestrates: false`.
- **Privacy.** Add a section to `PRIVACY.md` on what goes to the Console (labels and counts about each AI session, never content) and on the model download.

## Redrob Design (Tauri)

- **Download in Rust.** The existing `proxy_http_request` cannot carry 278 MB: it holds the whole body in memory and returns it to the webview as a JSON number array, with a 30 s timeout. Add a `download_verified(url, sha256, dest)` command:
  - reqwest streaming to disk;
  - SHA-256 computed while it streams, with the `sha2` crate;
  - resume by byte range;
  - progress reported as Tauri events.

  Its capability must be limited to the release host.
- **Inference, recommended: `onnxruntime-web` in the webview.** It reuses the package's `./web` entry, so the tokenizer and heads are the code already proven against the Python reference. The webview reads the cached files with the fs plugin, which already has read access.
  - **The alternative** is the `ort` crate behind a Tauri command, with the Rust `tokenizers` crate. It is native speed and keeps the model's memory out of the webview. But it is a second implementation of the heads and decision rule, and it adds onnxruntime's native library to all five desktop targets.
  - **Spike first:** measure the webview (WKWebView, WebView2, WebKitGTK) on the 296 evaluation samples for parity, latency and memory. Switch to `ort` only if WASM is too slow or too large there.
- **Browser build.** The browser cannot download the model (no CORS on release assets). It still records sessions with structural labels, and sends no kind of work.
- **What a session is.** One `Chat` per editor tab in `createChatSessionManager` (`src/app/ai/chat/transports.ts`). It runs from the first `sendMessage` (`src/app/ai/chat/submission/use.ts`) until `resetChat`, a tab close, or 15 minutes quiet. External id: `dz_` plus a hash.
- **Events:**

  | Event | Fact |
  | --- | --- |
  | `sendMessage` | user turn; the first message's text goes to the classifier |
  | `ToolLoopAgent.onStepFinish` | agent step |
  | AI tool calls (`createAITools`) | tool call; a call that changes the scene is "produced", from the editor event bus (`EditorEvents`) |
  | Export | output sent outward |
  | `onFinish({isAbort, isError})` | turn end, abort |

- **Only the Redrob provider.** Sessions through OpenRouter, ACP agents (Claude, Codex, Gemini) or Pi don't go through the Console, which has no cost or model to join them to. They are not recorded.
- **Header.** `createOpenAICompatibleAdapter` (`src/app/ai/providers/compatible.ts`) passes `headers: { 'x-redrob-session': id }` for the `redrob` provider only.
- **What Design cannot report.** Design has no subagents, and the Console marks `design` as `agentic: false`. So the proposal is that mode tops out at Iterate (3) and agent figures are not sent, even though the tool loop takes several steps. Whether those multi-step runs should count as Delegate is a question for the Console's tool table, not for this work.
- **Repository rules.** New strings go in a narrow i18n catalog for all 9 locales (`check:i18n`), plus an `Unreleased` changelog entry. `bun run check` must pass.

## Pull requests, in order

| # | Repository | Change |
| --- | --- | --- |
| 1 | cowork | Extract `@redrob-labs/work-labeller`, and switch Cowork's server to it with no change in behaviour (the parity tests move with it) |
| 2 | cowork | `./node`: download on first use, cache and the file outbox. Publish `work-labeller-v1.0.0` |
| 3 | office | Session id and header, the recorder over `AgentLoopEvents`, the utility process with the classifier, sync, Settings status, `PRIVACY.md` |
| 4 | design | Spike: `onnxruntime-web` parity, latency and memory in each webview (a measurement, like `model-evaluation.md`) |
| 5 | design | `download_verified` in Rust, the recorder, header, classifier, sync, Settings status, i18n |

**Proof for each app:**
- the same labels as the Python reference on the 296 evaluation samples;
- a recorded session that reaches the outbox with its labels and no text;
- the Console accepting the batch.

Cowork's #135 and #136, and Console's #224, land first.

## Decisions (2026-10-08)

1. **Download silently.** There is no prompt; Settings shows the status. This matches how Cowork sends labels.
2. **Design runs the model as WASM in the webview**, after the spike (PR 4) confirms parity, latency and memory. Native `ort` is the fallback if it does not.
3. **Office: Docs, Sheets and Slides first**; PDF, Markdown and Hangul later.

## Office's key: the engine sends the batch (decided 2026-10-08)

Office's `AGENTS.md` says "Office never holds a provider key", and its `EngineIntegrationClient` has no read path for a key on purpose ("a caller that cannot read a key cannot log it, sync it, or leak it"). So Office does not post to the console itself. It hands each batch to the bundled engine, which posts it with the Redrob key it holds and answers with the console's counts. Reading the key back from the engine's `GET /provider`, as Cowork's server does, was ruled out for the same reason.

| Step | Repository | Change | Status |
| --- | --- | --- | --- |
| E1 | redrob-code | `POST /api/insights/sessions`. Takes 1 to 500 sessions and posts them to `${CONSOLE_URL}/insights/sessions` with the engine's key. No URL from the caller; the key is never in a reply. | redrob-code#67 |
| E2 | redrob-code | A release with E1, and Office's pin moved to it | after E1 |
| O1 | office | **The key moves into the engine.** Connect Redrob and the Settings key field store the key with `EngineIntegrationClient.connectKey('redrob', …)`. A key already in `ai-settings.json` is moved over once, then removed from the file. | needs E2 |
| O2 | office | **Chat calls through the engine** (`/v1/chat/completions`, LOCAL-ENGINE-API.md), since after O1 Office no longer has the key to call the console directly. The `x-redrob-session` header goes on that request. | needs O1 |
| O3 | office | **Labels**: the recorder over `AgentLoopEvents`, the classifier in a utility process with the model downloaded on first use (`@redrob-labs/work-labeller`), and a file outbox. Sync hands each batch to E1 through the engine's loopback client, starting the engine when needed. | needs E2 and the package on npm |

O1 and O2 are Office's own move to engine-held credentials, which its `AGENTS.md` already calls for; insights only needs them first. O3 does not depend on O2 for the key, only for the session header: until O2, Office's requests carry no `x-redrob-session`, so the console cannot join a session to its cost.

## Still needed from outside these repositories

- **The package on npm.** Merge #153 and #154, then push a `work-labeller-v1.0.0` tag; `ci-work-labeller.yml` publishes it with `NPM_TOKEN`.
- **The model release:** `insights-model-e5-base-2026.10`.

## Design spike: the classifier on onnxruntime-web (PR 4, 2026-10-09)

Harness: `packages/work-labeller/bench/webview` (#154). It runs the package's runtime-neutral classifier on `onnxruntime-web` 1.23 (WASM), on the same 296 evaluation samples, in a page served cross-origin isolated.

**Chromium** (headless Chrome 151, Linux x64, 8 cores). This is the engine of WebView2, Design's Windows webview.

| WASM threads | Load (files in memory → ready) | Median label | p95 | Agrees with the Node reference | JS heap |
| --- | --- | --- | --- | --- | --- |
| 1 | 1.5 s | 84 ms | 216 ms | 280 / 296 | 378 MB |
| 2 | 1.5 s | 48 ms | 126 ms | 280 / 296 | 378 MB |
| 4 | 1.5 s | 33 ms | 84 ms | 280 / 296 | 378 MB |

- **Accuracy is unchanged.** On the 16 samples where the browser and Node disagree, the WASM kernels compute int8 matrix products slightly differently from onnxruntime-node's CPU kernels. Scored against the evaluation answers, the browser does as well:

  | | Kind-of-work precision | Coverage | Family precision | Coverage |
  | --- | --- | --- | --- | --- |
  | Browser | 88.7% | 83.3% | 93.8% | 87.3% |
  | Node | 88.6% | 82.6% | 93.8% | 87.0% |

  The same first message can get a different label in Design than in Cowork on about 5% of messages. Neither is less accurate.
- **Latency fits.** One label per session runs in the background after the first message, so even the 216 ms single-thread p95 does not block anything.
  - More than one thread needs the page to be cross-origin isolated. Tauri v2 can send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (`app.security.headers`).
  - Design would need to check that CanvasKit, fonts and its other assets still load under `require-corp`.
- **Memory:** about 380 MB of JS heap while loaded. The process's own figure was not measured.

**WebKit was not measured.** WKWebView is Design's webview on macOS, and WebKitGTK on Linux. Playwright's WebKit build needs GTK 4, GStreamer and Vulkan libraries this sandbox doesn't have. Run the same harness with `BROWSER=webkit` on a Mac and on Linux before PR 5. Switch to native `ort` in Rust only if WebKit is far slower or the labels do worse there.

## Status (2026-10-09)

| Step | Where | State |
| --- | --- | --- |
| Shared package | cowork #153 | Open |
| Download on first use, and the webview harness | cowork #154 | Open |
| E1: engine sends insights. Also: `/v1/chat/completions` fixed (it answered 500, and streamed empty) and forwards `x-redrob-session` | redrob-code #67 | Open |
| JS SDK regenerated (split out of #67) | redrob-code #68 | Open |
| E2: engine release | redrob-code | After #67 |
| O1 + O2: key in the engine, chat through it | office #134 | Open. Merge only after E2 |
| O3: Office labels | office #142 | Draft. Blocked: the package on npm, and the model release |
| Design spike | this section | Chromium measured; WebKit needs a Mac and a Linux desktop |
| Design integration (PR 5) | design #87 | Draft. Blocked: the package on npm, the model release, and WebKit measured. `cargo check` of `desktop/` not run here; `download.rs` tested on its own |

