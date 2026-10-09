# Handoff and live co-working

Status: plan. Nothing is built.

Two ways for people on the same team to work on one piece of AI work:

- **Handoff and review.** One click packages a session (plan, transcript, Cross-check report,
  produced files) into a file for a teammate. The teammate comments on steps, approves or asks
  for changes, or continues the session where the agent stopped, and sends a small reply back.
- **Live co-working.** Teammates join a running session from their own Cowork app. Everyone sees
  who is there, everyone can send messages, every message and cost shows who sent it, and the
  host decides who may approve risky actions.

Both run between Cowork apps. Chat content never reaches a Redrob server: a handoff is a file the
user carries, and a live session travels end-to-end encrypted, relayed only when a direct
connection is impossible.

| Repository | Owns |
| --- | --- |
| `redrob-labs/redrob-cowork` (this one) | Bundles, review store, guest tokens, rooms, the P2P bridge, all UI |
| `mckinley-and-rice/redrob-console` | Relay tokens for device keys, relay infrastructure (CDK) |
| `redrob-labs/redrob-code` | Nothing new. Its `export` / `import` commands and prompt `messageID` are used as they are |

## Decisions

Taken with the owner on 2026-10-08.

| # | Question | Decision |
| --- | --- | --- |
| 1 | Who is on the other side | Teammates in the same console account first; nothing may block outside parties later |
| 2 | Identity | A display name set in Cowork plus a per-guest token. No sign-in. Verified console identity can come later |
| 3 | Non-goal and privacy gate | The "no real-time co-editing" non-goal is lifted. Shipping before the privacy gate (C4) is accepted: teammates see raw content, Redrob servers do not |
| 4 | Handoff transport | A `.redrobhandoff` file the user sends any way they like. The live link comes free with co-working |
| 5 | Handoff contents | Transcript, plan, Cross-check, produced files, skills and playbooks. Files the agent only read are opt-in per file. Everything is previewed and secret-scanned |
| 6 | Continue | Import the real engine session. Fall back to a fresh session seeded from the transcript when the engine cannot read the export |
| 7 | Verdict back to sender | A small `.redrobreply` file that attaches comments and the verdict to the original session |
| 8 | Network reach | A Redrob-run relay that only sees encrypted traffic (iroh). Direct P2P whenever possible, LAN included |
| 9 | Who can send | Everyone, through one queue on the host that shows each message's author |
| 10 | Steering mid-run | Not in v1. Messages sent while the agent works are queued |
| 11 | Approvals | Set per guest; the default is host only |
| 12 | Guests | Cowork desktop only |
| 13 | Billing | The host's Redrob key pays. Each author's messages show their cost |
| 14 | Order | Foundation, then handoff, then live co-working, in small PRs on `develop` |

## What exists and what is missing

Checked against `develop` on 2026-10-08.

| Need | Today |
| --- | --- |
| Carry a session to another machine | The engine sidecar has `export <sessionID>` (JSON) and `import <file>` (writes into its database under the current project). The app uses neither |
| Credit a message to a person | `prompt` accepts a caller-chosen `messageID` (engine `session/prompt.ts`), so `redrob-server` can choose it and record the author |
| Many clients on one session | Each client gets its own engine SSE lease (`EnginePool.openEventProxy`). The merged stream is not filtered by session |
| Per-person credentials | `TokenService.create(scope, { label })` and `revoke` exist. No expiry, no identity, no session scope |
| Who is calling | `Actor.clientId` from `X-Redrob-Client-Id`, never sent by the app and stripped by the proxy |
| Queue while busy | Client-local (`composer-state-store.ts`). Other people cannot see it |
| Permission asks | Whoever answers first wins; nothing records who |
| Audit | Config writes only. Prompts, aborts and permission replies are not recorded |
| Remote access | `0.0.0.0` over plain HTTP on the LAN, CORS `*`. No TLS, tunnel or NAT traversal |
| Invite links | `ow_url` / `ow_token` are parsed (`redrob-server.ts`) but never generated |
| Comment anchors | Plan `todo` items, sections and check claims have no ids (`desk-blocks.ts`) |
| Files a session produced | Derived in the renderer from messages (`lib/artifacts.ts`), not stored |
| Archive and preview | ZIP writer and safe-path reader (`workspace-archive.mjs`), secret detectors (`workspace-export-safety.ts`), fingerprinted import preview (`workspace-import-preview.ts`) |

## Foundation

Shared by both features. Nothing here is visible on its own except the profile name.

**Participant.** `Settings > Profile` sets a display name. The app keeps a random
`participantId` (`par_…`) per install. Neither is verified; both are labels a teammate chose.

**Ids on desk blocks.** Plan `todo` items, `sections[].items` and check `claims` get an optional
`id`. `PLAN_PROMPT` and `CHECK_PROMPT` ask for short ids (`s1`, `s2`, `c1`). The parser
synthesises `idx-<n>` when one is missing, so old answers still render and still take comments.

**Review store** in `runtime.sqlite`:

```ts
review_comments {
  id, sessionId,
  anchor: { kind: "message" | "plan-step" | "claim", messageId, itemId? },
  author: { participantId, displayName },
  text, createdAt, resolvedAt?, origin: "local" | "handoff" | "reply" | "room"
}
review_states { sessionId, status: "open" | "approved" | "changes_requested", by, at, note? }
```

Routes under `/workspace/:id/sessions/:sessionId/review`: list, add, resolve, set state. Viewer
may read, collaborator may write. A `review.updated` event goes out on the room stream when the
session is live.

## Handoff and review

### The bundle

`.redrobhandoff` is a ZIP written by the existing archive code, stored uncompressed, within the
existing limits (64 MB, 1,024 entries).

```text
manifest.json
session/engine.json        redrob export <sessionID>, unsanitised, after the secret scan
session/transcript.md      readable transcript (headless-threads toTranscript, rendered)
session/desk.json          plan and check blocks with ids, per message
session/review.json        comments and state so far
files/…                    produced files, plus any read files the sender ticked
workspace/skills/…         skills (text)
workspace/commands/…       commands and playbooks (text)
```

```jsonc
{
  "format": "redrob-handoff", "v": 1,
  "id": "hof_…", "createdAt": "2026-10-08T09:00:00Z",
  "from": { "participantId": "par_…", "displayName": "Park Hyunjin" },
  "to": "Jiwon",                                   // free text, optional
  "ask": "review",                                 // review | continue | approve
  "note": "Check clause 4 before Friday",
  "workspace": { "name": "Client A" },
  "session": { "id": "ses_…", "title": "Lease review" },
  "engine": { "redrobCodeVersion": "v1.18.31-redrob.9" },
  "contents": [{ "path": "files/memo.docx", "kind": "produced", "bytes": 48213, "sha256": "…" }],
  "digest": "sha256 over contents"
}
```

**Never in a bundle.** Plugins, tools, MCP and provider config, `.env*`, keys, the engine
`auth.json`, the label map. Plugins, tools and MCP entries run code on the receiver, and
excluding them is the boundary, not an option.

**Sending.** `Share > Hand off…` on a session:
1. `redrob-server` runs the engine's `export` against the managed engine's data directory.
2. It collects produced files from the session's messages (the same derivation the artifact panel
   uses, moved server-side) and lists read files as unticked candidates.
3. It runs the export secret detectors over the transcript, tool outputs and files, not just
   config. Each finding is shown with its location; the sender removes the item, redacts the
   value, or keeps it.
4. A preview lists every entry and its size. Nothing is written until the sender confirms.
5. The desktop shell writes the file through a save dialog and records `handoff.sent` in the audit
   log.

**Opening.** Double-click (file association), drag onto the window, or `Open handoff…`:
1. The archive is checked: safe paths, limits, digest. A mismatch refuses the file.
2. A preview shows who sent it, what they ask for, the note, and every entry.
3. On confirm the app creates a local workspace `Handoff: <title>` under
   `~/Redrob/Handoffs/<slug>`, writes files and skills there, and imports the engine session into
   that project with the engine's `import`.
4. The session opens in **review mode**: a banner with the sender's ask and note, the composer
   replaced by Comment, Approve, Request changes and Continue.

**Review.** Comments attach to a message, a plan step or a check claim. The plan and the fact
check render with a comment control per item.

**Continue.** Unlocks the composer. The session keeps its history; the agent works on the files
in the handoff workspace. The receiver can move the session into one of their own workspaces with
the existing move route (files stay where they are; the UI says so).

**Fallback.** When `import` rejects the export (an engine schema change between the two
versions), the app says so and offers a fresh session in the same workspace seeded with the
transcript and the plan. Review still works on the read-only transcript.

**Reply.** `Send back` writes `.redrobreply`:

```jsonc
{
  "format": "redrob-handoff-reply", "v": 1,
  "replyTo": "hof_…", "session": { "id": "ses_…" },
  "from": { "participantId": "par_…", "displayName": "Kim Jiwon" },
  "state": { "status": "changes_requested", "note": "Clause 4 cites the old act" },
  "comments": [ /* review_comments rows */ ],
  "continued": "session/engine.json"   // present only if they continued
}
```

The sender opens it. The app finds the original session by `replyTo` and session id, adds the
comments (`origin: "reply"`), sets the state, and raises a notification. A continued session is
offered as a new session, "Kim Jiwon's continuation", beside the original. It never overwrites
the original.

## Live co-working

### Shape

```text
 guest Cowork                                               host Cowork
 ┌─────────────────────┐                           ┌───────────────────────────────┐
 │ app ─HTTP─▶ loopback │   QUIC, end-to-end TLS    │ bridge ─HTTP─▶ redrob-server  │
 │       proxy 127.0.0.1├──── direct, or via ───────┤ (Electron     127.0.0.1 only) │
 │ (Electron main)      │     Redrob relay          │  main)          │             │
 └─────────────────────┘     (ciphertext only)     │                 ▼ engine       │
                                                    └───────────────────────────────┘
```

- **The host's server stays on `127.0.0.1`.** Co-working does not use the LAN remote-access
  toggle. Both run side by side; deprecating the plain-HTTP toggle is a separate decision.
- **Transport is [iroh](https://docs.iroh.computer/)** (`@number0/iroh`, prebuilt N-API for
  macOS arm64, Windows x64/arm64, Linux x64/arm64, matching our builds). Endpoints dial by public
  key, punch holes when they can, and fall back to a relay that forwards encrypted QUIC packets
  and cannot read them.
- **Relays are ours**, not n0's public ones, which are rate-limited and meant for testing:
  `iroh-relay` in `ap-northeast-2` plus one other region, deployed by CDK in the console
  repository next to K4. Public address lookup is off: the invite carries the host's endpoint id
  and home relay URL.
- **Guests reuse the remote-workspace path.** The guest's loopback proxy exposes the host as
  `http://127.0.0.1:<port>/w/<workspaceId>`, and the app adds it as a remote Redrob workspace
  exactly as it does today. The session UI does not learn about QUIC.
- iroh runs in the Electron main process (Node), not in `redrob-server`, which also runs under
  Bun. Co-working is therefore desktop-only, as decided.

### Joining

1. The host picks `Start co-working` on a session. The server creates a room and a single-use
   invite secret (24 hours).
2. The host copies the invite, `redrob://join?h=<endpointId>&r=<relayUrl>&w=<workspaceId>&s=<sessionId>&k=<secret>`,
   and sends it on Slack, email or wherever.
3. The guest opens it. Their app gets a relay grant from the console (below), dials the host and
   knocks inside the encrypted connection with the secret, their display name and participant
   id: `POST .../room/knock`, the only room route without a token. The host's bridge names the
   device (`x-redrob-endpoint-id`, from the QUIC connection), and a knock without it is refused.
4. The host sees the knock: "Kim Jiwon is asking to join", with the start of the device id. Let in
   or turn away. Before that the guest can reach only the knock and its own answer
   (`GET .../room/knock/:knockId`, readable only from the same endpoint).
5. On let in the server issues a guest token bound to the guest's endpoint id, the room, and the
   capabilities the host chose. The secret is spent, and anyone else waiting on it is turned
   away. Invites and knocks live in the server's memory: a restart voids them.

### Guest tokens

`TokenRecord` gains fields. Existing tokens keep working unchanged.

```ts
{
  id, hash, scope, createdAt, label?,
  participant?: { participantId, displayName },
  expiresAt?: number,                 // guests: room end, at most 7 days
  sessionScope?: string,              // guests: the one shared session
  endpointId?: string,                // guests: the iroh endpoint the token is bound to
  capabilities?: Array<"send" | "approve" | "stop">
}
```

- **Identity comes from the token, never from a header.** The host bridge sets
  `x-redrob-endpoint-id` to the connection's authenticated endpoint id and drops any value the
  guest sent (and `x-redrob-host-token`). The server rejects a guest token arriving on a connection with a different endpoint.
- **Session scope is enforced in `redrob-server`:**
  - `/opencode/*` routes are allowed only when they name the scoped session, plus a short read
    allowlist the session UI needs (providers, agents, config read).
  - The merged engine event stream is filtered to events of the scoped session.
  - Workspace routes are limited to that session's read model, review routes and the room.
    Workspace listing, files outside the session's artifacts, settings, skills, MCP, tokens and
    export are refused.
- **Capabilities.** `send` covers messages and commands. `approve` covers permission and
  question replies. `stop` covers abort. The defaults are `send` and `stop`, without `approve`:
  approvals stay with the host until the host grants them. The host can change a guest's
  capabilities, or remove the guest, at any time; removal revokes the token and closes the
  connection.
- Guests can make the agent read anything inside the host's authorised folders by asking. The
  start dialog says this in plain words. Guests' turns can also be restricted to Plan mode
  (`redrob-plan`, read-only) per guest.

### The room

A `cowork/` module in `redrob-server`, state in `runtime.sqlite`, events on one SSE stream per
room: `GET /workspace/:id/sessions/:sessionId/room/events`.

| Piece | Behaviour |
| --- | --- |
| Presence | Heartbeat every 15 s; gone after 45 s. Shows who is present, who is typing, and who is reading which message |
| Authorship | On `prompt_async` and `command`, the server picks the `messageID` (engine format, `msg_` + ascending id), records `{ messageId, participantId }` and forwards. Every client renders an author chip from the ledger |
| Cost per author | The `costUsd` of an assistant message is credited to the author of its parent user message. Each author chip shows their share; the room header shows the total, all on the host's key |
| Shared queue | Moves to the server for live sessions. A message sent while the agent works is queued with its author, visible to everyone, editable and removable by its author or the host, and sent in order when the session goes idle. Solo sessions keep the local queue |
| Permission asks | Shown to everyone, answerable only with `approve`. The first valid reply wins; later ones get `409 already_answered` with who answered |
| Stop | Needs `stop`. The room shows who stopped the run |
| Audit | `room.joined`, `room.left`, `message.sent`, `run.stopped`, `permission.answered`, `guest.capabilities_changed` and `guest.removed` go to the existing audit log with the participant as actor |
| Host leaves | The session lives on the host. When the host app closes, guests see "Host is offline" and can read what they have; they reconnect automatically when the host returns |

### Relay grants (console)

The relays carry only endpoints the console has granted, so relay bandwidth is limited to console
accounts. Encryption does not depend on the relays.

| Route | Credential | What |
| --- | --- | --- |
| `POST /v1/relay/grants` `{ endpointId }` | device API key | Grants the endpoint relay use for an hour (`RELAY_GRANT_TTL_SECONDS`) and lists the relays. The app renews at half life. Host and guest both need one |
| `POST /v1/relay/access` | the relays' bearer (`RELAY_ACCESS_BEARER`) | `iroh-relay`'s `access.http` check. Answers `true` only for an endpoint with a live grant on a key that is not revoked. Reads `X-Iroh-Endpoint-Id`, or `X-Iroh-NodeId`, which is what the pinned v1.3.0 relay sends |

The desktop app asks through its own server (`POST /cowork/relay-grant`), so the Redrob Key never
leaves `redrob-server`. The console records grants (account, time, endpoint id) and nothing about
rooms, sessions or content. A failed or non-`true` answer denies, so a console outage closes the
relays to new connections.

**Same account (decision 1).** v1 relies on the host's knock approval and the invite secret. A
console-signed membership pass `{ accountId, endpointId, exp }`, verified with the pinned team
policy keys, can make "same account" provable. It waits for K4 and C9, like team policies.

## Threat model

| Threat | Control |
| --- | --- |
| A relay or network observer reads content | QUIC with TLS 1.3 end-to-end; the relay forwards ciphertext |
| A leaked invite link | Single use, 24 hours, and the host must still Allow the knock |
| A stolen guest token | Bound to the guest's endpoint key; useless from another endpoint; expires with the room |
| A guest reaches beyond the shared session | Session-scoped token enforced in `redrob-server`, filtered event stream, route allowlist |
| A guest approves something risky | `approve` is off by default; every reply is attributed and audited |
| A malicious handoff file | Safe paths, size limits, digest check, preview before writing, no plugins, tools or MCP |
| Secrets inside a transcript | Secret scan over transcript, tool output and files before export; the sender decides per finding |
| A forged name | Names are self-chosen labels and the UI says so; the knock and the out-of-band invite are the trust step until membership passes |

## Steps

Cowork PRs target `develop`, one concern each, and stack where `Depends` says so. Console PRs
target the console's `develop`. Sizes: S is days, M is about a week, L is more.

| Step | Branch | What | Depends | Size |
| --- | --- | --- | --- | --- |
| D0 | `docs/handoff-and-live-coworking` | This document; lift the co-editing non-goal in the team plan | -- | S |
| F1 | `feat/participant-profile` | `Settings > Profile` name, install `participantId`, en and ko strings | -- | S |
| F2 | `feat/desk-block-ids` | Optional ids in plan and check schemas, prompt update, `idx-<n>` fallback | -- | S |
| F3 | `feat/review-store` | `review_comments` and `review_states`, routes, comment thread UI on messages, plan steps and claims | F1, F2 | M |
| H1 | `feat/handoff-engine-bridge` | Server wrapper for the engine's `export` and `import` against the managed data directory; version check; spike first | -- | M |
| H2 | `feat/handoff-send` | Bundle writer, server-side produced-file list, secret scan over transcripts and files, send preview | F3, H1 | M |
| H3 | `feat/handoff-open` | File association, open preview, handoff workspace, session import, review mode | H2 | M |
| H4 | `feat/handoff-continue-reply` | Continue, transcript fallback, `.redrobreply` writer and apply, notification | H3 | M |
| L1 | `feat/guest-tokens` | Token fields, session scope, route allowlist, filtered event stream, capabilities, audit of prompts, aborts and replies | F1 | M |
| L2 | `feat/cowork-room` | Room, presence, room event stream, authorship ledger with server-chosen `messageID`, cost per author | L1 | M |
| L3 | `feat/cowork-queue-approvals` | Server-side queue for live sessions, permission arbitration, stop attribution | L2 | M |
| R1 | `feat/p2p-transport-spike` | iroh in Electron main on all six builds; HTTP and SSE over QUIC; relay admission choice. Go or no-go | -- | M |
| K5 | `feature/relay-tokens` (console) | `POST /v1/relay/grants` on device keys, `POST /v1/relay/access` for the relays | -- | S |
| K6 | `feature/relay-infra` (console) | CDK for two `iroh-relay` instances with TLS and admission | R1, K5 | M |
| L4 | `feat/cowork-bridge` | Host bridge, guest loopback proxy, `redrob://join`, knock, endpoint binding; outbound-access manifest | L1, R1, K5 | L |
| L5 | `feat/cowork-ui` | Start co-working, invite, participants panel, author chips, presence, capability editing, remove guest, end room | L3, L4 | L |

F, H and L1–L3 need no new infrastructure. L1–L3 can be tested with two app instances on one
machine over the loopback before the bridge exists. R1 runs in parallel and decides L4.

**Later, not in these steps:** steering through the v2 `delivery` API (HANDOFF #6), membership
passes after K4 and C9, verified console identity, browser guests, sharing several sessions in one
room.

### As built

| Step | Pull request |
| --- | --- |
| D0 | #134 |
| F1, F2, F3 | #137, #138, #139 |
| H1, H2, H3, H4 | #140, #141, #142, #143 |
| L1, L2, L3 | #144, #145, #146 |
| R1 | #147 ([findings](./r1-p2p-transport-spike.md)) |
| K5, K6 | console #226, #227 (standalone CDK app in `infra/relay`, since K4 is not on `develop`) |
| L4, L5 | #148, #150 |
| Follow-ups | #156 (room event stream in the app, cost by person), #157 (composer queues into the room's shared queue), #159 (joined chats reconnect after a restart) |

| Later follow-ups | #161 (no reconnect after removal or room end), #163 (edit a waiting message, without losing files), #164 (Plan-only guests, enforced on the server) |
| Attachments | #170 (guests attach with the host's "attach" right, into the chat's own inbox folder; a guest's file parts are checked against it) |

## Tests

- **F2:** old answers without ids parse and take comments; ids stay stable across re-renders.
- **H1–H4:**
  - A round trip between two data directories: export, import, continue, reply, apply.
  - An engine version mismatch takes the fallback.
  - The secret scan catches the existing detector set inside tool output.
  - A ZIP with unsafe paths, oversize entries, a bad digest or a plugin entry is refused.
- **L1:**
  - A scoped token cannot list sessions or read another session's messages, events, files or
    settings.
  - A token presented from the wrong endpoint is refused.
  - Each capability is denied when absent.
- **L2–L3:**
  - Authorship survives a reload.
  - The queue drains in order on idle.
  - Two concurrent permission replies give one success and one `409`.
  - Cost per author adds up to the total.
- **L4 and R1:**
  - A connection through the relay when direct is blocked.
  - SSE stays live across a relay-to-direct switch.
  - `check:outbound-access` passes with the relay hosts declared.

## Open questions

1. ~~AWS account and regions for the relays (K6).~~ K4's account; `ap-northeast-2` and
   `us-west-2` by default, one stack per region in `cdk.json`.
2. ~~Whether `iroh-relay` access control can check a console token directly (R1).~~ It can:
   `access.http` against `/v1/relay/access`.
3. Data residency of relayed traffic: it is ciphertext, but some customers ask where it flows.
4. Whether the LAN remote-access toggle should be deprecated once co-working ships.
