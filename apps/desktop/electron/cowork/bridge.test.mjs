import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { coworkAllowPath, createCoworkBridge, createJoinStore, joinKey, loadEndpointKey, platformBlocker, registerCoworkIpc } from "./bridge.mjs";
import { buildInviteLink, parseInviteLink } from "./invite-link.mjs";

let iroh = null;
try {
  iroh = await import("@number0/iroh");
} catch {
  iroh = null;
}

const HOST_ID = "a".repeat(64);
const SECRET = "A".repeat(43);
const lee = { participantId: "par_00000000000000000000000a", displayName: "Lee Minji" };

describe("invite links", () => {
  const schemes = ["redrob"];
  const base = { scheme: "redrob", endpointId: HOST_ID, relayUrl: "https://relay-apne2.redrob.ai/", workspaceId: "ws_1", sessionId: "ses_1", secret: SECRET };

  it("round-trips", () => {
    const link = buildInviteLink(base);
    assert.match(link, /^redrob:\/\/join\?h=a{64}&r=https/);
    assert.deepEqual(parseInviteLink(link, { schemes }), {
      endpointId: HOST_ID,
      relayUrl: "https://relay-apne2.redrob.ai/",
      workspaceId: "ws_1",
      sessionId: "ses_1",
      secret: SECRET,
      directAddresses: [],
    });
    assert.equal(parseInviteLink(buildInviteLink({ ...base, relayUrl: null }), { schemes }).relayUrl, null);
  });

  it("refuses anything off", () => {
    const bad = (overrides) => parseInviteLink(buildInviteLink({ ...base, ...overrides }), { schemes });
    assert.equal(bad({ scheme: "other" }), null);
    assert.equal(bad({ endpointId: "abc" }), null);
    assert.equal(bad({ workspaceId: "../etc" }), null);
    assert.equal(bad({ sessionId: "" }), null);
    assert.equal(bad({ secret: "short" }), null);
    assert.equal(bad({ relayUrl: "http://relay.example" }), null, "plain http relays only in dev");
    assert.equal(bad({ relayUrl: "https://user:pw@relay.example" }), null);
    assert.equal(parseInviteLink("redrob://open-handoff?file=x", { schemes }), null);
    assert.equal(parseInviteLink("not a url", { schemes }), null);
  });

  it("carries direct addresses only in development", () => {
    const link = buildInviteLink({ ...base, directAddresses: ["127.0.0.1:5000", "[::1]:5001"] });
    assert.deepEqual(parseInviteLink(link, { schemes }).directAddresses, [], "a packaged build ignores them");
    assert.deepEqual(parseInviteLink(link, { schemes, dev: true }).directAddresses, ["127.0.0.1:5000", "[::1]:5001"]);
    assert.equal(parseInviteLink(buildInviteLink({ ...base, directAddresses: ["evil.example:80"] }), { schemes, dev: true }), null);
  });
});

describe("what a guest may reach", () => {
  const hosted = new Set(["ws_1"]);
  const allow = (method, p) => coworkAllowPath(hosted, method, p);

  it("a hosted workspace's API and engine proxy, under its mount or at the root", () => {
    assert.equal(allow("GET", "/w/ws_1/workspace/ws_1/sessions/ses_1/room"), true);
    assert.equal(allow("POST", "/w/ws_1/workspace/ws_1/sessions/ses_1/room/knock"), true);
    assert.equal(allow("GET", "/w/ws_1/opencode/session/ses_1/message?limit=5"), true);
    assert.equal(allow("GET", "/workspace/ws_1/sessions"), true);
    assert.equal(allow("GET", "/w/ws_1/health"), true);
    assert.equal(allow("GET", "/workspaces"), true);
  });

  it("nothing else", () => {
    assert.equal(allow("GET", "/w/ws_2/workspace/ws_2/sessions"), false, "another workspace");
    assert.equal(allow("GET", "/workspace/ws_2/sessions"), false);
    assert.equal(allow("GET", "/w/ws_1/workspace/ws_2/sessions"), false, "a mount that names another workspace");
    assert.equal(allow("GET", "/opencode/session"), false, "the root engine proxy is the first workspace's");
    assert.equal(allow("POST", "/tokens"), false);
    assert.equal(allow("PUT", "/profile"), false);
    assert.equal(allow("POST", "/w/ws_1/health"), false);
    assert.equal(allow("GET", "/w/ws_1/workspace/ws_1/../../tokens"), false);
    assert.equal(allow("GET", "/w/ws_1/workspace/ws_1%2f..%2ftokens"), false);
    assert.equal(allow("GET", "/w/ws_1/workspace/ws_1/%2e%2e/x"), false);
    assert.equal(coworkAllowPath(new Set(), "GET", "/health"), false, "not hosting: nothing at all");
  });
});

describe("platforms", () => {
  it("Intel Macs are out, without loading the binding", async () => {
    assert.equal(platformBlocker("darwin", "x64"), "intel_mac");
    assert.equal(platformBlocker("darwin", "arm64"), null);
    assert.equal(platformBlocker("win32", "x64"), null);
    let loaded = false;
    const bridge = createCoworkBridge({ platform: "darwin", arch: "x64", packaged: true, loadIroh: async () => ((loaded = true), iroh) });
    assert.deepEqual(await bridge.status(), { available: false, reason: "intel_mac" });
    await assert.rejects(bridge.host({ workspaceId: "ws", sessionId: "ses" }), { code: "intel_mac" });
    assert.equal(loaded, false);
  });

  it("a missing binding is reported, not thrown", async () => {
    const bridge = createCoworkBridge({ platform: "linux", arch: "x64", packaged: true, loadIroh: async () => null });
    assert.deepEqual(await bridge.status(), { available: false, reason: "binding_missing" });
    await assert.rejects(bridge.join({ link: "redrob://join", participant: lee }), { code: "invite_invalid" });
  });
});

describe("endpoint key", () => {
  it("is made once, kept, and readable only by this user", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cowork-key-"));
    try {
      const first = await loadEndpointKey(path.join(dir, "cowork"));
      assert.equal(first.length, 32);
      assert.deepEqual(await loadEndpointKey(path.join(dir, "cowork")), first);
      assert.deepEqual(Array.from(await readFile(path.join(dir, "cowork", "endpoint.key"))), first);
      if (process.platform !== "win32") assert.equal((await stat(path.join(dir, "cowork", "endpoint.key"))).mode & 0o777, 0o600);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("saved joins", () => {
  it("keep what dialling needs, readable only by this user, and drop anything malformed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cowork-joins-"));
    try {
      const store = createJoinStore(path.join(dir, "cowork"));
      assert.deepEqual(await store.read(), []);
      const entry = { hostEndpointId: HOST_ID, relayUrl: null, workspaceId: "ws_1", sessionId: "ses_1", remoteWorkspaceId: "rem_ws_1", port: 4000, expiresAt: 5 };
      await store.write([entry, { hostEndpointId: "nope" }]);
      assert.deepEqual(await store.read(), [entry]);
      assert.equal(joinKey(entry), `${HOST_ID}/ws_1/ses_1`);
      const text = await readFile(path.join(dir, "cowork", "joins.json"), "utf8");
      assert.ok(!/token/i.test(text), "no token is written");
      if (process.platform !== "win32") assert.equal((await stat(path.join(dir, "cowork", "joins.json"))).mode & 0o777, 0o600);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("IPC", () => {
  it("keeps the error code for the renderer", async () => {
    const handlers = new Map();
    const sent = [];
    const send = registerCoworkIpc({
      ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
      bridge: {
        status: async () => ({ available: true }),
        host: async () => {
          throw Object.assign(new Error("Co-working needs a Mac with Apple silicon"), { code: "intel_mac" });
        },
      },
      getWindow: () => ({ webContents: { send: (...args) => sent.push(args) } }),
    });
    assert.deepEqual([...handlers.keys()].sort(), [
      "redrob:cowork:cancelJoin",
      "redrob:cowork:host",
      "redrob:cowork:join",
      "redrob:cowork:leave",
      "redrob:cowork:status",
      "redrob:cowork:stopHosting",
    ]);
    assert.deepEqual(await handlers.get("redrob:cowork:status")({}, undefined), { ok: true, value: { available: true } });
    assert.deepEqual(await handlers.get("redrob:cowork:host")({}, {}), { ok: false, code: "intel_mac", message: "Co-working needs a Mac with Apple silicon" });
    send({ type: "join", phase: "waiting" });
    assert.deepEqual(sent, [["redrob:cowork:event", { type: "join", phase: "waiting" }]]);
  });
});

/**
 * Two bridges on this machine over real iroh, relays off, each in front of a stand-in redrob-server:
 * host, invite, dial, knock, allow, and a request through the guest's remote workspace URL.
 */
describe("host and guest over iroh", { skip: iroh ? false : "@number0/iroh is not installed for this platform" }, () => {
  const ROOM = "/workspace/ws_1/sessions/ses_1/room";
  let hostServer, guestServer, hostBridge, guestBridge;
  const guestKey = Array.from(randomBytes(32));
  const memory = () => {
    let entries = [];
    return { read: async () => entries.map((entry) => ({ ...entry })), write: async (next) => void (entries = next.map((entry) => ({ ...entry }))) };
  };
  const joinStore = memory();
  const updated = [];
  const seen = [];
  const knocks = new Map();
  const added = [];
  const events = [];

  const listen = (handler) =>
    new Promise((resolve) => {
      const server = http.createServer(handler);
      server.listen(0, "127.0.0.1", () => resolve(server));
    });
  const json = (response, status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const readBody = (request) =>
    new Promise((resolve) => {
      let text = "";
      request.on("data", (chunk) => (text += chunk));
      request.on("end", () => resolve(text ? JSON.parse(text) : {}));
    });
  const info = (server) => async () => ({ baseUrl: `http://127.0.0.1:${server.address().port}`, hostToken: "host-secret" });
  // loopback-fetch: the stand-in servers listen on 127.0.0.1.
  const localFetch = (url, init) => fetch(url, init);

  before(async () => {
    hostServer = await listen(async (request, response) => {
      const url = new URL(request.url, "http://x");
      const pathname = url.pathname.replace(/^\/w\/ws_1/, "");
      const body = request.method === "POST" ? await readBody(request) : {};
      seen.push({ method: request.method, pathname: url.pathname, endpoint: request.headers["x-redrob-endpoint-id"], hostToken: request.headers["x-redrob-host-token"], body });
      if (pathname === "/cowork/relay-grant") return json(response, 409, { code: "redrob_key_missing" });
      if (pathname === ROOM && request.method === "POST") return json(response, 201, { room: { roomId: "room_1" } });
      if (pathname === `${ROOM}/invites`) return json(response, 201, { secret: SECRET, expiresAt: Date.now() + 1000 });
      if (pathname === `${ROOM}/knock`) {
        const knockId = `knock_${knocks.size + 1}`;
        knocks.set(knockId, { status: "pending", endpoint: request.headers["x-redrob-endpoint-id"], participant: body.participant });
        return json(response, 202, { knockId, status: "pending" });
      }
      const knock = /\/room\/knock\/(.+)$/.exec(pathname);
      if (knock) {
        const entry = knocks.get(knock[1]);
        // The host answers the first poll later, as a person would.
        if (entry.status === "pending" && entry.decide) entry.status = entry.decide;
        else if (entry.status === "pending") entry.decide = entry.participant.displayName === "Park Jun" ? "denied" : "allowed";
        return json(response, 200, entry.status === "allowed" ? { status: "allowed", token: "guest-token" } : { status: entry.status });
      }
      if (pathname === ROOM) return json(response, 200, { room: { roomId: "room_1" }, authorization: request.headers.authorization ?? null });
      return json(response, 404, { code: "not_found" });
    });
    guestServer = await listen((request, response) => json(response, 409, { code: "redrob_key_missing" }));
    const common = { platform: process.platform, arch: process.arch, packaged: false, fallbackRelay: /** @type {"disabled"} */ ("disabled"), bindAddr: "127.0.0.1:0", directAddresses: true, knockPollMs: 50, scheme: "redrob", schemes: ["redrob"], localFetch, loadIroh: async () => iroh };
    hostBridge = createCoworkBridge({ ...common, serverInfo: info(hostServer), endpointKey: async () => Array.from(randomBytes(32)), addRemoteWorkspace: async () => assert.fail("the host adds nothing") });
    guestBridge = createCoworkBridge({
      ...common,
      serverInfo: info(guestServer),
      endpointKey: async () => guestKey,
      addRemoteWorkspace: async (input) => (added.push(input), { activeId: "rem_ws_1" }),
      emit: (event) => events.push(event),
      joinStore,
      redialMs: [50],
    });
  });

  after(async () => {
    await guestBridge?.close();
    await hostBridge?.close();
    hostServer?.close();
    guestServer?.close();
  });

  it("passes its own self-check", async () => {
    const status = await hostBridge.status();
    assert.equal(status.available, true, JSON.stringify(status));
    assert.equal(status.selfCheck.ok, true);
  });

  it("hosts, is joined after the host allows, and tunnels the guest's requests", async () => {
    const hosted = await hostBridge.host({ workspaceId: "ws_1", sessionId: "ses_1" });
    const invite = parseInviteLink(hosted.link, { schemes: ["redrob"], dev: true });
    assert.equal(invite.endpointId, hosted.endpointId);
    assert.equal(invite.relayUrl, null, "relays are off here");
    assert.ok(invite.directAddresses.length > 0);
    // The host asked its own server for the room and invite with its host token.
    assert.ok(seen.some((entry) => entry.pathname === `${ROOM}/invites` && entry.hostToken === "host-secret"));

    const joined = await guestBridge.join({ link: hosted.link, participant: lee });
    assert.equal(joined.workspaceId, "ws_1");
    assert.deepEqual(added, [{ baseUrl: `${joined.url}/w/ws_1`, remoteType: "redrob", redrobWorkspaceId: "ws_1", redrobToken: "guest-token", displayName: "Live co-working" }]);
    const guestStatus = await guestBridge.status();
    const knock = seen.find((entry) => entry.pathname === `/w/ws_1${ROOM}/knock`);
    assert.equal(knock.endpoint, guestStatus.endpointId, "the host's bridge named the knocking device");
    assert.equal(knock.hostToken, undefined, "nothing the guest sends can carry the host's token");
    assert.deepEqual(knock.body, { secret: SECRET, participant: lee });
    assert.deepEqual(events.filter((event) => event.type === "join").map((event) => event.phase), ["dialing", "waiting", "joined"]);

    // loopback-fetch: the guest's own loopback proxy.
    const through = await fetch(`${joined.url}/w/ws_1${ROOM}`, { headers: { authorization: "Bearer guest-token", "x-redrob-host-token": "forged" } });
    assert.equal(through.status, 200);
    assert.deepEqual(await through.json(), { room: { roomId: "room_1" }, authorization: "Bearer guest-token" });
    assert.equal(seen.at(-1).hostToken, undefined);
    // loopback-fetch: the guest's own loopback proxy.
    const outside = await fetch(`${joined.url}/tokens`, { method: "POST" });
    assert.equal(outside.status, 403);

    hostBridge.stopHosting({ workspaceId: "ws_1" });
    // loopback-fetch: the guest's own loopback proxy.
    assert.equal((await fetch(`${joined.url}/w/ws_1${ROOM}`)).status, 403, "stopped hosting: nothing gets through");
    assert.deepEqual(await guestBridge.leave({ hostEndpointId: invite.endpointId, workspaceId: "ws_1", sessionId: "ses_1" }), { ok: true });
    assert.deepEqual(await joinStore.read(), [], "leaving forgets the join");
  });

  it("after a restart, reaches the host again and moves the workspace when its port is taken", async () => {
    const hosted = await hostBridge.host({ workspaceId: "ws_1", sessionId: "ses_1" });
    const joined = await guestBridge.join({ link: hosted.link, participant: lee });
    const [saved] = await joinStore.read();
    assert.equal(saved.remoteWorkspaceId, "rem_ws_1");
    assert.equal(saved.port, Number(new URL(joined.url).port));
    assert.equal(saved.hostEndpointId, hosted.endpointId);

    // The app quits; something else takes the old port before it starts again.
    await guestBridge.close();
    const blocker = await new Promise((resolve) => {
      const server = http.createServer();
      server.listen(saved.port, "127.0.0.1", () => resolve(server));
    });
    const restartedEvents = [];
    guestBridge = createCoworkBridge({
      platform: process.platform,
      arch: process.arch,
      packaged: false,
      fallbackRelay: /** @type {"disabled"} */ ("disabled"),
      bindAddr: "127.0.0.1:0",
      directAddresses: true,
      scheme: "redrob",
      localFetch,
      loadIroh: async () => iroh,
      serverInfo: info(guestServer),
      endpointKey: async () => guestKey,
      addRemoteWorkspace: async () => assert.fail("a rejoin adds nothing"),
      updateRemoteWorkspace: async (input) => void updated.push(input),
      emit: (event) => restartedEvents.push(event),
      joinStore,
      redialMs: [50],
    });
    try {
      // The earlier test stopped hosting; the host is back for this chat.
      await hostBridge.host({ workspaceId: "ws_1", sessionId: "ses_1" });
      assert.deepEqual(await guestBridge.rejoin(), { rejoining: 1 });
      const deadline = Date.now() + 10_000;
      while (!restartedEvents.some((event) => event.phase === "reconnected") && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok(restartedEvents.some((event) => event.phase === "reconnected"), JSON.stringify(restartedEvents));
      const status = /** @type {{ joined: Array<{ url: string }> }} */ (await guestBridge.status());
      const [{ url }] = status.joined;
      assert.notEqual(Number(new URL(url).port), saved.port);
      assert.deepEqual(updated, [{ workspaceId: "rem_ws_1", baseUrl: `${url}/w/ws_1`, redrobHostUrl: `${url}/w/ws_1` }]);
      assert.equal((await joinStore.read())[0].port, Number(new URL(url).port));
      // loopback-fetch: the guest's own loopback proxy, through to the host with the saved token.
      const through = await fetch(`${url}/w/ws_1${ROOM}`, { headers: { authorization: "Bearer guest-token" } });
      assert.equal(through.status, 200);
    } finally {
      blocker.close();
      await guestBridge.leave({ hostEndpointId: saved.hostEndpointId, workspaceId: "ws_1", sessionId: "ses_1" });
    }
  });

  it("a denied knock fails the join and leaves nothing behind", async () => {
    const hosted = await hostBridge.host({ workspaceId: "ws_1", sessionId: "ses_1" });
    const before = added.length;
    await assert.rejects(guestBridge.join({ link: hosted.link, participant: { participantId: "par_00000000000000000000000b", displayName: "Park Jun" } }), { code: "knock_denied" });
    assert.equal(added.length, before);
    assert.deepEqual((await guestBridge.status()).joined, []);
  });

  it("refuses its own invite and a missing name", async () => {
    const hosted = await hostBridge.host({ workspaceId: "ws_1", sessionId: "ses_1" });
    await assert.rejects(hostBridge.join({ link: hosted.link, participant: lee }), { code: "invite_own" });
    await assert.rejects(guestBridge.join({ link: hosted.link, participant: { displayName: "x" } }), { code: "invalid_payload" });
  });
});
