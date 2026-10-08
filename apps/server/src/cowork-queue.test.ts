import { afterEach, describe, expect, test } from "bun:test";
import {
  QueueError,
  claimAsk,
  drainOnce,
  editQueued,
  enqueue,
  promptPreview,
  queueInternals,
  queueView,
  releaseAsk,
  removeQueued,
} from "./cowork-queue.js";
import { isEngineId } from "./engine-ids.js";
import { startRouteTestServer } from "./test-support/route-test-server.js";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
  queueInternals.queues.clear();
  queueInternals.answered.clear();
  for (const timer of queueInternals.drains.values()) clearInterval(timer);
  queueInternals.drains.clear();
});

const SESSION = "ses_shared0000000000000000";
const kim = { participantId: "par_000000000000000000000009", displayName: "Kim Jiwon" };
const park = { participantId: "par_00000000000000000000000a", displayName: "Park Hyunjin" };
const text = (value: string) => ({ parts: [{ type: "text", text: value }] });

describe("the queue", () => {
  test("keeps order and authors, drops a caller's message id, and refuses an empty message", () => {
    const room = "room_q1";
    enqueue(room, kim, { ...text("first"), messageID: "msg_mine" });
    enqueue(room, park, text("second"));
    expect(queueView(room).map((item) => [item.author.displayName, item.preview])).toEqual([
      ["Kim Jiwon", "first"],
      ["Park Hyunjin", "second"],
    ]);
    expect(queueInternals.queues.get(room)?.[0]?.body.messageID).toBeUndefined();
    expect(() => enqueue(room, kim, { parts: [] })).toThrow(QueueError);
    expect(promptPreview({ parts: [{ type: "file" }, { type: "text", text: " hi " }] })).toBe("hi");
  });

  test("only the author or the host edits or removes a waiting message", () => {
    const room = "room_q2";
    const item = enqueue(room, kim, text("draft"));
    expect(() => editQueued(room, item.id, "changed", park, false)).toThrow(QueueError);
    expect(editQueued(room, item.id, "changed", kim, false).preview).toBe("changed");
    expect(() => removeQueued(room, item.id, park, false)).toThrow(QueueError);
    removeQueued(room, item.id, park, true);
    expect(queueView(room)).toEqual([]);
  });

  test("drains one at a time, only when idle, and puts back a failed send", async () => {
    const room = "room_q3";
    enqueue(room, kim, text("a"));
    enqueue(room, park, text("b"));
    const sent: string[] = [];
    let busy = true;
    let fail = false;
    const engine = {
      busy: async () => busy,
      send: async (_body: Record<string, unknown>, item: { preview: string }) => {
        if (fail) throw new Error("refused");
        sent.push(item.preview);
      },
    };
    expect(await drainOnce(room, engine)).toBeNull();
    busy = false;
    fail = true;
    await expect(drainOnce(room, engine)).rejects.toThrow("refused");
    expect(queueView(room).map((item) => item.preview)).toEqual(["a", "b"]);
    fail = false;
    expect((await drainOnce(room, engine))?.preview).toBe("a");
    expect((await drainOnce(room, engine))?.preview).toBe("b");
    expect(await drainOnce(room, engine)).toBeNull();
    expect(sent).toEqual(["a", "b"]);
  });

  test("the first answer to an ask wins until the engine refuses it", () => {
    expect(claimAsk("per_1", kim)).toEqual({ ok: true });
    expect(claimAsk("per_1", park)).toEqual({ ok: false, by: kim });
    releaseAsk("per_1");
    expect(claimAsk("per_1", park)).toEqual({ ok: true });
  });
});

/** A stand-in engine with a status the test controls, pending asks in two chats, and recorded posts. */
function fakeEngine() {
  const posts: Array<{ path: string; body: Record<string, unknown> }> = [];
  const state = { busy: true };
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/session/status") return Response.json(state.busy ? { [SESSION]: { type: "busy" } } : {});
      if (url.pathname === "/permission") {
        return Response.json([
          { id: "per_shared", sessionID: SESSION },
          { id: "per_other", sessionID: "ses_other00000000000000000" },
        ]);
      }
      if (request.method === "POST") {
        posts.push({ path: url.pathname, body: (await request.json().catch(() => ({}))) as Record<string, unknown> });
        return Response.json(true);
      }
      return Response.json([]);
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, posts, state, stop: () => server.stop(true) };
}

describe("queue and asks on the server", () => {
  async function setup() {
    const engine = fakeEngine();
    cleanups.push(engine.stop);
    const harness = await startRouteTestServer();
    cleanups.push(harness.cleanup);
    harness.config.workspaces[0]!.baseUrl = engine.url;
    harness.config.workspaces[0]!.directory = harness.workspace;
    await harness.host("PUT", "/profile", { displayName: "Park Hyunjin" });
    const base = `/workspace/workspace/sessions/${SESSION}/room`;
    await harness.host("POST", base, {});
    const guest = async (capabilities: string[], participant = kim) => {
      const joined = (await (await harness.host("POST", `${base}/guests`, { participant, capabilities })).json()) as { token: string };
      return harness.as(joined.token);
    };
    return { harness, engine, base, guest };
  }

  test("messages wait while the agent works, then go in order under their authors", async () => {
    const { harness, engine, base, guest } = await setup();
    const kimGuest = await guest(["send", "stop"]);
    const readOnly = await guest([], { participantId: "par_00000000000000000000000b", displayName: "Lee" });
    expect((await kimGuest("POST", `${base}/queue`, { body: text("Kim's question") })).status).toBe(201);
    expect((await harness.collaborator("POST", `${base}/queue`, { body: text("Park's question") })).status).toBe(201);
    expect((await readOnly("POST", `${base}/queue`, { body: text("not allowed") })).status).toBe(403);
    const waiting = (await (await kimGuest("GET", `${base}/queue`)).json()) as { queue: Array<{ preview: string }> };
    expect(waiting.queue.map((item) => item.preview)).toEqual(["Kim's question", "Park's question"]);
    expect(engine.posts).toHaveLength(0);

    engine.state.busy = false;
    const deadline = Date.now() + 8000;
    while (engine.posts.length < 2 && Date.now() < deadline) await Bun.sleep(100);
    expect(engine.posts.map((post) => (post.body.parts as Array<{ text: string }>)[0]?.text)).toEqual(["Kim's question", "Park's question"]);
    for (const post of engine.posts) expect(isEngineId(post.body.messageID, "msg")).toBe(true);

    const room = (await (await harness.collaborator("GET", base)).json()) as { authorship: Array<{ messageId: string; displayName: string }> };
    expect(room.authorship.map((entry) => entry.displayName)).toEqual(["Kim Jiwon", "Park Hyunjin"]);
    expect(room.authorship[0]?.messageId).toBe(engine.posts[0]?.body.messageID as string);
  });

  test("one answer per ask; a guest answers only the shared chat's asks, and only with approve", async () => {
    const { harness, base, guest } = await setup();
    const approver = await guest(["send", "approve"]);
    const sender = await guest(["send"], { participantId: "par_00000000000000000000000b", displayName: "Lee" });
    expect((await sender("POST", "/w/workspace/opencode/permission/per_shared/reply", { reply: "once" })).status).toBe(403);
    expect((await approver("POST", "/w/workspace/opencode/permission/per_other/reply", { reply: "once" })).status).toBe(403);
    expect((await approver("POST", "/w/workspace/opencode/permission/per_gone/reply", { reply: "once" })).status).toBe(404);
    expect((await approver("POST", "/w/workspace/opencode/permission/per_shared/reply", { reply: "once" })).status).toBe(200);
    const second = await harness.collaborator("POST", "/w/workspace/opencode/permission/per_shared/reply", { reply: "reject" });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { code: string; details: { by: { displayName: string } } };
    expect(body.code).toBe("already_answered");
    expect(body.details.by.displayName).toBe("Kim Jiwon");
    void base;
  });
});
