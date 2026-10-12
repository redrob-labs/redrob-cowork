import { afterEach, describe, expect, test } from "bun:test";
import { costByAuthor, readCostMessages, type Authorship } from "./cowork-room.js";
import { startRouteTestServer } from "./test-support/route-test-server.js";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
});

const SESSION = "ses_shared0000000000000000";
const park: Omit<Authorship, "messageId"> = { participantId: "par_00000000000000000000000a", displayName: "Park", at: 1 };
const kim: Omit<Authorship, "messageId"> = { participantId: "par_00000000000000000000000b", displayName: "Kim", at: 2 };

describe("cost per author", () => {
  test("an answer is credited to whoever asked, by parentID first", () => {
    const ledger = [
      { ...park, messageId: "msg_u1" },
      { ...kim, messageId: "msg_u2" },
    ];
    const result = costByAuthor(
      [
        { id: "msg_u0", role: "user" },
        { id: "msg_a0", role: "assistant", cost: 0.5 }, // before the room: nobody's
        { id: "msg_u1", role: "user" },
        { id: "msg_a1", role: "assistant", parentId: "msg_u1", cost: 0.1 },
        { id: "msg_u2", role: "user" },
        // Answers Park's message although Kim wrote last: parentID wins over position.
        { id: "msg_a2", role: "assistant", parentId: "msg_u1", cost: 0.2 },
        { id: "msg_a3", role: "assistant", cost: 0.3 },
      ],
      ledger,
    );
    expect(result.total).toBeCloseTo(1.1);
    expect(result.authors.map(({ displayName, cost, messages }) => [displayName, Number(cost.toFixed(2)), messages])).toEqual([
      ["Park", 0.3, 1],
      ["Kim", 0.3, 1],
    ]);
  });

  test("reads the engine's list defensively", () => {
    expect(
      readCostMessages([
        { info: { id: "msg_1", role: "user" } },
        { info: { id: "msg_2", role: "assistant", parentID: "msg_1", cost: 0.25 } },
        { info: { id: "msg_3", role: "assistant", cost: -1 } },
        { info: { role: "user" } },
        "junk",
      ]),
    ).toEqual([
      { id: "msg_1", role: "user" },
      { id: "msg_2", role: "assistant", parentId: "msg_1", cost: 0.25 },
      { id: "msg_3", role: "assistant" },
    ]);
    expect(readCostMessages({ not: "a list" })).toEqual([]);
  });
});

describe("GET /room?costs=1", () => {
  test("adds costs from the engine only when asked", async () => {
    const prompts: string[] = [];
    let listed = 0;
    const engine = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (request.method === "POST" && url.pathname.endsWith("/prompt_async")) {
          prompts.push(((await request.json()) as { messageID: string }).messageID);
          return Response.json(true);
        }
        if (request.method === "GET" && url.pathname === `/session/${SESSION}/message`) {
          listed += 1;
          return Response.json(
            prompts.flatMap((id, index) => [
              { info: { id, role: "user" }, parts: [] },
              { info: { id: `msg_reply${index}`, role: "assistant", parentID: id, cost: 0.01 * (index + 1) }, parts: [] },
            ]),
          );
        }
        return Response.json([]);
      },
    });
    cleanups.push(() => engine.stop(true));
    const harness = await startRouteTestServer();
    cleanups.push(harness.cleanup);
    harness.config.workspaces[0]!.baseUrl = `http://127.0.0.1:${engine.port}`;
    const base = `/workspace/workspace/sessions/${SESSION}/room`;
    expect((await harness.host("POST", base, {})).status).toBe(201);
    const { token } = (await (await harness.host("POST", `${base}/guests`, { participant: kim })).json()) as { token: string };
    await harness.as(token)("POST", `/w/workspace/opencode/session/${SESSION}/prompt_async`, { parts: [{ type: "text", text: "from Kim" }] });
    await harness.owner("POST", `/w/workspace/opencode/session/${SESSION}/prompt_async`, { parts: [{ type: "text", text: "from the host" }] });
    expect(prompts).toHaveLength(2);

    const plain = (await (await harness.owner("GET", base)).json()) as Record<string, unknown>;
    expect(plain.costs).toBeUndefined();
    expect(listed).toBe(0);

    const withCosts = (await (await harness.as(token)("GET", `${base}?costs=1`)).json()) as {
      costs: { total: number; authors: Array<{ displayName: string; cost: number; messages: number }> };
    };
    expect(listed).toBe(1);
    expect(withCosts.costs.total).toBeCloseTo(0.03);
    const byName = Object.fromEntries(withCosts.costs.authors.map((entry) => [entry.displayName, entry]));
    expect(byName.Kim).toMatchObject({ messages: 1 });
    expect(byName.Kim?.cost).toBeCloseTo(0.01);
    expect(Object.values(byName).reduce((sum, entry) => sum + entry.cost, 0)).toBeCloseTo(0.03);
  });
});
