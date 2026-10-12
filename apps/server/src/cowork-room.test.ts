import { afterEach, describe, expect, test } from "bun:test";
import { PRESENCE_TTL_MS, presentIn, roomInternals, touchPresence, withServerMessageId } from "./cowork-room.js";
import { isEngineId } from "./engine-ids.js";
import { startRouteTestServer } from "./test-support/route-test-server.js";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
});

const SESSION = "ses_shared0000000000000000";
const kim = { participantId: "par_000000000000000000000009", displayName: "Kim Jiwon" };

describe("room pieces", () => {
  test("the server picks the message id unless the caller gave a valid one", () => {
    const minted = withServerMessageId({ parts: [] }, () => "msg_0000000000aaAAAAAAAAAAAAAA");
    expect(minted?.messageId).toBe("msg_0000000000aaAAAAAAAAAAAAAA");
    expect(minted?.body.messageID).toBe(minted?.messageId);
    const given = withServerMessageId({ messageID: "msg_11c9035f5001B7YIkut7V4Uo5W" }, () => "msg_x");
    expect(given?.messageId).toBe("msg_11c9035f5001B7YIkut7V4Uo5W");
    const bogus = withServerMessageId({ messageID: "msg_someone_elses" }, () => "msg_0000000000aaAAAAAAAAAAAAAA");
    expect(bogus?.messageId).toBe("msg_0000000000aaAAAAAAAAAAAAAA");
    expect(withServerMessageId("nope", () => "x")).toBeNull();
  });

  test("presence expires, and only changes are news", () => {
    const room = "room_000000000000000000000001";
    expect(touchPresence(room, { ...kim, role: "guest" }, {}, 1000).changed).toBe(true);
    expect(touchPresence(room, { ...kim, role: "guest" }, {}, 2000).changed).toBe(false);
    expect(touchPresence(room, { ...kim, role: "guest" }, { typing: true }, 3000).changed).toBe(true);
    expect(presentIn(room, 3000)).toHaveLength(1);
    expect(presentIn(room, 3000 + PRESENCE_TTL_MS + 1)).toHaveLength(0);
    roomInternals.presence.delete(room);
  });
});

/** A stand-in engine that records prompt bodies. */
function fakeEngine() {
  const prompts: Array<{ path: string; body: Record<string, unknown> }> = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "POST" && /\/(prompt_async|command)$/.test(url.pathname)) {
        prompts.push({ path: url.pathname, body: (await request.json()) as Record<string, unknown> });
        return Response.json(true);
      }
      return Response.json([]);
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, prompts, stop: () => server.stop(true) };
}

async function readEvents(response: Response, until: (events: Array<{ type: string } & Record<string, unknown>>) => boolean, timeoutMs = 3000) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ type: string } & Record<string, unknown>> = [];
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !until(events)) {
    const next = await Promise.race([reader.read(), new Promise<{ done: true; value: undefined }>((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), 200))]);
    if (next.value) buffer += decoder.decode(next.value, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index !== -1) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const data = block.split("\n").find((line) => line.startsWith("data: "));
      if (data) events.push(JSON.parse(data.slice(6)));
      index = buffer.indexOf("\n\n");
    }
    if (next.done && !next.value) continue;
  }
  await reader.cancel().catch(() => undefined);
  return events;
}

describe("live rooms on the server", () => {
  async function setup() {
    const engine = fakeEngine();
    cleanups.push(engine.stop);
    const harness = await startRouteTestServer();
    cleanups.push(harness.cleanup);
    harness.config.workspaces[0]!.baseUrl = engine.url;
    harness.config.workspaces[0]!.directory = harness.workspace;
    await harness.host("PUT", "/profile", { displayName: "Park Hyunjin" });
    const base = `/workspace/workspace/sessions/${SESSION}/room`;
    return { harness, engine, base };
  }

  test("outside a room, prompts go through untouched", async () => {
    const { harness, engine } = await setup();
    await harness.collaborator("POST", `/w/workspace/opencode/session/${SESSION}/prompt_async`, { parts: [{ type: "text", text: "hi" }] });
    expect(engine.prompts[0]?.body.messageID).toBeUndefined();
  });

  test("open, join, presence, authored messages for host and guest, review news, remove, end", async () => {
    const { harness, engine, base } = await setup();
    expect(((await (await harness.collaborator("GET", base)).json()) as { room: unknown }).room).toBeNull();
    expect((await harness.collaborator("POST", base, {})).status).toBe(401);
    const opened = await harness.host("POST", base, {});
    expect(opened.status).toBe(201);
    const { room } = (await opened.json()) as { room: { roomId: string; host: { displayName: string } } };
    expect(room.host.displayName).toBe("Park Hyunjin");
    expect((((await (await harness.host("POST", base, {})).json()) as { room: { roomId: string } }).room.roomId)).toBe(room.roomId);

    const joined = await harness.host("POST", `${base}/guests`, { participant: kim });
    expect(joined.status).toBe(201);
    const { token, tokenId } = (await joined.json()) as { token: string; tokenId: string };
    const asGuest = harness.as(token);

    const events = await fetch(`${harness.base}${base}/events`, { headers: { Authorization: `Bearer ${token}` } });
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    const reading = readEvents(events, (seen) => seen.some((event) => event.type === "room.authorship") && seen.some((event) => event.type === "review.updated"));

    expect((await asGuest("POST", `${base}/heartbeat`, { typing: true })).status).toBe(200);
    expect((await asGuest("POST", `/w/workspace/opencode/session/${SESSION}/prompt_async`, { parts: [{ type: "text", text: "from Kim" }] })).status).toBe(200);
    await harness.collaborator("POST", `/w/workspace/opencode/session/${SESSION}/prompt_async`, { parts: [{ type: "text", text: "from Park" }] });
    await asGuest("POST", `/workspace/workspace/sessions/${SESSION}/review/comments`, { anchor: { kind: "message", messageId: "msg_1" }, text: "Looks right" });
    const seen = await reading;
    expect(seen.map((event) => event.type)).toContain("room.presence");

    expect(engine.prompts).toHaveLength(2);
    const [fromKim, fromPark] = engine.prompts;
    expect(isEngineId(fromKim?.body.messageID, "msg")).toBe(true);
    expect(isEngineId(fromPark?.body.messageID, "msg")).toBe(true);

    const state = (await (await asGuest("GET", base)).json()) as {
      me: { displayName: string };
      participants: Array<{ displayName: string; role: string; present: boolean; tokenId?: string }>;
      authorship: Array<{ messageId: string; displayName: string }>;
    };
    expect(state.me.displayName).toBe("Kim Jiwon");
    expect(state.participants.map((participant) => [participant.displayName, participant.role])).toEqual([
      ["Park Hyunjin", "host"],
      ["Kim Jiwon", "guest"],
    ]);
    expect(state.participants.find((participant) => participant.role === "guest")?.present).toBe(true);
    expect(state.participants.some((participant) => participant.tokenId)).toBe(false);
    expect(state.authorship).toEqual([
      expect.objectContaining({ messageId: fromKim?.body.messageID, displayName: "Kim Jiwon" }),
      expect.objectContaining({ messageId: fromPark?.body.messageID, displayName: "Park Hyunjin" }),
    ]);
    const hostView = (await (await harness.owner("GET", base)).json()) as { participants: Array<{ tokenId?: string }> };
    expect(hostView.participants.some((participant) => participant.tokenId === tokenId)).toBe(true);

    // Guests cannot add guests or end the room.
    expect((await asGuest("POST", `${base}/guests`, { participant: kim })).status).toBe(401);
    expect((await asGuest("DELETE", base)).status).toBe(401);

    expect((await harness.host("PATCH", `${base}/guests/${tokenId}`, { capabilities: ["send"] })).status).toBe(200);
    expect((await asGuest("POST", `/w/workspace/opencode/session/${SESSION}/abort`, {})).status).toBe(403);
    expect((await harness.host("DELETE", `${base}/guests/${tokenId}`)).status).toBe(200);
    expect((await asGuest("GET", base)).status).toBe(401);

    const second = (await (await harness.host("POST", `${base}/guests`, { participant: { ...kim, participantId: "par_00000000000000000000000a" } })).json()) as { token: string };
    expect((await harness.host("DELETE", base)).status).toBe(200);
    expect((await harness.as(second.token)("GET", base)).status).toBe(401);
    expect(((await (await harness.collaborator("GET", base)).json()) as { room: unknown }).room).toBeNull();
  });
});
