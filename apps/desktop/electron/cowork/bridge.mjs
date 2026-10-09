import http from "node:http";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { COWORK_ALPN, serveTunnelConnection, startLoopbackProxy } from "./http-tunnel.mjs";
import { buildInviteLink, parseInviteLink } from "./invite-link.mjs";

/**
 * Live co-working's bridge, in the Electron main process (L4).
 *
 * One iroh endpoint per app, with a key kept in the profile so a guest's token (bound to the
 * endpoint id) survives a restart.
 *
 * - Hosting: the endpoint accepts `redrob-cowork/1` connections and tunnels each request to this
 *   machine's redrob-server, which still applies the guest token's own rules. `coworkAllowPath`
 *   refuses anything outside a workspace being hosted before it gets that far.
 * - Joining: the guest dials the host from the invite, opens a loopback proxy, knocks, waits for
 *   the host to allow it, then adds the host as a remote Redrob workspace at
 *   `http://127.0.0.1:<port>/w/<workspaceId>`. The session UI never learns about QUIC.
 * - Relays: the console grants this endpoint use of Redrob's relays for a while (through the local
 *   server, which holds the Redrob Key); the grant is renewed at half its life. Packaged builds use
 *   only those. A development build without a grant may fall back to n0's public relays.
 *
 * No `@number0/iroh` build exists for Intel Macs, so there the bridge says so and does nothing.
 */

const KNOCK_POLL_MS = 2000;
const KNOCK_WAIT_MS = 10 * 60 * 1000;
const ONLINE_WAIT_MS = 5000;
const MIN_GRANT_REFRESH_MS = 60_000;
/** Between attempts to reach a host that went away, growing to the last. */
const REDIAL_MS = [2_000, 5_000, 10_000, 30_000, 60_000];
/** A guest token lasts at most this long, so a saved join is no use after it. */
const MAX_JOIN_MS = 7 * 24 * 60 * 60 * 1000;

const GUEST_TOP_LEVEL = new Set(["/capabilities", "/whoami", "/profile", "/health", "/workspaces"]);

/**
 * May a guest's request reach the host's server at all? A remote workspace calls its host both
 * under the workspace mount (`/w/<id>/...`) and at the root (`/health`, `/workspaces`,
 * `/workspace/<id>/...`), so both forms pass, but only for a workspace being hosted: its API, its
 * engine proxy behind the mount, and the few top-level reads. The root `/opencode` belongs to the
 * host's first workspace whatever is hosted, so it never passes. Dot segments and encoded
 * separators are refused outright. The server applies the guest token's own rules after this.
 */
export function coworkAllowPath(hostedWorkspaceIds, method, rawPath) {
  if (hostedWorkspaceIds.size === 0) return false;
  const pathname = String(rawPath).split("?")[0];
  if (/%2f|%5c|%2e|\\/i.test(pathname) || pathname.split("/").some((segment) => segment === "." || segment === "..")) return false;
  const workspaceApi = (rest) => {
    const match = /^\/workspace\/([^/]+)(\/.*)?$/.exec(rest);
    return Boolean(match && hostedWorkspaceIds.has(match[1]));
  };
  const mount = /^\/w\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!mount) return (GUEST_TOP_LEVEL.has(pathname) && method === "GET") || workspaceApi(pathname);
  const workspaceId = mount[1];
  if (!hostedWorkspaceIds.has(workspaceId)) return false;
  const rest = mount[2] ?? "/";
  if (GUEST_TOP_LEVEL.has(rest)) return method === "GET";
  if (rest === "/opencode" || rest.startsWith("/opencode/")) return true;
  // The server 404s a mount whose nested workspace differs, but there is no reason to forward it.
  return workspaceApi(rest) && rest.split("/")[2] === workspaceId;
}

/**
 * The chats this app has joined, kept so a restart or a dropped connection can reach the host
 * again. Never the token: that lives with the remote workspace. Only what dialling needs.
 */
export function createJoinStore(dir, fs = { readFile, writeFile, mkdir, chmod }) {
  const file = path.join(dir, "joins.json");
  const valid = (entry) =>
    entry &&
    typeof entry === "object" &&
    /^[0-9a-f]{64}$/.test(entry.hostEndpointId) &&
    typeof entry.workspaceId === "string" &&
    typeof entry.sessionId === "string" &&
    typeof entry.remoteWorkspaceId === "string" &&
    typeof entry.expiresAt === "number";
  return {
    async read() {
      try {
        const parsed = JSON.parse(String(await fs.readFile(file, "utf8")));
        return Array.isArray(parsed) ? parsed.filter(valid) : [];
      } catch {
        return [];
      }
    },
    async write(entries) {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      await fs.writeFile(file, JSON.stringify(entries.filter(valid), null, 2), { mode: 0o600 });
      await fs.chmod(file, 0o600).catch(() => undefined);
    },
  };
}

export const joinKey = (entry) => `${entry.hostEndpointId}/${entry.workspaceId}/${entry.sessionId}`;

/** Why co-working cannot run on this machine, or null when it might. */
export function platformBlocker(platform, arch) {
  if (platform === "darwin" && arch === "x64") return "intel_mac";
  return null;
}

/** This app's endpoint key, made once and kept in the profile, readable only by this user. */
export async function loadEndpointKey(dir, fs = { readFile, writeFile, mkdir, chmod }) {
  const file = path.join(dir, "endpoint.key");
  try {
    const bytes = await fs.readFile(file);
    if (bytes.length === 32) return Array.from(bytes);
  } catch {
    // first run
  }
  const bytes = randomBytes(32);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(file, bytes, { mode: 0o600 });
  await fs.chmod(file, 0o600).catch(() => undefined);
  return Array.from(bytes);
}

function isParticipant(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.participantId === "string" &&
    /^par_[A-Za-z0-9]{24}$/.test(value.participantId) &&
    typeof value.displayName === "string"
  );
}

class CoworkError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * @typedef {object} CoworkBridgeDeps
 * @property {() => Promise<any>} loadIroh  the binding, or null when it is missing
 * @property {string} platform
 * @property {string} arch
 * @property {boolean} packaged
 * @property {string} [scheme]  the protocol invites are written with
 * @property {string[]} [schemes]  the protocols invites are read from
 * @property {() => Promise<{ baseUrl: string, hostToken?: string, ownerToken?: string }>} [serverInfo]
 * @property {(url: string, init?: RequestInit) => Promise<Response>} [localFetch]  loopback only
 * @property {() => Promise<number[]>} [endpointKey]
 * @property {(input: object) => Promise<{ activeId?: string | null, selectedId?: string | null } | null>} [addRemoteWorkspace]  resolves to the workspace list, which has the new one active
 * @property {(event: object) => void} [emit]
 * @property {"n0" | "disabled"} [fallbackRelay]  without a grant; packaged builds are always "disabled"
 * @property {string} [bindAddr]
 * @property {boolean} [directAddresses]  write and read socket addresses in invites (dev, tests)
 * @property {number} [knockPollMs]
 * @property {{ read(): Promise<any[]>, write(entries: any[]): Promise<void> }} [joinStore]  saved joins; none kept without it
 * @property {(input: { workspaceId: string, baseUrl: string, redrobHostUrl: string }) => Promise<unknown>} [updateRemoteWorkspace]
 * @property {number[]} [redialMs]
 */

/** @param {CoworkBridgeDeps} deps */
export function createCoworkBridge(deps) {
  const emit = deps.emit ?? (() => {});
  const dev = !deps.packaged;
  const fallbackRelay = deps.packaged ? "disabled" : (deps.fallbackRelay ?? "n0");
  const schemes = deps.schemes ?? [deps.scheme];
  const hosted = new Set();
  const joins = new Map();
  /** Saved joins being redialled, so one host coming back is dialled once. */
  const redialing = new Map();
  const redialMs = deps.redialMs ?? REDIAL_MS;

  async function savedJoins() {
    if (!deps.joinStore) return [];
    const now = Date.now();
    const all = await deps.joinStore.read();
    const live = all.filter((entry) => entry.expiresAt > now);
    if (live.length !== all.length) await deps.joinStore.write(live);
    return live;
  }

  async function saveJoin(entry) {
    if (!deps.joinStore) return;
    const others = (await deps.joinStore.read()).filter((saved) => joinKey(saved) !== joinKey(entry));
    await deps.joinStore.write([...others, entry]);
  }

  async function forgetJoin(key) {
    if (!deps.joinStore) return;
    const all = await deps.joinStore.read();
    const rest = all.filter((saved) => joinKey(saved) !== key);
    if (rest.length !== all.length) await deps.joinStore.write(rest);
  }

  /**
   * Dials the host in a saved join and opens its loopback proxy, on the same port as before when
   * it is free. Points the remote workspace at the proxy when the port moved.
   */
  async function dialSaved(saved) {
    const { endpoint, binding } = await ensureEndpoint();
    const addr = new binding.EndpointAddr(binding.EndpointId.fromString(saved.hostEndpointId), saved.relayUrl ?? null, dev ? (saved.directAddresses ?? []) : []);
    let connection;
    try {
      connection = await endpoint.connect(addr, COWORK_ALPN);
    } catch (error) {
      throw new CoworkError("host_unreachable", `Could not reach the host: ${error.message ?? error}`);
    }
    let proxy;
    try {
      proxy = await startLoopbackProxy(connection, { port: saved.port });
    } catch {
      proxy = await startLoopbackProxy(connection);
    }
    if (proxy.port !== saved.port) {
      const hostUrl = `${proxy.url}/w/${saved.workspaceId}`;
      await deps.updateRemoteWorkspace?.({ workspaceId: saved.remoteWorkspaceId, baseUrl: hostUrl, redrobHostUrl: hostUrl });
      await saveJoin({ ...saved, port: proxy.port });
    }
    const invite = { endpointId: saved.hostEndpointId, workspaceId: saved.workspaceId, sessionId: saved.sessionId };
    track(joinKey(saved), invite, connection, proxy);
    emit({ type: "join", phase: "reconnected", workspaceId: saved.workspaceId, sessionId: saved.sessionId });
    return proxy;
  }

  /** Keeps trying a saved join until it connects, is left, expires, or the bridge closes. */
  function redial(key) {
    if (redialing.has(key) || closed) return;
    const run = (async () => {
      for (let attempt = 0; !closed; attempt += 1) {
        const saved = (await savedJoins()).find((entry) => joinKey(entry) === key);
        if (!saved || joins.has(key)) return;
        try {
          await dialSaved(saved);
          return;
        } catch {
          emit({ type: "join", phase: "disconnected", workspaceId: saved.workspaceId, sessionId: saved.sessionId });
        }
        const wait = redialMs[Math.min(attempt, redialMs.length - 1)] ?? 60_000;
        await new Promise((resolve) => setTimeout(resolve, wait).unref?.());
      }
    })().finally(() => redialing.delete(key));
    redialing.set(key, run);
  }

  /** Remembers a live join; when its connection drops without a leave, starts redialling. */
  function track(key, invite, connection, proxy) {
    const drop = async () => {
      await proxy.close().catch(() => undefined);
      try {
        connection.close(0n, Array.from(Buffer.from("left")));
      } catch {
        // already closed
      }
    };
    joins.set(key, { invite, proxy, drop });
    void connection.closed().then(() => {
      if (joins.get(key)?.proxy !== proxy) return;
      joins.delete(key);
      void proxy.close().catch(() => undefined);
      emit({ type: "join", phase: "disconnected", workspaceId: invite.workspaceId, sessionId: invite.sessionId });
      redial(key);
    }).catch(() => undefined);
  }

  /** Reconnects every saved join, as after a restart. Loads nothing when there are none. */
  async function rejoin() {
    if (blocker) return { rejoining: 0 };
    const saved = await savedJoins();
    for (const entry of saved) redial(joinKey(entry));
    return { rejoining: saved.length };
  }
  let endpointPromise = null;
  let grantTimer = null;
  let selfCheck = null;
  let closed = false;

  const blocker = platformBlocker(deps.platform, deps.arch);

  async function iroh() {
    if (blocker) throw new CoworkError(blocker, "Co-working needs a Mac with Apple silicon");
    const binding = await deps.loadIroh();
    if (!binding) throw new CoworkError("binding_missing", "Co-working is not available in this build");
    return binding;
  }

  async function server(pathname, init = {}) {
    const info = await deps.serverInfo();
    const headers = { "content-type": "application/json", ...(info.hostToken ? { "x-redrob-host-token": info.hostToken } : { authorization: `Bearer ${info.ownerToken}` }) };
    const response = await deps.localFetch(new URL(pathname, info.baseUrl).toString(), { ...init, headers: { ...headers, ...init.headers } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new CoworkError(body.code ?? "server_error", body.message ?? `Redrob Cowork answered ${response.status}`);
    return body;
  }

  /** A grant for `endpointId`, or null (with the reason emitted) when there is none. */
  async function relayGrant(endpointId) {
    try {
      return await server("/cowork/relay-grant", { method: "POST", body: JSON.stringify({ endpointId }) });
    } catch (error) {
      emit({ type: "relay", ok: false, code: error.code ?? "relay_grant_failed" });
      return null;
    }
  }

  function scheduleGrantRefresh(endpointId, grant) {
    if (grantTimer) clearTimeout(grantTimer);
    if (!grant || closed) return;
    const left = Date.parse(grant.expiresAt) - Date.now();
    grantTimer = setTimeout(async () => {
      const next = await relayGrant(endpointId);
      scheduleGrantRefresh(endpointId, next ?? { expiresAt: new Date(Date.now() + 2 * MIN_GRANT_REFRESH_MS).toISOString() });
    }, Math.max(MIN_GRANT_REFRESH_MS, left / 2));
    grantTimer.unref?.();
  }

  async function bindEndpoint() {
    const binding = await iroh();
    const key = await deps.endpointKey();
    const endpointId = binding.SecretKey.fromBytes(key).public().toString();
    const grant = await relayGrant(endpointId);
    const relays = grant?.relays ?? [];
    const builder = binding.Endpoint.builder();
    binding.presetMinimal(builder);
    builder.secretKey(key);
    builder.alpns([COWORK_ALPN]);
    builder.relayMode(
      relays.length
        ? binding.RelayMode.customFromUrls(relays)
        : fallbackRelay === "n0"
          ? binding.RelayMode.defaultMode()
          : binding.RelayMode.disabled(),
    );
    if (deps.bindAddr) builder.bindAddr(deps.bindAddr);
    const endpoint = await builder.bind();
    scheduleGrantRefresh(endpointId, grant);
    void acceptLoop(endpoint);
    const relayed = relays.length > 0 || fallbackRelay === "n0";
    return { endpoint, endpointId, relays, binding, relayed };
  }

  function ensureEndpoint() {
    endpointPromise ??= bindEndpoint().catch((error) => {
      endpointPromise = null;
      throw error;
    });
    return endpointPromise;
  }

  async function acceptLoop(endpoint) {
    for (;;) {
      const incoming = await endpoint.acceptNext().catch(() => null);
      if (!incoming) return;
      void (async () => {
        if (hosted.size === 0) return incoming.refuse();
        const connection = await (await incoming.accept()).connect();
        emit({ type: "guest-connected", endpointId: connection.remoteId().toString() });
        const target = (await deps.serverInfo()).baseUrl;
        await serveTunnelConnection(connection, { target, allowPath: (method, p) => coworkAllowPath(hosted, method, p) });
      })().catch(() => undefined);
    }
  }

  /** The relay the host is reachable through, for the invite. None when relays are off. */
  async function homeRelay({ endpoint, relayed }) {
    if (!relayed) return null;
    await Promise.race([endpoint.online(), new Promise((resolve) => setTimeout(resolve, ONLINE_WAIT_MS).unref?.())]).catch(() => undefined);
    return endpoint.addr().relayUrl();
  }

  /* ---------- self-check ---------- */

  /** One request through two throwaway endpoints on the loopback. Cached for the app's life. */
  function runSelfCheck() {
    selfCheck ??= (async () => {
      const started = Date.now();
      let upstream, host, guest, proxy;
      try {
        const binding = await iroh();
        upstream = http.createServer((_request, response) => response.end("ok"));
        await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
        const bind = () => {
          const builder = binding.Endpoint.builder();
          binding.presetMinimal(builder);
          builder.relayMode(binding.RelayMode.disabled());
          builder.alpns([COWORK_ALPN]);
          builder.bindAddr("127.0.0.1:0");
          return builder.bind();
        };
        host = await bind();
        guest = await bind();
        void (async () => {
          const incoming = await host.acceptNext();
          const connection = await (await incoming.accept()).connect();
          await serveTunnelConnection(connection, { target: `http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (upstream.address()).port}` });
        })().catch(() => undefined);
        const connection = await guest.connect(new binding.EndpointAddr(host.id(), null, host.boundSockets()), COWORK_ALPN);
        proxy = await startLoopbackProxy(connection);
        const text = await new Promise((resolve, reject) => {
          http.get(`${proxy.url}/self-check`, (response) => {
            let body = "";
            response.on("data", (chunk) => (body += chunk));
            response.on("end", () => resolve(body));
          }).on("error", reject);
        });
        if (text !== "ok") throw new CoworkError("self_check_failed", "The tunnel answered wrongly");
        return { ok: true, ms: Date.now() - started };
      } catch (error) {
        return { ok: false, code: error.code ?? "self_check_failed", message: String(error.message ?? error) };
      } finally {
        await proxy?.close().catch(() => undefined);
        await guest?.close().catch(() => undefined);
        await host?.close().catch(() => undefined);
        upstream?.close();
      }
    })();
    return selfCheck;
  }

  /* ---------- public ---------- */

  async function status() {
    if (blocker) return { available: false, reason: blocker };
    if (!(await deps.loadIroh())) return { available: false, reason: "binding_missing" };
    const check = await runSelfCheck();
    if (!check.ok) return { available: false, reason: "self_check_failed", selfCheck: check };
    const bound = endpointPromise ? await endpointPromise.catch(() => null) : null;
    return {
      available: true,
      selfCheck: check,
      ...(bound ? { endpointId: bound.endpointId, relays: bound.relays } : {}),
      hosting: [...hosted],
      joined: [...joins.values()].map(({ invite, proxy }) => ({ hostEndpointId: invite.endpointId, workspaceId: invite.workspaceId, sessionId: invite.sessionId, url: proxy.url })),
      reconnecting: [...redialing.keys()].filter((key) => !joins.has(key)),
    };
  }

  /** Opens (or keeps) the room on the chat, mints an invite, and starts answering for the workspace. */
  async function host({ workspaceId, sessionId }) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(workspaceId)) || !/^[A-Za-z0-9_-]{1,128}$/.test(String(sessionId))) {
      throw new CoworkError("invalid_payload", "workspaceId and sessionId are required");
    }
    const bound = await ensureEndpoint();
    const { endpoint, endpointId } = bound;
    const roomPath = `/workspace/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/room`;
    const { room } = await server(roomPath, { method: "POST" });
    const invite = await server(`${roomPath}/invites`, { method: "POST" });
    hosted.add(workspaceId);
    const relayUrl = await homeRelay(bound);
    const link = buildInviteLink({
      scheme: deps.scheme,
      endpointId,
      relayUrl,
      workspaceId,
      sessionId,
      secret: invite.secret,
      directAddresses: dev && deps.directAddresses ? endpoint.boundSockets() : undefined,
    });
    return { link, expiresAt: invite.expiresAt, roomId: room.roomId, endpointId, relayUrl };
  }

  /** Stops answering for the workspace. Ending the room itself is the server's (DELETE /room). */
  function stopHosting({ workspaceId }) {
    hosted.delete(workspaceId);
    return { hosting: [...hosted] };
  }

  async function guestCall(proxy, method, pathname, body) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? null : JSON.stringify(body);
      const request = http.request(
        `${proxy.url}${pathname}`,
        { method, headers: data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {} },
        (response) => {
          let text = "";
          response.on("data", (chunk) => (text += chunk));
          response.on("end", () => {
            let json = {};
            try {
              json = JSON.parse(text);
            } catch {
              // not JSON
            }
            resolve({ status: response.statusCode ?? 0, body: json });
          });
        },
      );
      request.on("error", reject);
      request.end(data ?? undefined);
    });
  }

  /**
   * Dials the host in `link`, knocks as `participant`, and waits for an answer. Resolves with the
   * added workspace when allowed; throws `knock_denied`, `knock_timeout` or the server's code.
   */
  /** @param {{ link: string, participant: unknown, signal?: AbortSignal }} input */
  async function join({ link, participant, signal }) {
    const invite = parseInviteLink(link, { schemes, dev: dev && deps.directAddresses === true });
    if (!invite) throw new CoworkError("invite_invalid", "This is not a co-working invite");
    if (!isParticipant(participant)) throw new CoworkError("invalid_payload", "Set your name in Settings first");
    const key = `${invite.endpointId}/${invite.workspaceId}/${invite.sessionId}`;
    if (joins.has(key)) await leave({ hostEndpointId: invite.endpointId, workspaceId: invite.workspaceId, sessionId: invite.sessionId });

    const { endpoint, binding, endpointId } = await ensureEndpoint();
    if (invite.endpointId === endpointId) throw new CoworkError("invite_own", "This invite is to your own room");
    emit({ type: "join", phase: "dialing" });
    const addr = new binding.EndpointAddr(binding.EndpointId.fromString(invite.endpointId), invite.relayUrl, invite.directAddresses);
    let connection;
    try {
      connection = await endpoint.connect(addr, COWORK_ALPN);
    } catch (error) {
      throw new CoworkError("host_unreachable", `Could not reach the host: ${error.message ?? error}`);
    }
    const proxy = await startLoopbackProxy(connection);
    const drop = async () => {
      await proxy.close().catch(() => undefined);
      try {
        connection.close(0n, Array.from(Buffer.from("left")));
      } catch {
        // already closed
      }
    };
    try {
      const room = `/w/${invite.workspaceId}/workspace/${invite.workspaceId}/sessions/${invite.sessionId}/room`;
      const knocked = await guestCall(proxy, "POST", `${room}/knock`, { secret: invite.secret, participant });
      if (knocked.status !== 202) throw new CoworkError(knocked.body.code ?? "knock_failed", knocked.body.message ?? `The host answered ${knocked.status}`);
      emit({ type: "join", phase: "waiting" });
      const deadline = Date.now() + KNOCK_WAIT_MS;
      for (;;) {
        if (signal?.aborted || closed) throw new CoworkError("knock_cancelled", "Stopped waiting");
        const answer = await guestCall(proxy, "GET", `${room}/knock/${knocked.body.knockId}`);
        if (answer.status !== 200) throw new CoworkError(answer.body.code ?? "knock_failed", answer.body.message ?? `The host answered ${answer.status}`);
        if (answer.body.status === "denied") throw new CoworkError("knock_denied", "The host did not let you in");
        if (answer.body.status === "allowed" && answer.body.token) {
          const workspace = await deps.addRemoteWorkspace({
            baseUrl: `${proxy.url}/w/${invite.workspaceId}`,
            remoteType: "redrob",
            redrobWorkspaceId: invite.workspaceId,
            redrobToken: answer.body.token,
            displayName: "Live co-working",
          });
          const remoteWorkspaceId = workspace?.activeId ?? workspace?.selectedId ?? null;
          if (remoteWorkspaceId) {
            const expiresAt = typeof answer.body.expiresAt === "number" ? answer.body.expiresAt : Date.now() + MAX_JOIN_MS;
            await saveJoin({
              hostEndpointId: invite.endpointId,
              relayUrl: invite.relayUrl,
              ...(invite.directAddresses.length ? { directAddresses: invite.directAddresses } : {}),
              workspaceId: invite.workspaceId,
              sessionId: invite.sessionId,
              remoteWorkspaceId,
              port: proxy.port,
              expiresAt: Math.min(expiresAt, Date.now() + MAX_JOIN_MS),
            }).catch(() => undefined);
          }
          track(key, invite, connection, proxy);
          emit({ type: "join", phase: "joined", workspaceId: invite.workspaceId, sessionId: invite.sessionId });
          return { workspace, url: proxy.url, workspaceId: invite.workspaceId, sessionId: invite.sessionId };
        }
        if (Date.now() > deadline) throw new CoworkError("knock_timeout", "The host did not answer in time");
        await new Promise((resolve) => setTimeout(resolve, deps.knockPollMs ?? KNOCK_POLL_MS));
      }
    } catch (error) {
      await drop();
      emit({ type: "join", phase: "failed", code: error.code ?? "join_failed" });
      throw error;
    }
  }

  async function leave({ hostEndpointId, workspaceId, sessionId }) {
    const key = `${hostEndpointId}/${workspaceId}/${sessionId}`;
    const entry = joins.get(key);
    joins.delete(key);
    // Forget first, so the drop below is not taken for the host going away.
    await forgetJoin(key).catch(() => undefined);
    await entry?.drop();
    return { ok: Boolean(entry) };
  }

  async function close() {
    closed = true;
    if (grantTimer) clearTimeout(grantTimer);
    for (const entry of joins.values()) await entry.drop();
    joins.clear();
    hosted.clear();
    const bound = endpointPromise ? await endpointPromise.catch(() => null) : null;
    await bound?.endpoint.close().catch(() => undefined);
  }

  return { status, host, stopHosting, join, leave, rejoin, close, selfCheck: runSelfCheck };
}

/** The bridge over IPC. Errors keep their code so the renderer can say the right thing. */
export function registerCoworkIpc({ ipcMain, bridge, getWindow }) {
  const wrap = (fn) => async (_event, input) => {
    try {
      return { ok: true, value: await fn(input ?? {}) };
    } catch (error) {
      return { ok: false, code: error.code ?? "cowork_failed", message: String(error.message ?? error) };
    }
  };
  const joining = new Map();
  ipcMain.handle("redrob:cowork:status", wrap(() => bridge.status()));
  ipcMain.handle("redrob:cowork:host", wrap((input) => bridge.host(input)));
  ipcMain.handle("redrob:cowork:stopHosting", wrap((input) => bridge.stopHosting(input)));
  ipcMain.handle(
    "redrob:cowork:join",
    wrap(async (input) => {
      const controller = new AbortController();
      const id = String(input.link ?? "");
      joining.get(id)?.abort();
      joining.set(id, controller);
      try {
        return await bridge.join({ link: input.link, participant: input.participant, signal: controller.signal });
      } finally {
        if (joining.get(id) === controller) joining.delete(id);
      }
    }),
  );
  ipcMain.handle(
    "redrob:cowork:cancelJoin",
    wrap((input) => {
      joining.get(String(input.link ?? ""))?.abort();
      return { ok: true };
    }),
  );
  ipcMain.handle("redrob:cowork:leave", wrap((input) => bridge.leave(input)));
  return (event) => getWindow()?.webContents?.send("redrob:cowork:event", event);
}
