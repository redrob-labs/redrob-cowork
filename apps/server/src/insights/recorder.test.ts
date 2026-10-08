import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RedrobWorkInsightsRecorder } from "../opencode-plugins/redrob-insights-recorder.js";
import { DetectorSource } from "../privacy/detector-source.js";
import { PrivacyGate, type SensitivityReport } from "../privacy/gate.js";
import type { ServerConfig } from "../types.js";
import { factsOf, parseFact, toolEffect, type Fact } from "./facts.js";
import { externalIdOf, labelSession, modeOf, type LabeledSession, type SessionTally } from "./labeler.js";
import { InsightsOutbox, OUTBOX_LIMIT } from "./outbox.js";
import { InsightsRecorder } from "./recorder.js";

const SECRET = "Refund 4,500,000 KRW to 김지원 at jiwon@acme.test";
const MINUTE = 60_000;

/** Engine events, shaped as the bus sends them, with text in every place text can be. */
const ev = {
  created: (id: string, parentID?: string) => ({ type: "session.created", properties: { info: { id, parentID, title: SECRET } } }),
  user: (sessionID: string, id: string, created: number) => ({
    type: "message.updated",
    properties: { info: { id, sessionID, role: "user", time: { created }, summary: { title: SECRET } } },
  }),
  answer: (sessionID: string, id: string, completed: number) => ({
    type: "message.updated",
    properties: { info: { id, sessionID, role: "assistant", time: { created: completed - 1000, completed } } },
  }),
  file: (sessionID: string, messageID: string) => ({
    type: "message.part.updated",
    properties: { part: { id: "p", sessionID, messageID, type: "file", filename: "contract.pdf", url: `data:text/plain,${SECRET}` } },
  }),
  tool: (sessionID: string, callID: string, tool: string, status: string, input: unknown = {}) => ({
    type: "message.part.updated",
    properties: { part: { id: callID, callID, sessionID, messageID: "m", type: "tool", tool, state: { status, input, output: SECRET } } },
  }),
  busy: (sessionID: string, busy: boolean) => ({ type: "session.status", properties: { sessionID, status: { type: busy ? "busy" : "idle" } } }),
  abort: (sessionID: string) => ({ type: "session.error", properties: { sessionID, error: { name: "MessageAbortedError", data: { message: SECRET } } } }),
  idle: (sessionID: string) => ({ type: "session.idle", properties: { sessionID } }),
  text: (sessionID: string, messageID = "m", text = SECRET, synthetic = false) => ({
    type: "message.part.updated",
    properties: { part: { id: "t", sessionID, messageID, type: "text", text, synthetic } },
  }),
};

/** Runs events through the plugin-side reduction and the server-side guard, as in production. */
function play(recorder: InsightsRecorder, events: Array<[number, unknown]>) {
  for (const [at, event] of events) {
    const fact = factsOf(event, at);
    const received = fact ? parseFact(JSON.parse(JSON.stringify(fact))) : null;
    if (received) recorder.observe(received);
  }
}

async function finish(events: Array<[number, unknown]>): Promise<LabeledSession[]> {
  const out: LabeledSession[] = [];
  const recorder = new InsightsRecorder((s) => void out.push(s), 15 * MINUTE);
  play(recorder, events);
  await recorder.sweep(Date.now() + 365 * 24 * 60 * MINUTE);
  return out;
}

describe("facts carry no text", () => {
  test("no event reduces to anything that contains what was written", () => {
    const events = [
      ev.created("s"), ev.user("s", "m1", 1), ev.answer("s", "a1", 2), ev.file("s", "m1"), ev.text("s"),
      ev.tool("s", "c1", "bash", "completed", { command: `echo "${SECRET}"` }), ev.abort("s"), ev.idle("s"),
    ];
    for (const event of events) {
      const fact = factsOf(event, 0);
      expect(JSON.stringify(fact ?? {})).not.toContain("김지원");
      expect(JSON.stringify(fact ?? {})).not.toContain("4,500,000");
    }
    expect(factsOf(ev.text("s"), 0)).toBeNull();
  });

  test("the server keeps only the fields a fact has, whatever else is sent", () => {
    const fact = parseFact({ kind: "user-turn", sessionID: "s", messageID: "m", at: 1, attachedSource: true, text: SECRET });
    expect(fact).toEqual({ kind: "user-turn", sessionID: "s", messageID: "m", at: 1, attachedSource: true });
    expect(parseFact({ kind: "tool", sessionID: "s", callID: "c", at: 1, status: "completed", effect: "exfiltrate" })).toBeNull();
    expect(parseFact({ kind: "unknown", sessionID: "s", at: 1 })).toBeNull();
    expect(parseFact({ kind: "idle", sessionID: "s" })).toBeNull();
  });

  test("tool effects: files written, checks run, agents started, messages sent", () => {
    expect(toolEffect("write", {})).toBe("artifact");
    expect(toolEffect("edit", {})).toBe("artifact");
    expect(toolEffect("task", {})).toBe("delegates");
    expect(toolEffect("bash", { command: "pnpm test --filter server" })).toBe("checks");
    expect(toolEffect("bash", { command: "cd apps && pytest -q" })).toBe("checks");
    expect(toolEffect("bash", { command: "cat contest.txt" })).toBe("other");
    expect(toolEffect("gmail_send_email", {})).toBe("sends");
    expect(toolEffect("slack_post_message", {})).toBe("sends");
    expect(toolEffect("read", {})).toBe("reads");
  });
});

describe("modes", () => {
  const tally = (over: Partial<SessionTally>): SessionTally => ({
    rootSessionID: "s", startedAt: 0, lastActivityAt: 0, userTurns: 1, firstAttachedSource: false, assistantMessages: 1,
    toolCalls: 0, artifacts: 0, checks: 0, sends: 0, delegations: 0, peakConcurrentAgents: 0, subagentMinutes: 0,
    busyMinutes: 0, attentionMinutes: 0, permissionsAsked: 0, permissionsAlways: 0, aborted: 0, redirected: 0, sensitiveSends: 0, unmaskedSends: 0, ...over,
  });
  test("one question, nothing produced, is a look-up", () => expect(modeOf(tally({}))).toBe(0));
  test("a back and forth with nothing produced is learning", () => expect(modeOf(tally({ userTurns: 3 }))).toBe(1));
  test("a file in one or two messages is a draft", () => expect(modeOf(tally({ artifacts: 1, toolCalls: 3 }))).toBe(2));
  test("a file over three messages is iterating", () => expect(modeOf(tally({ artifacts: 2, userTurns: 3, toolCalls: 5 }))).toBe(3));
  test("many steps per message ending in a file is delegating", () => expect(modeOf(tally({ artifacts: 1, toolCalls: 12 }))).toBe(4));
  test("a subagent that produced is delegating", () => expect(modeOf(tally({ artifacts: 1, delegations: 1, toolCalls: 2 }))).toBe(4));
  test("two agents at once is orchestrating", () => expect(modeOf(tally({ peakConcurrentAgents: 2 }))).toBe(5));
  test("a message sent through a connector counts as produced", () => expect(modeOf(tally({ sends: 1 }))).toBe(2));
});

describe("the recorder, from engine events", () => {
  test("a look-up", async () => {
    const [s] = await finish([[0, ev.created("s")], [1000, ev.user("s", "m1", 1000)], [5000, ev.answer("s", "a1", 5000)], [6000, ev.idle("s")]]);
    expect(s).toMatchObject({ mode: 0, producedOutput: false, turns: 1, context: false, checked: false, toolKey: "cowork" });
    expect(s?.agent).toBeUndefined();
    expect(s?.externalId).toBe(externalIdOf("s"));
    expect(s?.startedAt).toBe("1970-01-01T00:00:01Z");
  });

  test("a draft that attached its source and was checked", async () => {
    const [s] = await finish([
      [0, ev.created("s")], [1000, ev.user("s", "m1", 1000)], [1000, ev.file("s", "m1")],
      [2000, ev.tool("s", "c1", "write", "completed")], [3000, ev.tool("s", "c2", "bash", "completed", { command: "pnpm test" })],
      [4000, ev.answer("s", "a1", 4000)], [5000, ev.idle("s")],
    ]);
    expect(s).toMatchObject({ mode: 2, producedOutput: true, context: true, checked: true, outward: false });
  });

  test("a file attached to a later message is not the first message's source", async () => {
    const [s] = await finish([
      [0, ev.created("s")], [1000, ev.user("s", "m1", 1000)], [2000, ev.answer("s", "a1", 2000)],
      [3000, ev.user("s", "m2", 3000)], [3000, ev.file("s", "m2")], [4000, ev.idle("s")],
    ]);
    expect(s?.context).toBe(false);
  });

  test("an orchestrated run: two subagents at once, folded into the session that started them", async () => {
    const [s, ...rest] = await finish([
      [0, ev.created("root")], [0, ev.user("root", "m1", 0)], [0, ev.busy("root", true)],
      [1 * MINUTE, ev.tool("root", "t1", "task", "running")], [1 * MINUTE, ev.created("kid1", "root")], [1 * MINUTE, ev.busy("kid1", true)],
      [1 * MINUTE, ev.tool("root", "t2", "task", "running")], [1 * MINUTE, ev.created("kid2", "root")], [1 * MINUTE, ev.busy("kid2", true)],
      [2 * MINUTE, ev.user("kid1", "k1", 2 * MINUTE)], [3 * MINUTE, ev.tool("kid1", "w1", "write", "completed")],
      [4 * MINUTE, ev.tool("kid2", "w2", "edit", "completed")],
      [5 * MINUTE, ev.busy("kid1", false)], [6 * MINUTE, ev.busy("kid2", false)],
      [6 * MINUTE, ev.tool("root", "t1", "task", "completed")], [6 * MINUTE, ev.tool("root", "t2", "task", "completed")],
      [7 * MINUTE, ev.busy("root", false)], [7 * MINUTE, ev.answer("root", "a1", 7 * MINUTE)], [7 * MINUTE, ev.idle("root")],
    ]);
    expect(rest).toHaveLength(0);
    expect(s).toMatchObject({ mode: 5, producedOutput: true, turns: 1 });
    expect(s?.agent).toMatchObject({ agentsAtOnce: 2, actions: 4, instructions: 1, agentMinutes: 16, autoApproved: true, interrupted: false });
  });

  test("an abort followed by a new message is steering", async () => {
    const [s] = await finish([
      [0, ev.created("s")], [0, ev.user("s", "m1", 0)], [1000, ev.abort("s")],
      [2000, ev.user("s", "m2", 2000)], [3000, ev.tool("s", "c1", "write", "completed")],
      [4000, ev.answer("s", "a1", 4000)], [5000, ev.idle("s")],
    ]);
    expect(s).toMatchObject({ steerApplicable: true, steered: true, turns: 2 });
  });

  test("time to read an answer counts as attention, but an hour away does not", async () => {
    const steps = [...Array(20).keys()].map((i) => [i, ev.tool("s", `c${i}`, "read", "completed")] as [number, unknown]);
    const [s] = await finish([
      [0, ev.created("s")], [0, ev.user("s", "m1", 0)], ...steps, [25, ev.tool("s", "w", "write", "completed")],
      [1 * MINUTE, ev.answer("s", "a1", 1 * MINUTE)], [3 * MINUTE, ev.user("s", "m2", 3 * MINUTE)],
      [4 * MINUTE, ev.answer("s", "a2", 4 * MINUTE)], [64 * MINUTE, ev.user("s", "m3", 64 * MINUTE)], [65 * MINUTE, ev.idle("s")],
    ]);
    expect(s?.mode).toBe(4);
    expect(s?.agent?.attentionMinutes).toBe(12);
  });

  test("a session is finished only when quiet and nothing is running", async () => {
    const out: LabeledSession[] = [];
    const recorder = new InsightsRecorder((s) => void out.push(s), 15 * MINUTE);
    play(recorder, [[0, ev.created("s")], [0, ev.user("s", "m1", 0)], [0, ev.busy("s", true)]]);
    expect(await recorder.sweep(60 * MINUTE)).toBe(0);
    play(recorder, [[61 * MINUTE, ev.busy("s", false)]]);
    expect(await recorder.sweep(70 * MINUTE)).toBe(0);
    expect(await recorder.sweep(77 * MINUTE)).toBe(1);
    expect(out).toHaveLength(1);
    expect(recorder.liveCount()).toBe(0);
  });

  test("a session nobody wrote in is not reported", async () => {
    const out = await finish([[0, ev.created("s")], [0, ev.tool("s", "c", "read", "completed")], [1, ev.idle("s")]]);
    expect(out).toHaveLength(0);
  });

  test("every label is one the console accepts", () => {
    const s = labelSession({
      rootSessionID: "s", startedAt: 0, lastActivityAt: 0, userTurns: 1, firstAttachedSource: false, assistantMessages: 1,
      toolCalls: 9, artifacts: 1, checks: 0, sends: 0, delegations: 0, peakConcurrentAgents: 0, subagentMinutes: 0,
      busyMinutes: 1.234, attentionMinutes: 0.5, permissionsAsked: 2, permissionsAlways: 0, aborted: 0, redirected: 0,
      sensitiveSends: 0, unmaskedSends: 0,
    });
    expect(Object.keys(s).sort()).toEqual(
      ["agent", "brief", "checked", "context", "externalId", "labelerId", "labelerVersion", "mode", "outward", "producedOutput", "sensitiveOk",
        "sensitiveTouched", "startedAt", "steerApplicable", "steered", "toolKey", "turns"],
    );
    expect(s.externalId).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
    expect(s.agent).toMatchObject({ agentMinutes: 1.23, autoApproved: false, agentsAtOnce: 1 });
  });
});

describe("the work family", () => {
  const labels: string[] = [];
  const label = async (text: string) => {
    labels.push(text);
    return { family: "write" as const, confidence: 0.9 };
  };

  test("only the first message of the session the person wrote in is read, once, and only the family is kept", async () => {
    labels.length = 0;
    const out: LabeledSession[] = [];
    const recorder = new InsightsRecorder((s) => void out.push(s), 15 * MINUTE);
    play(recorder, [[0, ev.created("s")], [0, ev.created("kid", "s")], [0, ev.user("s", "m1", 0)], [1, ev.user("s", "m2", 1)], [1, ev.user("kid", "k1", 1)]]);
    expect(await recorder.observeFirstMessage("s", "m2", "later", label)).toBe(false);
    expect(await recorder.observeFirstMessage("kid", "k1", "subagent", label)).toBe(false);
    expect(await recorder.observeFirstMessage("s", "m1", SECRET, label)).toBe(true);
    expect(await recorder.observeFirstMessage("s", "m1", SECRET, label)).toBe(false);
    expect(await recorder.observeFirstMessage("unknown", "m1", "x", label)).toBe(false);
    expect(labels).toEqual([SECRET]);
    await recorder.sweep(Date.now() + 365 * 24 * 60 * MINUTE);
    expect(out[0]!.familyKey).toBe("write");
    expect(JSON.stringify(out)).not.toContain("김지원");
  });

  test("a session the classifier named nothing for, or could not read, carries no family", async () => {
    const out: LabeledSession[] = [];
    const recorder = new InsightsRecorder((s) => void out.push(s), 15 * MINUTE);
    play(recorder, [[0, ev.user("a", "m1", 0)], [0, ev.user("b", "m1", 0)]]);
    await recorder.observeFirstMessage("a", "m1", "hi", async () => ({ family: null, confidence: 0.4 }));
    await recorder.observeFirstMessage("b", "m1", "hi", async () => null);
    await recorder.sweep(Date.now() + 365 * 24 * 60 * MINUTE);
    expect(out.map((s) => "familyKey" in s)).toEqual([false, false]);
  });
});

describe("the engine plugin", () => {
  let posted: unknown[] = [];
  let paths: string[] = [];
  let serverHandle: ReturnType<typeof Bun.serve> | null = null;
  const saved = { url: process.env.REDROB_SERVER_URL, token: process.env.REDROB_SERVER_TOKEN };
  beforeEach(() => {
    posted = [];
    paths = [];
    serverHandle = Bun.serve({
      port: 0,
      fetch: async (request) => {
        paths.push(new URL(request.url).pathname);
        posted.push(await request.json());
        return Response.json({ accepted: 1 });
      },
    });
    process.env.REDROB_SERVER_URL = `http://127.0.0.1:${serverHandle.port}`;
    process.env.REDROB_SERVER_TOKEN = "t";
  });
  afterEach(() => {
    serverHandle?.stop(true);
    process.env.REDROB_SERVER_URL = saved.url;
    process.env.REDROB_SERVER_TOKEN = saved.token;
  });

  test("every model request carries the root session's id", async () => {
    const hooks = await RedrobWorkInsightsRecorder();
    await hooks.event({ event: ev.created("kid", "root") });
    const output = { headers: {} as Record<string, string> };
    await hooks["chat.headers"]({ sessionID: "kid" }, output);
    expect(output.headers["x-redrob-session"]).toBe(externalIdOf("root"));
  });

  test("facts reach the server, and what was written does not", async () => {
    const hooks = await RedrobWorkInsightsRecorder();
    await hooks.event({ event: ev.user("s", "m1", 1) });
    await hooks.event({ event: ev.tool("s", "c", "bash", "completed", { command: `echo "${SECRET}"` }) });
    await hooks.event({ event: ev.text("s") });
    await hooks.event({ event: ev.idle("s") });
    expect(posted).toHaveLength(1);
    const body = JSON.stringify(posted[0]);
    expect(body).not.toContain("김지원");
    expect(body).not.toContain("acme.test");
    const facts = (posted[0] as { facts: Fact[] }).facts;
    expect(facts.map((f) => f.kind)).toEqual(["user-turn", "tool", "idle"]);
  });

  test("the first message's text goes once to the local classifier, after the facts; no other text does", async () => {
    const hooks = await RedrobWorkInsightsRecorder();
    await hooks.event({ event: ev.created("kid", "s") });
    await hooks.event({ event: ev.user("s", "m1", 1) });
    await hooks.event({ event: ev.text("s", "m1", "added by the engine", true) });
    await hooks.event({ event: ev.text("s", "m1") });
    await hooks.event({ event: ev.text("s", "m1", "edited") });
    await hooks.event({ event: ev.user("s", "m2", 2) });
    await hooks.event({ event: ev.text("s", "m2", "second message") });
    await hooks.event({ event: ev.user("kid", "k1", 3) });
    await hooks.event({ event: ev.text("kid", "k1", "subagent instruction") });
    await hooks.event({ event: ev.idle("s") });
    expect(paths).toEqual(["/insights/facts", "/insights/work", "/insights/facts"]);
    expect(posted[1]).toEqual({ sessionID: "s", messageID: "m1", text: SECRET });
    expect((posted[0] as { facts: Fact[] }).facts.map((f) => f.kind)).toEqual(["session", "user-turn"]);
    for (const body of [posted[0], posted[2]]) expect(JSON.stringify(body)).not.toMatch(/김지원|second message|subagent instruction/);
  });

  test("an unreachable server never breaks the chat", async () => {
    process.env.REDROB_SERVER_URL = "http://127.0.0.1:1";
    const hooks = await RedrobWorkInsightsRecorder();
    await hooks.event({ event: ev.idle("s") });
  });
});

describe("the outbox", () => {
  const dirs: string[] = [];
  let config: ServerConfig;
  const savedEnv = { data: process.env.REDROB_DATA_DIR, db: process.env.REDROB_RUNTIME_DB };
  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "redrob-insights-"));
    dirs.push(dir);
    process.env.REDROB_DATA_DIR = dir;
    process.env.REDROB_RUNTIME_DB = join(dir, "runtime.sqlite");
    config = {
      host: "127.0.0.1", port: 0, token: "t", hostToken: "h", configPath: join(dir, "config.json"),
      approval: { mode: "auto", timeoutMs: 1000 }, corsOrigins: [], workspaces: [], authorizedRoots: [], readOnly: false,
      startedAt: Date.now(), tokenSource: "generated", hostTokenSource: "generated", logFormat: "pretty", logRequests: false,
    };
  });
  afterEach(async () => {
    process.env.REDROB_DATA_DIR = savedEnv.data;
    process.env.REDROB_RUNTIME_DB = savedEnv.db;
    while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
  });

  const session = (id: string): LabeledSession => labelSession({
    rootSessionID: id, startedAt: 0, lastActivityAt: 0, userTurns: 1, firstAttachedSource: false, assistantMessages: 1,
    toolCalls: 0, artifacts: 0, checks: 0, sends: 0, delegations: 0, peakConcurrentAgents: 0, subagentMinutes: 0,
    busyMinutes: 0, attentionMinutes: 0, permissionsAsked: 0, permissionsAlways: 0, aborted: 0, redirected: 0,
    sensitiveSends: 0, unmaskedSends: 0,
  });

  test("keeps what is queued, once each, and drops what was sent", async () => {
    const outbox = new InsightsOutbox(config);
    await Promise.all([outbox.add(session("a")), outbox.add(session("b")), outbox.add(session("a"))]);
    expect((await outbox.list()).map((e) => e.session.externalId).sort()).toEqual([externalIdOf("a"), externalIdOf("b")].sort());
    await outbox.remove([externalIdOf("a")]);
    expect((await outbox.list()).map((e) => e.session.externalId)).toEqual([externalIdOf("b")]);
  });

  test("is bounded, oldest first out", async () => {
    const outbox = new InsightsOutbox(config);
    for (let i = 0; i < OUTBOX_LIMIT + 3; i += 1) await outbox.add(session(`s${i}`), i);
    const entries = await outbox.list();
    expect(entries).toHaveLength(OUTBOX_LIMIT);
    expect(entries[0]?.session.externalId).toBe(externalIdOf("s3"));
  });
});

describe("sensitive data, from the privacy gate", () => {
  const gate = (reports: SensitivityReport[], level: "off" | "standard") => {
    const config: ServerConfig = {
      host: "127.0.0.1", port: 0, token: "t", hostToken: "h", configPath: "/nonexistent/config.json",
      approval: { mode: "auto", timeoutMs: 1000 }, corsOrigins: [], workspaces: [], authorizedRoots: [], readOnly: false,
      startedAt: 0, tokenSource: "generated", hostTokenSource: "generated", logFormat: "pretty", logRequests: false,
    };
    const instance = new PrivacyGate(
      config,
      () => null,
      new DetectorSource({ directory: null, pinnedManifestSha256: null, allowUnpinned: false }),
      (report) => reports.push(report),
    );
    // A directory no workspace owns gets the default level; "off" is reached through the rules.
    if (level === "off") instance.rules = async () => ({ level: "off", names: [] });
    return instance;
  };

  test("an email at Standard is touched and masked; an account number is touched and not", async () => {
    const reports: SensitivityReport[] = [];
    const g = gate(reports, "standard");
    const masked = await g.label({ sessionID: "s1", directory: null, texts: ["Write to jiwon@acme.test about the renewal"] });
    expect(masked.texts[0]).not.toContain("jiwon@acme.test");
    await g.label({ sessionID: "s2", directory: null, texts: ["Pay into 110-234-567890 today"] });
    await g.label({ sessionID: "s3", directory: null, texts: ["Summarize this thread"] });
    expect(reports).toEqual([
      { sessionID: "s1", touched: true, unmasked: false },
      { sessionID: "s2", touched: true, unmasked: true },
    ]);
  });

  test("with protection off, anything sensitive went out unmasked", async () => {
    const reports: SensitivityReport[] = [];
    await gate(reports, "off").label({ sessionID: "s", directory: null, texts: ["Call 010-1234-5678"] });
    expect(reports).toEqual([{ sessionID: "s", touched: true, unmasked: true }]);
  });

  test("a report carries no value, and the chat's own labels are untouched", async () => {
    const reports: SensitivityReport[] = [];
    const g = gate(reports, "standard");
    const first = await g.label({ sessionID: "s", directory: null, texts: ["Pay into 110-234-567890, mail kim@acme.test"] });
    expect(JSON.stringify(reports)).not.toContain("110-234");
    expect(first.texts[0]).toContain("[EMAIL_1]");
    expect(first.texts[0]).toContain("110-234-567890");
  });

  test("the session's labels follow: touched, and safe only when nothing went out unmasked", async () => {
    const out: LabeledSession[] = [];
    const recorder = new InsightsRecorder((s) => void out.push(s), 15 * MINUTE);
    play(recorder, [[0, ev.user("safe", "m1", 0)], [0, ev.user("leaky", "m2", 0)], [0, ev.user("none", "m3", 0)]]);
    recorder.observeSensitivity("safe", 1, false);
    recorder.observeSensitivity("leaky", 1, false);
    recorder.observeSensitivity("leaky", 2, true);
    await recorder.sweep(60 * MINUTE);
    const by = Object.fromEntries(out.map((s) => [s.externalId, s]));
    expect(by[externalIdOf("safe")]).toMatchObject({ sensitiveTouched: true, sensitiveOk: true });
    expect(by[externalIdOf("leaky")]).toMatchObject({ sensitiveTouched: true, sensitiveOk: false });
    expect(by[externalIdOf("none")]).toMatchObject({ sensitiveTouched: false, sensitiveOk: false });
  });
});
