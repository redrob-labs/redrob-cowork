import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ServerConfig } from "../types.js";
import { externalIdOf, labelSession, type LabeledSession } from "./labeler.js";
import { InsightsOutbox } from "./outbox.js";
import { syncInsights } from "./sync.js";

const dirs: string[] = [];
let config: ServerConfig;
const saved = { data: process.env.REDROB_DATA_DIR, db: process.env.REDROB_RUNTIME_DB };

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), "redrob-insights-sync-"));
  dirs.push(dir);
  process.env.REDROB_DATA_DIR = dir;
  process.env.REDROB_RUNTIME_DB = join(dir, "runtime.sqlite");
  config = {
    host: "127.0.0.1", port: 0, token: "t", hostToken: "h", configPath: join(dir, "config.json"),
    approval: { mode: "auto", timeoutMs: 1000 }, corsOrigins: [], workspaces: [], authorizedRoots: [], readOnly: false,
    startedAt: 0, tokenSource: "generated", hostTokenSource: "generated", logFormat: "pretty", logRequests: false,
  };
});
afterEach(async () => {
  process.env.REDROB_DATA_DIR = saved.data;
  process.env.REDROB_RUNTIME_DB = saved.db;
  while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
});

const session = (id: string): LabeledSession =>
  labelSession({
    rootSessionID: id, startedAt: 0, lastActivityAt: 0, userTurns: 1, firstAttachedSource: false, assistantMessages: 1,
    toolCalls: 0, artifacts: 0, checks: 0, sends: 0, delegations: 0, peakConcurrentAgents: 0, subagentMinutes: 0,
    busyMinutes: 0, attentionMinutes: 0, permissionsAsked: 0, permissionsAlways: 0, aborted: 0, redirected: 0,
    sensitiveSends: 0, unmaskedSends: 0,
  });

type Call = { url: string; auth: string | null; body: { sessions: LabeledSession[] } };

function console_(answer: (body: Call["body"]) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Call["body"];
    calls.push({ url, auth: new Headers(init?.headers).get("authorization"), body });
    return answer(body);
  };
  return { calls, fetchImpl };
}

describe("insights sync", () => {
  test("sends the outbox with the person's key, then removes what the console answered for", async () => {
    const outbox = new InsightsOutbox(config);
    await outbox.add(session("a"));
    await outbox.add(session("b"));
    const fake = console_((body) =>
      Response.json({ accepted: 1, updated: 0, rejected: [{ externalId: body.sessions[1]?.externalId, reason: "old" }] }),
    );
    const outcome = await syncInsights(outbox, { readKey: async () => "rrk_test", fetchImpl: fake.fetchImpl, baseUrl: "https://console.test/v1/" });
    expect(outcome).toEqual({ status: "sent", accepted: 1, updated: 0, rejected: 1 });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.url).toBe("https://console.test/v1/insights/sessions");
    expect(fake.calls[0]?.auth).toBe("Bearer rrk_test");
    expect(fake.calls[0]?.body.sessions.map((s) => s.externalId)).toEqual([externalIdOf("a"), externalIdOf("b")]);
    expect(await outbox.list()).toEqual([]);
  });

  test("what is sent is exactly the outbox, labels only", async () => {
    const outbox = new InsightsOutbox(config);
    await outbox.add(session("a"));
    const fake = console_(() => Response.json({ accepted: 1, updated: 0, rejected: [] }));
    await syncInsights(outbox, { readKey: async () => "k", fetchImpl: fake.fetchImpl, baseUrl: "https://c" });
    expect(Object.keys(fake.calls[0]?.body ?? {})).toEqual(["sessions"]);
    expect(fake.calls[0]?.body.sessions[0]).toEqual(session("a"));
  });

  test("with no key, nothing is sent and nothing is lost", async () => {
    const outbox = new InsightsOutbox(config);
    await outbox.add(session("a"));
    const fake = console_(() => Response.json({}));
    expect(await syncInsights(outbox, { readKey: async () => null, fetchImpl: fake.fetchImpl })).toEqual({ status: "no-key" });
    expect(fake.calls).toHaveLength(0);
    expect(await outbox.list()).toHaveLength(1);
  });

  test("a refused key or an unreachable console keeps everything for the next run", async () => {
    const outbox = new InsightsOutbox(config);
    await outbox.add(session("a"));
    const refused = console_(() => new Response("{}", { status: 401 }));
    expect(await syncInsights(outbox, { readKey: async () => "k", fetchImpl: refused.fetchImpl, baseUrl: "https://c" })).toEqual({
      status: "refused",
      code: 401,
    });
    const down = async () => {
      throw new Error("ECONNREFUSED");
    };
    expect(await syncInsights(outbox, { readKey: async () => "k", fetchImpl: down, baseUrl: "https://c" })).toEqual({ status: "unreachable" });
    expect(await outbox.list()).toHaveLength(1);
  });

  test("large outboxes go in batches of 500, each removed once answered", async () => {
    const outbox = new InsightsOutbox(config);
    for (let i = 0; i < 1_100; i += 1) await outbox.add(session(`s${i}`), i);
    const fake = console_((body) => Response.json({ accepted: body.sessions.length, updated: 0, rejected: [] }));
    const outcome = await syncInsights(outbox, { readKey: async () => "k", fetchImpl: fake.fetchImpl, baseUrl: "https://c" });
    expect(fake.calls.map((c) => c.body.sessions.length)).toEqual([500, 500, 100]);
    expect(outcome).toEqual({ status: "sent", accepted: 1_100, updated: 0, rejected: 0 });
    expect(await outbox.list()).toHaveLength(0);
  });

  test("an empty outbox makes no request", async () => {
    const fake = console_(() => Response.json({}));
    expect(await syncInsights(new InsightsOutbox(config), { readKey: async () => "k", fetchImpl: fake.fetchImpl })).toEqual({
      status: "nothing",
    });
    expect(fake.calls).toHaveLength(0);
  });
});
