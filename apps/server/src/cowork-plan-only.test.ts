import { afterEach, describe, expect, test } from "bun:test";
import { queueInternals } from "./cowork-queue.js";
import { planOnlyBody } from "./guest-access.js";
import { startRouteTestServer } from "./test-support/route-test-server.js";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
  queueInternals.queues.clear();
  for (const timer of queueInternals.drains.values()) clearInterval(timer);
  queueInternals.drains.clear();
});

const SESSION = "ses_shared0000000000000000";
const kim = { participantId: "par_000000000000000000000009", displayName: "Kim Jiwon" };
const lee = { participantId: "par_00000000000000000000000c", displayName: "Lee Minji" };
const grant = { workspaceId: "w", sessionId: "s", participant: kim, capabilities: ["send" as const] };

describe("plan-only body", () => {
  test("only a plan-only guest's turn is moved to the Plan agent", () => {
    expect(planOnlyBody({ ...grant, planOnly: true }, { agent: "redrob-run", parts: [] }, "redrob-plan")).toEqual({ agent: "redrob-plan", parts: [] });
    expect(planOnlyBody(grant, { agent: "redrob-run" }, "redrob-plan")).toBeNull();
    expect(planOnlyBody(undefined, { agent: "redrob-run" }, "redrob-plan")).toBeNull();
    expect(() => planOnlyBody({ ...grant, planOnly: true }, "junk", "redrob-plan")).toThrow();
  });
});

describe("plan-only guests in a room", () => {
  test("their turns run in Plan, they cannot run commands, and the host can lift it", async () => {
    const prompts: Array<{ path: string; body: Record<string, unknown> }> = [];
    const engine = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (request.method === "POST" && /\/(prompt_async|message|command)$/.test(url.pathname)) {
          prompts.push({ path: url.pathname, body: (await request.json()) as Record<string, unknown> });
          return Response.json(true);
        }
        // Busy, so the shared queue holds what it is given.
        if (url.pathname === "/session/status") return Response.json({ [SESSION]: { type: "busy" } });
        return Response.json([]);
      },
    });
    cleanups.push(() => engine.stop(true));
    const harness = await startRouteTestServer();
    cleanups.push(harness.cleanup);
    harness.config.workspaces[0]!.baseUrl = `http://127.0.0.1:${engine.port}`;
    const base = `/workspace/workspace/sessions/${SESSION}/room`;
    expect((await harness.host("POST", base, {})).status).toBe(201);

    expect((await harness.host("POST", `${base}/guests`, { participant: kim, planOnly: "yes" })).status).toBe(400);
    const planned = (await (await harness.host("POST", `${base}/guests`, { participant: kim, planOnly: true })).json()) as { token: string; tokenId: string };
    const free = (await (await harness.host("POST", `${base}/guests`, { participant: lee })).json()) as { token: string };
    const asKim = harness.as(planned.token);
    const asLee = harness.as(free.token);
    const prompt = `/w/workspace/opencode/session/${SESSION}/prompt_async`;

    expect((await asKim("POST", prompt, { agent: "redrob-run", parts: [{ type: "text", text: "do it" }] })).status).toBe(200);
    expect((await asKim("POST", prompt, { parts: [{ type: "text", text: "no agent named" }] })).status).toBe(200);
    expect((await asLee("POST", prompt, { agent: "redrob-run", parts: [{ type: "text", text: "do it" }] })).status).toBe(200);
    expect(prompts.map((entry) => entry.body.agent)).toEqual(["redrob-plan", "redrob-plan", "redrob-run"]);
    // Authorship still works on the rewritten turn.
    expect(prompts.every((entry) => typeof entry.body.messageID === "string")).toBe(true);

    const command = await asKim("POST", `/w/workspace/opencode/session/${SESSION}/command`, { command: "init", arguments: "" });
    expect(command.status).toBe(403);
    expect(((await command.json()) as { code: string }).code).toBe("guest_plan_only");
    expect((await asLee("POST", `/w/workspace/opencode/session/${SESSION}/command`, { command: "init", arguments: "" })).status).toBe(200);

    // The shared queue fixes the agent when the message is queued, since the server sends it later.
    expect((await asKim("POST", `${base}/queue`, { body: { agent: "redrob-run", parts: [{ type: "text", text: "later" }] } })).status).toBe(201);
    const [roomId] = [...queueInternals.queues.keys()];
    expect(queueInternals.queues.get(roomId!)?.[0]?.body.agent).toBe("redrob-plan");

    // The host sees it, and lifts it.
    const view = (await (await harness.owner("GET", base)).json()) as { participants: Array<{ displayName: string; planOnly?: boolean }> };
    expect(view.participants.find((entry) => entry.displayName === "Kim Jiwon")?.planOnly).toBe(true);
    expect(view.participants.find((entry) => entry.displayName === "Lee Minji")?.planOnly).toBe(false);
    expect((await harness.host("PATCH", `${base}/guests/${planned.tokenId}`, {})).status).toBe(400);
    const lifted = await harness.host("PATCH", `${base}/guests/${planned.tokenId}`, { planOnly: false });
    expect(await lifted.json()).toEqual({ ok: true, capabilities: ["send", "stop"], planOnly: false });
    expect((await asKim("POST", prompt, { agent: "redrob-run", parts: [{ type: "text", text: "now run" }] })).status).toBe(200);
    expect(prompts.at(-1)?.body.agent).toBe("redrob-run");
    // And sets it again, keeping the capabilities.
    expect(await (await harness.host("PATCH", `${base}/guests/${planned.tokenId}`, { planOnly: true })).json()).toEqual({
      ok: true,
      capabilities: ["send", "stop"],
      planOnly: true,
    });
  });
});
