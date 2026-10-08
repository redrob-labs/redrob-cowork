# R1: peer-to-peer transport spike

Status: done, 2026-10-08. Result: **go**, with two conditions below.

Question: can live co-working carry the app's HTTP traffic, server-sent events included, between two
Cowork apps over [iroh](https://docs.iroh.computer/), end to end encrypted, direct when possible
and relayed when not, from the Electron main process?

## What was built

`apps/desktop/electron/cowork/http-tunnel.mjs`:

- **One HTTP request per QUIC bidirectional stream**, ALPN `redrob-cowork/1`.
  - The guest writes a head frame (4-byte length, then JSON `{ method, path, headers }`), then the
    body, then finishes its side.
  - The host writes `{ status, headers }`, then streams the response body as it arrives.
- **Host side** (`serveTunnelConnection`):
  - forwards each request to the local `redrob-server`
  - sets `x-redrob-endpoint-id` to the connection's authenticated remote id, which is what the L1
    guest token is bound to
  - drops any identity headers the guest sent, plus the host token and hop-by-hop headers
  - an `allowPath` hook can refuse a path before it reaches the server
- **Guest side** (`startLoopbackProxy`): an HTTP server on `127.0.0.1` that sends every request
  over the connection, so the app treats the host as an ordinary remote Redrob workspace.

`@number0/iroh` 1.1.0 is added to `@redrob/desktop`, and `asarUnpack` keeps its native binary on disk.

## Measured

On linux-x64 with Node 24 (`node --test electron/cowork/http-tunnel.test.mjs`), two endpoints on one
machine with relays off:

| Check | Result |
| --- | --- |
| Request and response, headers, status | Pass |
| Host sets `x-redrob-endpoint-id`; a forged one and the host token are dropped | Pass |
| POST body | Pass |
| SSE: first event arrives before the stream ends | Pass (well under 300 ms) |
| 1 MB body intact | Pass (about 200 ms) |
| Refused path | Pass (403 `tunnel_forbidden`) |

Through n0's public relays, from the sandbox: both endpoints came online, dialling by endpoint id and
relay URL connected, and iroh then moved the connection to a direct path on its own (the connection
listed a relay path and a selected direct IP path).

## Findings

1. **Do not await `SendStream.stopped()` while writing.** In this binding the call holds the
   stream's lock until the peer stops, so every later `writeAll` on that stream waits forever. That
   was the cause of the first test hang. The tunnel instead detects that a reader has gone when a
   write fails, then aborts the upstream request so an event stream does not run on.
2. **There is no Intel Mac build.** The npm package ships prebuilt binaries for macOS arm64,
   Windows x64 and arm64, and Linux x64 and arm64 (gnu and musl), but not `x86_64-apple-darwin`,
   which this app still builds.
   - **Condition:** on Intel Macs co-working is unavailable. The app feature-detects the binding and
     says "Co-working needs a Mac with Apple silicon" rather than failing. Handoff works everywhere.
3. **Relay admission is supported by `iroh-relay` itself.** Its `access` config can be `http`: for
   each endpoint that connects, the relay POSTs to a URL with `X-Iroh-Endpoint-Id` and admits it
   only on a `200` with body `true`. That is the K5 design:
   - The app asks the console for a short-lived **relay grant** for its endpoint id, with the device
     API key.
   - The relay asks the console whether that endpoint holds one, using the relay's own bearer token.
   - Nothing about rooms or content reaches the console, and the client needs no extra token in
     the iroh handshake.
4. **No Bun dependency.** The tunnel lives in the Electron main process (Node), so `redrob-server`
   running under Bun does not matter.

## Not verified here

- **Packaged builds.** N-API is ABI-stable across Node and Electron, and the binary is unpacked
  from the asar.
  - **Condition:** the release matrix must start a packaged build on each of the six targets and run
    one loopback round trip before co-working is switched on for that target. L4 adds a
    self-check that the app runs at startup and reports in Settings > Debug.
- **Our own relays.** K6 deploys them. Until then, development builds may use n0's rate-limited
  public relays, which their docs say are for testing only. Packaged builds use only Redrob's.
- **Symmetric NATs and corporate firewalls.** These go through the relay by design. Latency over
  the relay should be measured once K6 is up.
