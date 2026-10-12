import { afterEach, describe, expect, test } from "bun:test";
import { readAuditEntries } from "./audit.js";
import {
  assertGuestEngineRequest,
  assertGuestRoute,
  filterGuestEventStream,
  guestMaySeeEvent,
  type GuestGrant,
} from "./guest-access.js";
import { ApiError } from "./errors.js";
import { startRouteTestServer } from "./test-support/route-test-server.js";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
});

const SHARED = "ses_shared0000000000000000";
const OTHER = "ses_other00000000000000000";
const guest: GuestGrant = {
  workspaceId: "workspace",
  sessionId: SHARED,
  participant: { participantId: "par_000000000000000000000009", displayName: "Kim Jiwon" },
  capabilities: ["send", "stop"],
};

function code(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof ApiError ? error.code : "other";
  }
}

describe("guest route rules", () => {
  test("only the shared chat's reads, comments and room", () => {
    expect(code(() => assertGuestRoute(guest, "GET", `/workspace/workspace/sessions/${SHARED}`))).toBeNull();
    expect(code(() => assertGuestRoute(guest, "GET", `/workspace/workspace/sessions/${SHARED}/review`))).toBeNull();
    expect(code(() => assertGuestRoute(guest, "POST", `/workspace/workspace/sessions/${SHARED}/review/comments`))).toBeNull();
    expect(code(() => assertGuestRoute(guest, "GET", `/workspace/workspace/sessions/${SHARED}/room/events`))).toBeNull();
    expect(code(() => assertGuestRoute(guest, "PUT", `/workspace/workspace/sessions/${SHARED}/review/state`))).toBe("guest_forbidden");
    expect(code(() => assertGuestRoute(guest, "GET", `/workspace/workspace/sessions/${OTHER}`))).toBe("guest_forbidden");
    expect(code(() => assertGuestRoute(guest, "GET", "/workspace/other/sessions"))).toBe("guest_forbidden");
    expect(code(() => assertGuestRoute(guest, "GET", "/workspace/workspace/config"))).toBe("guest_forbidden");
    expect(code(() => assertGuestRoute(guest, "POST", `/workspace/workspace/sessions/${SHARED}/handoff/preview`))).toBe("guest_forbidden");
    expect(code(() => assertGuestRoute(guest, "GET", "/tokens"))).toBe("guest_forbidden");
  });

  test("lists come back narrowed to the shared chat and workspace", () => {
    const sessions = assertGuestRoute(guest, "GET", "/workspace/workspace/sessions");
    expect(sessions?.({ items: [{ id: SHARED }, { id: OTHER }] })).toEqual({ items: [{ id: SHARED }] });
    const workspaces = assertGuestRoute(guest, "GET", "/workspaces");
    expect(workspaces?.({ items: [{ id: "workspace" }, { id: "private" }], activeId: "private" })).toEqual({
      items: [{ id: "workspace" }],
      activeId: "workspace",
    });
  });
});

describe("guest engine rules", () => {
  test("reads of the shared chat and safe globals; nothing that reads files", () => {
    expect(assertGuestEngineRequest(guest, "GET", `/session/${SHARED}/message`).kind).toBe("plain");
    expect(assertGuestEngineRequest(guest, "GET", "/config/providers").kind).toBe("plain");
    expect(assertGuestEngineRequest(guest, "GET", "/event").kind).toBe("events");
    expect(assertGuestEngineRequest(guest, "GET", "/permission").kind).toBe("filter");
    expect(code(() => assertGuestEngineRequest(guest, "GET", `/session/${OTHER}/message`))).toBe("guest_forbidden");
    expect(code(() => assertGuestEngineRequest(guest, "GET", "/file/content"))).toBe("guest_forbidden");
    expect(code(() => assertGuestEngineRequest(guest, "GET", "/find/file"))).toBe("guest_forbidden");
  });

  test("sending, stopping and answering follow capabilities; nothing else is allowed", () => {
    expect(assertGuestEngineRequest(guest, "POST", `/session/${SHARED}/prompt_async`)).toEqual({ kind: "action", action: "message.sent" });
    expect(assertGuestEngineRequest(guest, "POST", `/session/${SHARED}/abort`)).toEqual({ kind: "action", action: "run.stopped" });
    expect(code(() => assertGuestEngineRequest(guest, "POST", "/permission/per_1/reply"))).toBe("guest_capability_missing");
    expect(code(() => assertGuestEngineRequest({ ...guest, capabilities: [] }, "POST", `/session/${SHARED}/prompt_async`))).toBe(
      "guest_capability_missing",
    );
    expect(assertGuestEngineRequest({ ...guest, capabilities: ["approve"] }, "POST", "/question/que_1/reply").kind).toBe("action");
    for (const path of [`/session/${SHARED}/fork`, `/session/${SHARED}/revert`, `/session/${SHARED}/shell`, `/session/${OTHER}/prompt_async`, "/session"]) {
      expect(code(() => assertGuestEngineRequest(guest, "POST", path))).toBe("guest_forbidden");
    }
    expect(code(() => assertGuestEngineRequest(guest, "DELETE", `/session/${SHARED}`))).toBe("guest_forbidden");
    expect(code(() => assertGuestEngineRequest(guest, "PATCH", `/session/${SHARED}`))).toBe("guest_forbidden");
  });

  test("events of other chats are dropped, in any of the engine's shapes", () => {
    expect(guestMaySeeEvent({ type: "message.part.updated", properties: { part: { sessionID: SHARED } } }, SHARED)).toBe(true);
    expect(guestMaySeeEvent({ type: "message.updated", properties: { info: { sessionID: OTHER } } }, SHARED)).toBe(false);
    expect(guestMaySeeEvent({ type: "session.updated", properties: { info: { id: SHARED } } }, SHARED)).toBe(true);
    expect(guestMaySeeEvent({ type: "session.updated", properties: { info: { id: OTHER } } }, SHARED)).toBe(false);
    expect(guestMaySeeEvent({ directory: "/x", payload: { type: "permission.asked", properties: { sessionID: OTHER } } }, SHARED)).toBe(false);
    expect(guestMaySeeEvent({ type: "server.connected", properties: {} }, SHARED)).toBe(true);
    expect(guestMaySeeEvent({ type: "file.edited", properties: { file: "/secret" } }, SHARED)).toBe(false);
  });

  test("the stream filter splits events across chunks and drops what does not parse", async () => {
    const events = [
      `data: ${JSON.stringify({ type: "server.connected", properties: {} })}\n\n`,
      `data: ${JSON.stringify({ type: "message.updated", properties: { info: { sessionID: OTHER } } })}\n\n`,
      `data: ${JSON.stringify({ type: "message.updated", properties: { info: { sessionID: SHARED } } })}\n\n`,
      "data: {not json\n\n",
      ": keep-alive\n\n",
    ].join("");
    const bytes = new TextEncoder().encode(events);
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
        controller.close();
      },
    });
    const text = await new Response(filterGuestEventStream(source, SHARED)).text();
    expect(text).toContain("server.connected");
    expect(text).toContain(SHARED);
    expect(text).not.toContain(OTHER);
    expect(text).not.toContain("not json");
    expect(text).toContain(": keep-alive");
  });
});

/** A stand-in engine HTTP API with two chats, to drive the proxy as a guest. */
function fakeEngineServer() {
  const seen: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      seen.push(`${request.method} ${url.pathname}`);
      const json = (body: unknown) => Response.json(body);
      if (url.pathname === "/event") {
        const body = [
          `data: ${JSON.stringify({ type: "message.updated", properties: { info: { sessionID: OTHER, id: "msg_secret" } } })}\n\n`,
          `data: ${JSON.stringify({ type: "message.updated", properties: { info: { sessionID: SHARED, id: "msg_shared" } } })}\n\n`,
        ].join("");
        return new Response(body, { headers: { "content-type": "text/event-stream" } });
      }
      if (url.pathname === "/session") return json([{ id: SHARED, title: "Shared" }, { id: OTHER, title: "Private" }]);
      if (url.pathname === "/permission") return json([{ id: "per_1", sessionID: OTHER }, { id: "per_2", sessionID: SHARED }]);
      if (url.pathname === `/session/${SHARED}/message`) return json([{ info: { id: "msg_shared" } }]);
      if (url.pathname.endsWith("/prompt_async") || url.pathname.endsWith("/abort")) return json(true);
      return json({ ok: true });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, seen, stop: () => server.stop(true) };
}

describe("guest tokens on the server", () => {
  async function setup(guestOverrides: Record<string, unknown> = {}, tokenExtra: Record<string, unknown> = {}) {
    const engine = fakeEngineServer();
    cleanups.push(engine.stop);
    const harness = await startRouteTestServer();
    cleanups.push(harness.cleanup);
    harness.config.workspaces[0]!.baseUrl = engine.url;
    harness.config.workspaces[0]!.directory = harness.workspace;
    const issued = await harness.host("POST", "/tokens", {
      scope: "collaborator",
      guest: { workspaceId: "workspace", sessionId: SHARED, participant: guest.participant, ...guestOverrides },
      ...tokenExtra,
    });
    expect(issued.status).toBe(201);
    const { token, id } = (await issued.json()) as { token: string; id: string };
    return { harness, engine, token, tokenId: id, asGuest: harness.as(token) };
  }

  test("a guest sees only the shared chat, as themselves", async () => {
    const { harness, asGuest } = await setup();
    const workspaces = (await (await asGuest("GET", "/workspaces")).json()) as { items: Array<{ id: string }> };
    expect(workspaces.items.map((item) => item.id)).toEqual(["workspace"]);
    expect(((await (await asGuest("GET", "/profile")).json()) as { profile: { displayName: string } }).profile.displayName).toBe("Kim Jiwon");

    const comment = await asGuest("POST", `/workspace/workspace/sessions/${SHARED}/review/comments`, {
      anchor: { kind: "message", messageId: "msg_shared" },
      text: "From the guest",
    });
    expect(comment.status).toBe(201);
    expect(((await comment.json()) as { comment: { author: { displayName: string } } }).comment.author.displayName).toBe("Kim Jiwon");

    expect((await asGuest("GET", `/workspace/workspace/sessions/${OTHER}/review`)).status).toBe(403);
    expect((await asGuest("PUT", `/workspace/workspace/sessions/${SHARED}/review/state`, { status: "approved" })).status).toBe(403);
    expect((await asGuest("GET", "/workspace/workspace/audit")).status).toBe(403);
    expect((await asGuest("GET", "/tokens")).status).toBe(401);
    expect((await asGuest("POST", `/workspace/workspace/sessions/${SHARED}/handoff/preview`, {})).status).toBe(403);
    expect((await harness.collaborator("GET", `/workspace/workspace/sessions/${OTHER}/review`)).status).toBe(200);
  });

  test("through the engine: lists and events narrowed, sends allowed, files and other chats refused, actions audited", async () => {
    const { harness, engine, asGuest } = await setup();
    const sessions = (await (await asGuest("GET", "/w/workspace/opencode/session")).json()) as Array<{ id: string }>;
    expect(sessions.map((session) => session.id)).toEqual([SHARED]);
    const pending = (await (await asGuest("GET", "/w/workspace/opencode/permission")).json()) as Array<{ id: string }>;
    expect(pending.map((item) => item.id)).toEqual(["per_2"]);
    const events = await (await asGuest("GET", "/w/workspace/opencode/event")).text();
    expect(events).toContain("msg_shared");
    expect(events).not.toContain("msg_secret");

    expect((await asGuest("POST", `/w/workspace/opencode/session/${SHARED}/prompt_async`, { parts: [] })).status).toBe(200);
    expect((await asGuest("POST", `/w/workspace/opencode/session/${OTHER}/prompt_async`, { parts: [] })).status).toBe(403);
    expect((await asGuest("GET", "/w/workspace/opencode/file/content?path=/etc/passwd")).status).toBe(403);
    expect((await asGuest("POST", "/w/workspace/opencode/permission/per_2/reply", { reply: "once" })).status).toBe(403);
    expect(engine.seen).not.toContain("GET /file/content");
    expect(engine.seen.filter((line) => line.includes(OTHER))).toEqual([]);

    const audit = await readAuditEntries(harness.workspace, "workspace", 20);
    expect(audit.some((entry) => entry.action === "message.sent" && entry.summary.includes("Kim Jiwon"))).toBe(true);
  });

  test("the host widens a guest's capabilities, and a revoked or expired token stops working", async () => {
    const { harness, asGuest, tokenId } = await setup();
    expect((await asGuest("POST", "/w/workspace/opencode/permission/per_2/reply", { reply: "once" })).status).toBe(403);
    expect((await harness.host("PATCH", `/tokens/${tokenId}`, { capabilities: ["send", "stop", "approve"] })).status).toBe(200);
    expect((await asGuest("POST", "/w/workspace/opencode/permission/per_2/reply", { reply: "once" })).status).toBe(200);
    expect((await harness.host("PATCH", `/tokens/${tokenId}`, { capabilities: ["fly"] })).status).toBe(400);
    expect((await harness.host("DELETE", `/tokens/${tokenId}`)).status).toBe(200);
    expect((await asGuest("GET", "/profile")).status).toBe(401);

    const expired = await setup({}, { expiresAt: Date.now() - 1 });
    expect((await expired.asGuest("GET", "/profile")).status).toBe(401);
  });

  test("a token bound to an endpoint is refused from any other", async () => {
    const { harness, token } = await setup({ endpointId: "ep_guest" });
    const call = (endpoint?: string) =>
      fetch(`${harness.base}/profile`, { headers: { Authorization: `Bearer ${token}`, ...(endpoint ? { "x-redrob-endpoint-id": endpoint } : {}) } });
    expect((await call()).status).toBe(401);
    expect((await call("ep_other")).status).toBe(401);
    expect((await call("ep_guest")).status).toBe(200);
  });

  test("a guest is never more than a collaborator, and a bad grant is refused", async () => {
    const { harness } = await setup();
    const owner = await harness.host("POST", "/tokens", {
      scope: "owner",
      guest: { workspaceId: "workspace", sessionId: SHARED, participant: guest.participant },
    });
    expect(((await owner.json()) as { scope: string }).scope).toBe("collaborator");
    expect((await harness.host("POST", "/tokens", { scope: "collaborator", guest: { workspaceId: "workspace" } })).status).toBe(400);
  });
});
