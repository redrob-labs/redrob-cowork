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
 * @property {(input: object) => Promise<unknown>} [addRemoteWorkspace]
 * @property {(event: object) => void} [emit]
 * @property {"n0" | "disabled"} [fallbackRelay]  without a grant; packaged builds are always "disabled"
 * @property {string} [bindAddr]
 * @property {boolean} [directAddresses]  write and read socket addresses in invites (dev, tests)
 * @property {number} [knockPollMs]
 */

/** @param {CoworkBridgeDeps} deps */
export function createCoworkBridge(deps) {
  const emit = deps.emit ?? (() => {});
  const dev = !deps.packaged;
  const fallbackRelay = deps.packaged ? "disabled" : (deps.fallbackRelay ?? "n0");
  const schemes = deps.schemes ?? [deps.scheme];
  const hosted = new Set();
  const joins = new Map();
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
          joins.set(key, { invite, proxy, drop });
          emit({ type: "join", phase: "joined", workspaceId: invite.workspaceId, sessionId: invite.sessionId });
          void connection.closed().then(() => {
            if (joins.get(key)?.proxy !== proxy) return;
            joins.delete(key);
            void proxy.close().catch(() => undefined);
            emit({ type: "join", phase: "disconnected", workspaceId: invite.workspaceId, sessionId: invite.sessionId });
          }).catch(() => undefined);
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

  return { status, host, stopHosting, join, leave, close, selfCheck: runSelfCheck };
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
