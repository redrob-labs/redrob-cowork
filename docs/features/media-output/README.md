# Media output: images, HTML, and voice

Status: in progress. This is the plan of record for three outputs a model can produce in Redrob Cowork
beyond text, and the order they land in.

## Decisions

| Question | Decision |
|---|---|
| Who serves and bills generation | **Redrob only.** Image, speech, and Voice Mode go through the Redrob gateway on `REDROB_API_KEY`. The OpenAI-key paths are retired once their Redrob replacement ships. |
| Text-to-speech engine | The Redrob gateway. Read-aloud waits for the console to serve speech. |
| Voice priority | Read replies aloud > generate audio files > Voice Mode speaking for the main agent. |
| Generated images in model context | **Yes.** They return as tool attachments, so the model sees what it made. At High and Strict privacy the gate leaves images out, as it does for any image it cannot read. |
| Network from HTML previews | **Deny by default, with bundled libraries.** See below. |
| HTML scope | Single and multi-file HTML. No JSX or Mermaid in this round. |

## Architecture

**Images.** A built-in engine tool, `image_generate`, in Redrob Code (`packages/redrob/src/tool/`).
It has to live in the engine because the Redrob key does: Cowork never reads it, and a Cowork plugin
could only reach it by replacing the engine's `redrob` auth hook. The tool calls the gateway's
`/v1/chat/completions` with `modalities: ["image", "text"]`, writes the result under `artifacts/`,
and returns it as a tool **attachment**. The engine already turns tool attachments
into chat file parts (`session-sync.ts`), and `message-list.tsx` already renders `image/*` file parts
inline, so the picture appears in the reply and as an artifact with no new rendering code. This
replaces the `openai-image-generation` extension, whose results only surfaced when the model happened
to mention the path.

**HTML.** Every model-written page renders on the MCP Apps sandbox origin (`mcp-app-sandbox.ts`)
under a deny-by-default Content Security Policy built the same way as `buildMcpAppCsp`. Previews are
never same-origin with the app.

- Known CDN URLs for a small bundled set (Tailwind, Chart.js, D3, Alpine.js, Lucide) are rewritten
  to copies shipped with the app. Only the preview is rewritten; the file on disk is untouched and
  still works in a normal browser.
- Everything else outside is blocked: no `connect-src`, no remote images, no remote fonts. The preview
  reports how many outside resources it blocked so a page is never silently broken.
- Why deny: the privacy gate restores real values into files the agent writes, so a generated page
  holds real personal data, and any network path from it is a way off the machine. A page shaped by a
  prompt injection cannot beacon out. Public CDNs serve anything anyone publishes, so an allowlist of
  them is not a safe boundary, and every allowed host would become a renderer entry in
  `docs/enterprise/outbound-access.json`.

**Voice.** One server route per capability, on the Redrob gateway, consumed by the renderer the same
way `POST /voice/realtime/session` is today. Audio and video files get a player in chat and in the
artifact panel.

## Slices

Each is one `<type>/<slug>` pull request into `develop`.

| # | Slice | Depends on |
|---|---|---|
| 0a | `fix/html-preview-isolation`: sandbox origin, deny-by-default CSP, bundled libraries, blocked-resource notice | — |
| 0b | `fix/dictation-locale`: dictation transcribes in the app language instead of hard-coded English | — |
| V1 | `feat/audio-video-playback`: audio and video preview types, MIME mapping, inline players | — |
| H1 | `feat/html-fence-preview`: Preview for `html` and `svg` code blocks in chat, Code/Preview toggle in the panel | 0a |
| H2 | `feat/artifact-live-refresh`: refresh a preview when a write or edit tool completes | — |
| H3 | `feat/html-multi-file`: relative assets beside the page resolve through the sandbox origin | 0a |
| I1 | Engine `feature/image-generate-tool`: `image_generate` on the engine's credential, then a `redrobCodeVersion` bump here | console image relay |
| I2 | `feat/image-edit`: edit an image or generate from a reference | I1 |
| V2 | `feat/read-aloud`: speaker button on replies and an optional "Speak replies" setting | console speech endpoint |
| V3 | `feat/speech-generate-tool`: `redrob_speech_generate` writes an audio artifact | V1, V2 |
| V4 | `feat/voice-mode-redrob`: Voice Mode on the Redrob gateway, then speaking the main agent's replies | console realtime broker |

## Console dependencies

Tracked in `mckinley-and-rice/redrob-console`:

- **Image relay.** The gateway served and billed image models but read only `message.content`, so the
  picture was dropped. Fixed by relaying `message.images` and accepting `modalities`.
- **Speech.** `POST /v1/audio/speech` and `GET /v1/speech-models`, on OpenRouter's speech endpoint and
  priced per character of input, so no audio-token rate is needed.
- **Realtime.** `POST /voice/realtime/session` minting a client secret on `REDROB_API_KEY`, and a
  gateway-side SDP exchange so the renderer no longer calls `api.openai.com/v1/realtime/calls` directly.

## Voice on Redrob

Replaces the OpenAI-key Voice Mode. OpenRouter, the gateway's upstream, has no Realtime API, and the
console runs on Vercel functions, which cannot hold a WebRTC or WebSocket session, so voice is a
turn-based pipeline over endpoints the gateway already bills: transcribe, send to the **main agent**,
read the reply aloud.

| Decision | Choice |
|---|---|
| What voice is for | A conversation with the main agent, in the normal chat. Not UI control. |
| Latency | Turn-based (roughly 2 to 4 seconds before a reply starts) is acceptable. |
| Turn taking | Push to talk: hold, or tap to start and tap to stop. At most 60 seconds per recording, the upstream timeout. |
| Dictation | The composer mic moves to Redrob transcription too, in both composers. |
| Privacy | Voice and read-aloud are off at High and Strict protection: the gate labels text, and audio sent to a speech vendor cannot be labelled. |
| Zero data retention | Not requested. |
| Long turns | A short spoken cue when a message is sent. Speaking the first sentence early comes after the beta. |
| Old Voice Mode | Removed once the Redrob version ships. |

Beta defaults: `elevenlabs/scribe-v2` for transcription (`openai/gpt-transcribe` selectable), and
`elevenlabs/eleven-flash-v2.5` for spoken replies, chosen for latency. A 30-clip Korean, English and
mixed-language check picks the final defaults and voice before the beta.

| # | Slice | Depends on |
|---|---|---|
| VM1 | Console `POST /v1/audio/transcriptions`, OpenAI compatible, billed from the vendor's reported cost plus margin | — |
| VM2 | Engine `POST /redrob/transcribe` on its own key | VM1 |
| VM3 | Push-to-talk dictation on Redrob in both composers, relayed at `POST /voice/transcribe` | VM2 |
| VM4 | Voice conversation toggle: send on release, read the reply aloud when the turn ends, mic interrupts playback | VM3, read-aloud |
| VM5 | Remove OpenAI Voice Mode: panel, realtime route, settings, broker code, strings | VM4 shipped |
| VM6 | Beta check of models, voice and end-to-end latency | VM4 |
