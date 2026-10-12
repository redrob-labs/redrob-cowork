import { afterEach, describe, expect, test } from "bun:test";
import { InviteError, createInvite, decideKnock, inviteInternals, knock, knockFor, pendingKnocks, revokeInvites } from "./cowork-invites.js";
import { registerCoworkRelayRoutes } from "./routes/cowork-relay.js";
import { matchRoute, type RequestContext, type Route } from "./routes/registry.js";
import { startRouteTestServer } from "./test-support/route-test-server.js";
import { loopbackFetch } from "./server-fetch.js";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
  inviteInternals.reset();
});

const ROOM = "room_000000000000000000000001";
const SESSION = "ses_shared0000000000000000";
const deviceA = "a".repeat(64);
const deviceB = "b".repeat(64);
const lee = { participantId: "par_00000000000000000000000a", displayName: "Lee Minji" };
const park = { participantId: "par_00000000000000000000000b", displayName: "Park Jun" };
const grant = { token: "t", tokenId: "tok_1" };

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof InviteError) return error.code;
    throw error;
  }
  return "no error";
}

describe("invites and knocks", () => {
  test("a knock needs this room's invite, and only the hash is kept", () => {
    const { secret, expiresAt } = createInvite(ROOM, 1000);
    expect(expiresAt).toBe(1000 + 24 * 60 * 60 * 1000);
    expect([...inviteInternals.invites.keys()].some((key) => key.includes(secret))).toBe(false);
    expect(codeOf(() => knock({ roomId: ROOM, secret: "wrong", endpointId: deviceA, participant: lee, now: 1000 }))).toBe("invite_invalid");
    expect(codeOf(() => knock({ roomId: "room_000000000000000000000002", secret, endpointId: deviceA, participant: lee, now: 1000 }))).toBe("invite_invalid");
    const entry = knock({ roomId: ROOM, secret, endpointId: deviceA, participant: lee, now: 1000 });
    expect(entry.status).toBe("pending");
  });

  test("an invite expires after a day", () => {
    const { secret } = createInvite(ROOM, 0);
    expect(codeOf(() => knock({ roomId: ROOM, secret, endpointId: deviceA, participant: lee, now: 24 * 60 * 60 * 1000 }))).toBe("invite_invalid");
  });

  test("the same device knocking again gets the same knock", () => {
    const { secret } = createInvite(ROOM);
    const first = knock({ roomId: ROOM, secret, endpointId: deviceA, participant: lee });
    expect(knock({ roomId: ROOM, secret, endpointId: deviceA, participant: lee }).knockId).toBe(first.knockId);
    expect(pendingKnocks(ROOM)).toHaveLength(1);
  });

  test("allowing uses the invite up and turns the others on it away; a denied guest may knock again", () => {
    const { secret } = createInvite(ROOM);
    const a = knock({ roomId: ROOM, secret, endpointId: deviceA, participant: lee });
    decideKnock(a, { allow: false });
    const again = knock({ roomId: ROOM, secret, endpointId: deviceA, participant: lee });
    expect(again.knockId).not.toBe(a.knockId);
    const b = knock({ roomId: ROOM, secret, endpointId: deviceB, participant: park });
    decideKnock(again, { allow: true, grant });
    expect(b.status).toBe("denied");
    expect(codeOf(() => knock({ roomId: ROOM, secret, endpointId: deviceB, participant: park }))).toBe("invite_used");
    // The admitted device retrying is answered with its own allowed knock, not refused.
    expect(knock({ roomId: ROOM, secret, endpointId: deviceA, participant: lee }).status).toBe("allowed");
  });

  test("a knock is visible only to the device that made it", () => {
    const { secret } = createInvite(ROOM);
    const entry = knock({ roomId: ROOM, secret, endpointId: deviceA, participant: lee });
    expect(knockFor(entry.knockId, deviceA)?.knockId).toBe(entry.knockId);
    expect(knockFor(entry.knockId, deviceB)).toBeNull();
  });

  test("revoking invites ends them and turns away whoever is waiting", () => {
    const { secret } = createInvite(ROOM);
    const entry = knock({ roomId: ROOM, secret, endpointId: deviceA, participant: lee });
    revokeInvites(ROOM);
    expect(entry.status).toBe("denied");
    expect(codeOf(() => knock({ roomId: ROOM, secret, endpointId: deviceB, participant: park }))).toBe("invite_invalid");
  });
});

describe("knock routes", () => {
  test("invite, knock through the bridge, allow, and the token works only from that device", async () => {
    const harness = await startRouteTestServer();
    cleanups.push(harness.cleanup);
    const room = `/workspace/workspace/sessions/${SESSION}/room`;
    expect((await harness.owner("POST", room)).status).toBe(201);

    const invited = await harness.owner("POST", `${room}/invites`);
    expect(invited.status).toBe(201);
    const { secret } = (await invited.json()) as { secret: string };

    // What a device on the far side of the bridge sends: no token, its endpoint id set by the host.
    const fromDevice = (endpointId: string | null) => (method: string, path: string, body?: unknown) =>
      loopbackFetch(`${harness.base}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(endpointId ? { "x-redrob-endpoint-id": endpointId } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const a = fromDevice(deviceA);

    const unbridged = await fromDevice(null)("POST", `${room}/knock`, { secret, participant: lee });
    expect(unbridged.status).toBe(400);
    expect(((await unbridged.json()) as { code: string }).code).toBe("knock_needs_bridge");
    expect((await a("POST", `${room}/knock`, { secret: "guess", participant: lee })).status).toBe(403);

    const knocked = await a("POST", `${room}/knock`, { secret, participant: lee });
    expect(knocked.status).toBe(202);
    const { knockId } = (await knocked.json()) as { knockId: string };
    expect(((await (await a("GET", `${room}/knock/${knockId}`)).json()) as { status: string }).status).toBe("pending");
    expect((await fromDevice(deviceB)("GET", `${room}/knock/${knockId}`)).status).toBe(404);

    // Only the host sees who is waiting, and only the host answers.
    const waiting = (await (await harness.owner("GET", `${room}/knocks`)).json()) as { knocks: Array<{ knockId: string; participant: { displayName: string }; endpointId: string }> };
    expect(waiting.knocks).toHaveLength(1);
    expect(waiting.knocks[0]).toMatchObject({ knockId, endpointId: deviceA, participant: { displayName: "Lee Minji" } });
    expect((await harness.collaborator("POST", `${room}/knocks/${knockId}`, { allow: true })).status).toBe(401);
    expect((await harness.owner("POST", `${room}/knocks/${knockId}`, { allow: "yes" })).status).toBe(400);

    const allowed = await harness.owner("POST", `${room}/knocks/${knockId}`, { allow: true, capabilities: ["send"] });
    expect(allowed.status).toBe(200);
    expect((await harness.owner("POST", `${room}/knocks/${knockId}`, { allow: true })).status).toBe(409);

    const answer = (await (await a("GET", `${room}/knock/${knockId}`)).json()) as { status: string; token: string };
    expect(answer.status).toBe("allowed");
    expect(answer.token).toBeTruthy();

    const withToken = (endpointId: string | null) =>
      loopbackFetch(`${harness.base}${room}`, {
        headers: { Authorization: `Bearer ${answer.token}`, ...(endpointId ? { "x-redrob-endpoint-id": endpointId } : {}) },
      });
    const joined = await withToken(deviceA);
    expect(joined.status).toBe(200);
    const view = (await joined.json()) as { participants: Array<{ displayName: string; role: string; capabilities?: string[] }> };
    expect(view.participants.find((entry) => entry.role === "guest")).toMatchObject({ displayName: "Lee Minji", capabilities: ["send"] });
    expect((await withToken(deviceB)).status).toBe(401);
    expect((await withToken(null)).status).toBe(401);

    // Single use: another device with the same invite is refused.
    const late = await fromDevice(deviceB)("POST", `${room}/knock`, { secret, participant: park });
    expect(late.status).toBe(409);
    expect(((await late.json()) as { code: string }).code).toBe("invite_used");

    // Guests cannot hand out invites.
    const guestInvite = await loopbackFetch(`${harness.base}${room}/invites`, {
      method: "POST",
      headers: { Authorization: `Bearer ${answer.token}`, "x-redrob-endpoint-id": deviceA },
    });
    expect(guestInvite.status).toBe(401);

    // Ending the room forgets its invites.
    const second = (await (await harness.owner("POST", `${room}/invites`)).json()) as { secret: string };
    expect((await harness.owner("DELETE", room)).status).toBe(200);
    expect((await harness.owner("POST", room)).status).toBe(201);
    expect((await a("POST", `${room}/knock`, { secret: second.secret, participant: lee })).status).toBe(403);
  });

  test("a denied knock says so, and no token is issued", async () => {
    const harness = await startRouteTestServer();
    cleanups.push(harness.cleanup);
    const room = `/workspace/workspace/sessions/${SESSION}/room`;
    await harness.owner("POST", room);
    const { secret } = (await (await harness.owner("POST", `${room}/invites`)).json()) as { secret: string };
    const headers = { "Content-Type": "application/json", "x-redrob-endpoint-id": deviceA };
    const knocked = await loopbackFetch(`${harness.base}${room}/knock`, { method: "POST", headers, body: JSON.stringify({ secret, participant: lee }) });
    const { knockId } = (await knocked.json()) as { knockId: string };
    expect((await harness.owner("POST", `${room}/knocks/${knockId}`, { allow: false })).status).toBe(200);
    const answer = (await (await loopbackFetch(`${harness.base}${room}/knock/${knockId}`, { headers })).json()) as Record<string, unknown>;
    expect(answer).toEqual({ status: "denied" });
    const view = (await (await harness.owner("GET", room)).json()) as { participants: Array<{ role: string }> };
    expect(view.participants.filter((entry) => entry.role === "guest")).toHaveLength(0);
  });
});

describe("relay grant", () => {
  function relayRoute(options: { key: string | null; answer?: (request: Request) => Response | Promise<Response>; fail?: boolean }) {
    const routes: Route[] = [];
    const calls: Array<{ url: string; auth: string | null; body: unknown }> = [];
    registerCoworkRelayRoutes({
      routes,
      jsonResponse: (data, status = 200) => Response.json(data, { status }),
      readJsonBody: async (request) => (await request.json()) as Record<string, unknown>,
      readKey: async () => options.key,
      consoleBaseUrl: () => "https://console.test/api/backend/v1",
      fetchImpl: async (input, init) => {
        if (options.fail) throw new Error("offline");
        const request = new Request(input, init);
        calls.push({ url: input, auth: request.headers.get("authorization"), body: await request.clone().json() });
        return options.answer ? options.answer(request) : Response.json({});
      },
    });
    const call = async (body: unknown) => {
      const route = matchRoute(routes, "POST", "/cowork/relay-grant");
      if (!route) throw new Error("route missing");
      const request = new Request("http://127.0.0.1/cowork/relay-grant", { method: "POST", body: JSON.stringify(body) });
      const ctx: Pick<RequestContext, "request" | "params"> = { request, params: route.params };
      try {
        const response = await route.handler(ctx as RequestContext);
        return { status: response.status, body: (await response.json()) as Record<string, unknown> };
      } catch (error) {
        const failure = error as { status: number; code: string };
        return { status: failure.status, body: { code: failure.code } };
      }
    };
    return { call, calls, route: routes[0] };
  }

  test("is host-only, and asks the console with the device key", async () => {
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    const relay = relayRoute({
      key: "rk-device",
      answer: () => Response.json({ endpointId: deviceA, expiresAt, relays: ["https://relay-apne2.redrob.ai", "http://plain.example", 7] }),
    });
    expect(relay.route?.auth).toBe("host");
    const result = await relay.call({ endpointId: deviceA.toUpperCase() });
    expect(result).toEqual({ status: 200, body: { endpointId: deviceA, expiresAt, relays: ["https://relay-apne2.redrob.ai"] } });
    expect(relay.calls).toEqual([{ url: "https://console.test/api/backend/v1/relay/grants", auth: "Bearer rk-device", body: { endpointId: deviceA } }]);
  });

  test("says why when it cannot get one", async () => {
    expect((await relayRoute({ key: "k" }).call({ endpointId: "nope" })).body.code).toBe("invalid_payload");
    expect((await relayRoute({ key: null }).call({ endpointId: deviceA })).body.code).toBe("redrob_key_missing");
    expect((await relayRoute({ key: "k", answer: () => new Response("", { status: 401 }) }).call({ endpointId: deviceA })).body.code).toBe("redrob_key_rejected");
    expect((await relayRoute({ key: "k", fail: true }).call({ endpointId: deviceA })).body.code).toBe("relay_grant_unreachable");
    const wrongDevice = relayRoute({ key: "k", answer: () => Response.json({ endpointId: deviceB, expiresAt: new Date().toISOString(), relays: [] }) });
    expect((await wrongDevice.call({ endpointId: deviceA })).body.code).toBe("relay_grant_failed");
  });
});
