# Media output: images, HTML, and voice

Status: built, in review. Every slice below has an open pull request; none is merged, and none reaches
users until the console endpoints deploy, an engine release ships, and `redrobCodeVersion` is bumped
here. This is the plan of record for three outputs a model can produce in Redrob Cowork beyond text.

## Decisions

| Question | Decision |
|---|---|
| Who serves and bills generation | **Redrob only.** Image, speech, and voice go through the Redrob gateway on `REDROB_API_KEY`. The OpenAI-key paths are retired once their Redrob replacement ships. |
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

**Voice.** The engine holds the key, so each capability is an engine route that Cowork's server relays
on the host token: `POST /voice/speech` → engine `POST /redrob/speech` → gateway `/v1/audio/speech`,
and `POST /voice/transcribe` → engine `POST /redrob/transcribe` → gateway `/v1/audio/transcriptions`.
Cowork never sees the key, and both relays refuse at High and Strict privacy before the engine is
asked. Audio and video files get a player in chat and in the artifact panel.

## Slices

Each is one `<type>/<slug>` pull request into `develop`.

| # | Slice | Depends on | PR |
|---|---|---|---|
| 0a | `fix/html-preview-isolation`: sandbox origin, deny-by-default CSP, bundled libraries, blocked-resource notice | — | #175, libraries #176 |
| 0b | `fix/dictation-locale`: dictation transcribes in the app language instead of hard-coded English | — | #173, closed: superseded by VM3 and VM5 |
| V1 | `feat/audio-video-playback`: audio and video preview types, MIME mapping, inline players | — | #174 |
| H1 | `feat/html-fence-preview`: Preview for `html` and `svg` code blocks in chat, Code/Preview toggle in the panel | 0a | #178 |
| H2 | `feat/artifact-live-refresh`: refresh a preview when a write or edit tool completes | — | #177 |
| H3 | `feat/html-multi-file`: relative assets beside the page resolve through the sandbox origin | 0a | #179 |
| I1 | Engine `feature/image-generate-tool`: `image_generate` on the engine's credential, then a `redrobCodeVersion` bump here | console image relay | engine #69 |
| I2 | `feat/image-edit`: edit an image or generate from a reference | I1 | engine #70 |
| V2 | `feat/read-aloud`: speaker button on replies and an optional "Speak replies" setting | console speech endpoint | #181, engine #73 |
| V3 | `feat/speech-generate-tool`: `redrob_speech_generate` writes an audio artifact | V1, V2 | engine #71 (`speech_generate`, in the engine for the reason images are) |
| V4 | `feat/voice-mode-redrob`: Voice Mode on the Redrob gateway, then speaking the main agent's replies | console realtime broker | superseded by Voice on Redrob below |

## Console dependencies

Tracked in `mckinley-and-rice/redrob-console`:

- **Image relay.** The gateway served and billed image models but read only `message.content`, so the
  picture was dropped. Fixed by relaying `message.images` and accepting `modalities`.
- **Speech.** `POST /v1/audio/speech` and `GET /v1/speech-models`, on OpenRouter's speech endpoint and
  priced per character of input, so no audio-token rate is needed.
- **Transcription.** `POST /v1/audio/transcriptions`, billed from the vendor's reported cost plus margin.
- A realtime broker was planned here and dropped: OpenRouter has no Realtime API and Vercel functions
  cannot hold the session. Voice became the turn-based pipeline below.

Pull requests: image relay #230, speech #232, transcription #237 (on #232).

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

| # | Slice | Depends on | PR |
|---|---|---|---|
| VM1 | Console `POST /v1/audio/transcriptions`, OpenAI compatible, billed from the vendor's reported cost plus margin | — | console #237 |
| VM2 | Engine `POST /redrob/transcribe` on its own key | VM1 | engine #74 |
| VM3 | Push-to-talk dictation on Redrob in both composers, relayed at `POST /voice/transcribe` | VM2 | #185 |
| VM4 | Voice conversation toggle: send on release, read the reply aloud when the turn ends, mic interrupts playback | VM3, read-aloud | #186 |
| VM5 | Remove OpenAI Voice Mode: panel, realtime route, settings, broker code, strings | VM4 shipped | #187, merge last |
| VM6 | Beta check of models, voice and end-to-end latency | VM4 | blocked on deploy and release |

### As built

- **Dictation (VM3).** The Desk mic records webm/opus while held, or between two taps, with a countdown,
  and sends at the 60 second limit. One request per recording, in the app language. The words join the
  draft and are never sent on their own.
- **Conversation (VM4).** A per-chat toggle beside the mic, off by default. Releasing the mic sends what
  was said, with anything typed, as Send would; a new chat starts. "Working on it." is spoken on send,
  once per language and then replayed from memory, with a two-note chime when it cannot be spoken. When
  that turn ends its answer is read aloud; typed turns never are. Pressing the mic cuts Desk off. While a
  turn runs, what was said goes into the draft.
- **Privacy.** Both relays answer 403 `voice_off_for_privacy` at High and Strict, and the mic, the toggle
  and read-aloud are disabled with that reason.
- **Proof.** An end-to-end run of the real web app, Cowork server and engine, with only the gateway stood
  in for, passes all 16 checks (#186).

### Open after the build

- **Speech model.** Spoken replies use the engine's `speech_generate` default,
  `elevenlabs/eleven-multilingual-v2` with `sarah`, not the `eleven-flash-v2.5` chosen above:
  `/voice/speech` does not pass a model yet. Settle it with VM6's voice choice.
- **Who may use voice.** The relays are `host` routes, so only the host token or an owner-scoped token
  reaches them. Desktop connects with the owner token; a web client on a collaborator token gets 401
  (#185). Whether collaborators get voice is a policy decision.
