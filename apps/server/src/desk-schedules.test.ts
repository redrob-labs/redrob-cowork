import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  addSchedule,
  answerWaiting,
  nextRunAfter,
  promptForTarget,
  readRule,
  readSchedules,
  readTarget,
  tickWorkspace,
  updateSchedule,
  zonedTime,
  type ScheduleEngine,
  type ScheduleRule,
  type ScheduleTarget,
} from "./desk-schedules.js";
import type { ServerConfig, WorkspaceInfo } from "./types.js";
import { createWorkspaceKvStore } from "./workspace-kv-store.js";

/** The schedules table as raw JSON, to write what an older build saved. */
const rawStore = createWorkspaceKvStore<string>({
  tableName: "desk_schedules",
  valueColumn: "state_json",
  parse: (json) => json,
  serialize: (value) => value,
});

const roots: string[] = [];
const previousRuntimeDb = process.env.REDROB_RUNTIME_DB;

afterEach(async () => {
  while (roots.length) {
    const root = roots.pop();
    // Windows keeps the open runtime database locked; a leftover temp dir is not a failure.
    if (root) await rm(root, { recursive: true, force: true }).catch(() => {});
  }
  if (previousRuntimeDb === undefined) delete process.env.REDROB_RUNTIME_DB;
  else process.env.REDROB_RUNTIME_DB = previousRuntimeDb;
});

async function setup(): Promise<{ config: ServerConfig; workspace: WorkspaceInfo }> {
  const root = await mkdtemp(join(tmpdir(), "redrob-schedules-"));
  roots.push(root);
  process.env.REDROB_RUNTIME_DB = join(root, "runtime.sqlite");
  const workspace: WorkspaceInfo = { id: "ws_1", name: "ws", path: root, preset: "starter", workspaceType: "local" };
  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 0,
    token: "token",
    hostToken: "host-token",
    configPath: join(root, "server.json"),
    approval: { mode: "auto", timeoutMs: 0 },
    corsOrigins: [],
    workspaces: [workspace],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "pretty",
    logRequests: false,
  };
  return { config, workspace };
}

/** A fake engine: records what it was asked, and says what the test sets. */
function fakeEngine() {
  const calls: string[] = [];
  const prompts: string[] = [];
  const state: {
    statuses: Record<string, string>;
    asks: Array<{ id: string; sessionID: string; permission: string; patterns: string[] }>;
    sessions: number;
    skills: string[];
    commands: Record<string, string>;
  } = { statuses: {}, asks: [], sessions: 0, skills: ["weekly-report"], commands: { "weekly-update": "# weekly-update\n\nDo it." } };
  const engine: ScheduleEngine = {
    resolvePrompt: async (_workspace, target) => promptForTarget(target, async (name) => state.skills.includes(name)),
    legacyCommandTemplate: async (_workspace, name) => state.commands[name] ?? null,
    startRun: async (_workspace, input) => {
      state.sessions += 1;
      const id = `ses_${state.sessions}`;
      prompts.push(input.prompt);
      calls.push(`start:${input.title}:${input.prompt.split("\n")[0]}`);
      state.statuses[id] = "busy";
      return id;
    },
    status: async () => state.statuses,
    pendingPermissions: async () => state.asks,
    reply: async (_workspace, requestId, reply) => {
      calls.push(`reply:${requestId}:${reply}`);
      state.asks = state.asks.filter((ask) => ask.id !== requestId);
    },
  };
  return { engine, calls, prompts, state };
}

const PROMPT: ScheduleTarget = { kind: "prompt", text: "# weekly-update\n\nDo it." };

const SEOUL_DAILY: ScheduleRule = { mode: "repeat", freq: "daily", time: "09:00", zone: "Asia/Seoul", start: "2026-10-01" };
// Monday 5 October 2026, 00:00 UTC (09:00 in Seoul).
const MON_0900_SEOUL = Date.UTC(2026, 9, 5, 0, 0);

describe("the calendar", () => {
  test("a wall-clock time in a zone", () => {
    expect(zonedTime({ y: 2026, m: 10, d: 5 }, "09:00", "Asia/Seoul")).toBe(MON_0900_SEOUL);
    // New York is on daylight time in October: 09:00 there is 13:00 UTC.
    expect(zonedTime({ y: 2026, m: 10, d: 5 }, "09:00", "America/New_York")).toBe(Date.UTC(2026, 9, 5, 13, 0));
  });

  test("daily, weekdays, weekly and monthly, from a moment", () => {
    expect(nextRunAfter(SEOUL_DAILY, MON_0900_SEOUL - 1)).toBe(MON_0900_SEOUL);
    expect(nextRunAfter(SEOUL_DAILY, MON_0900_SEOUL)).toBe(MON_0900_SEOUL + 86_400_000);
    // Friday 9 Oct 09:00 Seoul, then the weekend is skipped.
    const friday = Date.UTC(2026, 9, 9, 0, 0);
    expect(nextRunAfter({ ...SEOUL_DAILY, freq: "weekdays" }, friday)).toBe(Date.UTC(2026, 9, 12, 0, 0));
    expect(nextRunAfter({ ...SEOUL_DAILY, freq: "weekly", days: ["3"] }, MON_0900_SEOUL)).toBe(Date.UTC(2026, 9, 7, 0, 0));
    expect(nextRunAfter({ ...SEOUL_DAILY, freq: "monthly", dom: "31" }, MON_0900_SEOUL)).toBe(Date.UTC(2026, 9, 31, 0, 0));
    // Not before its first day.
    expect(nextRunAfter({ ...SEOUL_DAILY, start: "2026-10-20" }, MON_0900_SEOUL)).toBe(Date.UTC(2026, 9, 20, 0, 0));
  });

  test("once runs once, and not after its time", () => {
    const once: ScheduleRule = { mode: "once", date: "2026-10-05", time: "09:00", zone: "Asia/Seoul" };
    expect(nextRunAfter(once, MON_0900_SEOUL - 1)).toBe(MON_0900_SEOUL);
    expect(nextRunAfter(once, MON_0900_SEOUL)).toBeNull();
  });

  test("a rule from the screen is checked", () => {
    expect(readRule({ mode: "repeat", freq: "daily", time: "08:00", zone: "Asia/Seoul" })).toMatchObject({ mode: "repeat", time: "08:00" });
    expect(() => readRule({ mode: "event", time: "08:00", zone: "Asia/Seoul" })).toThrow();
    expect(() => readRule({ mode: "once", time: "8am", zone: "Asia/Seoul" })).toThrow();
    expect(() => readRule({ mode: "once", time: "08:00", zone: "Mars/Olympus" })).toThrow();
  });
});

describe("the scheduler", () => {
  test("a due schedule starts its prompt once, and the next run moves on", async () => {
    const { config, workspace } = await setup();
    const { engine, calls } = fakeEngine();
    await addSchedule(config, workspace.id, { target: PROMPT, label: "Every day at 09:00", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    const due = MON_0900_SEOUL + 10_000;
    const first = await tickWorkspace(config, workspace, engine, due);
    await tickWorkspace(config, workspace, engine, due + 30_000);
    expect(calls).toEqual(["start:Every day at 09:00:# weekly-update"]);
    expect(first.schedules[0]).toMatchObject({ nextRunAt: MON_0900_SEOUL + 86_400_000, lastRun: { state: "running", sessionId: "ses_1" } });
  });

  test("a time missed while the app was closed is recorded and skipped, not run late", async () => {
    const { config, workspace } = await setup();
    const { engine, calls } = fakeEngine();
    await addSchedule(config, workspace.id, { target: PROMPT, label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    // Opened again two days later, at noon.
    const later = MON_0900_SEOUL + 2 * 86_400_000 + 3 * 3_600_000;
    const state = await tickWorkspace(config, workspace, engine, later);
    expect(calls).toEqual([]);
    expect(state.runs.map((run) => run.state)).toEqual(["missed"]);
    expect(state.schedules[0]?.nextRunAt).toBe(MON_0900_SEOUL + 3 * 86_400_000);
  });

  test("a run that asks waits; approving replies to the engine and lets it go on", async () => {
    const { config, workspace } = await setup();
    const { engine, calls, state } = fakeEngine();
    await addSchedule(config, workspace.id, { target: PROMPT, label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 1_000);
    state.asks = [{ id: "per_1", sessionID: "ses_1", permission: "bash", patterns: ["send-mail"] }];
    const waiting = await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 31_000);
    expect(waiting.waiting).toHaveLength(1);
    expect(waiting.waiting[0]).toMatchObject({ requestId: "per_1", permission: "bash", patterns: ["send-mail"] });
    expect(waiting.schedules[0]?.lastRun?.state).toBe("waiting");

    // It survives a restart: the state is in the runtime database.
    const reread = await readSchedules(config, workspace.id);
    expect(reread.waiting).toHaveLength(1);

    const answered = await answerWaiting(config, workspace, engine, reread.waiting[0]?.id ?? "", true);
    expect(calls).toContain("reply:per_1:once");
    expect(answered.waiting).toEqual([]);

    state.statuses.ses_1 = "idle";
    const done = await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 61_000);
    expect(done.runs.at(-1)?.state).toBe("done");
    expect(done.schedules[0]?.lastRun?.state).toBe("done");
  });

  test("Not now refuses the step", async () => {
    const { config, workspace } = await setup();
    const { engine, calls, state } = fakeEngine();
    await addSchedule(config, workspace.id, { target: PROMPT, label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 1_000);
    state.asks = [{ id: "per_9", sessionID: "ses_1", permission: "edit", patterns: [] }];
    const waiting = await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 31_000);
    await answerWaiting(config, workspace, engine, waiting.waiting[0]?.id ?? "", false);
    expect(calls).toContain("reply:per_9:reject");
  });

  test("a paused schedule does not run, and starts from now when turned back on", async () => {
    const { config, workspace } = await setup();
    const { engine, calls } = fakeEngine();
    const added = await addSchedule(config, workspace.id, { target: PROMPT, label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    const id = added.schedules[0]?.id ?? "";
    await updateSchedule(config, workspace.id, id, { enabled: false });
    await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 1_000);
    expect(calls).toEqual([]);
    const resumed = await updateSchedule(config, workspace.id, id, { enabled: true }, MON_0900_SEOUL + 3_600_000);
    expect(resumed.schedules[0]?.nextRunAt).toBe(MON_0900_SEOUL + 86_400_000);
  });

  test("a skill run asks for the skill, with the extra instructions", async () => {
    const { config, workspace } = await setup();
    const { engine, prompts } = fakeEngine();
    const target: ScheduleTarget = { kind: "skill", name: "weekly-report", instructions: "Only the sales team." };
    await addSchedule(config, workspace.id, { target, label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 1_000);
    expect(prompts).toEqual(["Use the `weekly-report` skill.\n\nOnly the sales team."]);
  });

  test("a skill without instructions is just the skill", async () => {
    expect(await promptForTarget({ kind: "skill", name: "weekly-report" }, async () => true)).toBe("Use the `weekly-report` skill.");
  });

  test("a skill that is gone fails the run instead of throwing", async () => {
    const { config, workspace } = await setup();
    const { engine, calls } = fakeEngine();
    await addSchedule(config, workspace.id, { target: { kind: "skill", name: "gone" }, label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    const state = await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 1_000);
    expect(calls).toEqual([]);
    expect(state.schedules[0]?.lastRun).toMatchObject({ state: "failed", reason: "The skill is gone" });
    expect(state.runs.at(-1)).toMatchObject({ state: "failed", reason: "The skill is gone" });
  });

  test("two schedules for the same skill both stay", async () => {
    const { config, workspace } = await setup();
    const target: ScheduleTarget = { kind: "skill", name: "weekly-report" };
    await addSchedule(config, workspace.id, { target, label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    const both = await addSchedule(config, workspace.id, { target, label: "Weekdays", rule: { ...SEOUL_DAILY, freq: "weekdays" } });
    expect(both.schedules.map((schedule) => schedule.label)).toEqual(["Daily", "Weekdays"]);
    expect(new Set(both.schedules.map((schedule) => schedule.id)).size).toBe(2);
  });

  test("an edit changes what runs, its name and its rule, and a new rule starts from now", async () => {
    const { config, workspace } = await setup();
    const added = await addSchedule(config, workspace.id, { target: PROMPT, label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    const id = added.schedules[0]?.id ?? "";
    const target: ScheduleTarget = { kind: "skill", name: "weekly-report" };
    const weekly: ScheduleRule = { ...SEOUL_DAILY, freq: "weekly", days: ["3"] };
    const edited = await updateSchedule(config, workspace.id, id, { target, label: "Wednesdays", rule: weekly }, MON_0900_SEOUL);
    expect(edited.schedules).toHaveLength(1);
    expect(edited.schedules[0]).toMatchObject({ id, target, label: "Wednesdays", rule: weekly, enabled: true, nextRunAt: Date.UTC(2026, 9, 7, 0, 0) });
    // Only the label: the next run stays where it was.
    const renamed = await updateSchedule(config, workspace.id, id, { label: "Midweek" }, MON_0900_SEOUL + 3_600_000);
    expect(renamed.schedules[0]).toMatchObject({ label: "Midweek", target, nextRunAt: Date.UTC(2026, 9, 7, 0, 0) });
  });

  test("a schedule saved for a playbook becomes a prompt schedule with the command's text", async () => {
    const { config, workspace } = await setup();
    const { engine, prompts } = fakeEngine();
    const old = { id: "sch_old", label: "Daily", rule: SEOUL_DAILY, nextRunAt: MON_0900_SEOUL, enabled: true, lastRun: null };
    await rawStore.set(config, workspace.id, JSON.stringify({ schedules: [{ ...old, playbookId: "weekly-update" }], runs: [], waiting: [] }));
    // Not dropped on read.
    expect((await readSchedules(config, workspace.id)).legacy).toHaveLength(1);
    const state = await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 1_000);
    expect(state.legacy).toEqual([]);
    expect(state.schedules[0]).toMatchObject({ id: "sch_old", label: "Daily", rule: SEOUL_DAILY, target: { kind: "prompt", text: "# weekly-update\n\nDo it." } });
    expect(prompts).toEqual(["# weekly-update\n\nDo it."]);
    // Saved converted.
    const reread = await readSchedules(config, workspace.id);
    expect(reread.legacy).toEqual([]);
    expect(reread.schedules[0]?.target).toEqual({ kind: "prompt", text: "# weekly-update\n\nDo it." });
  });

  test("a schedule saved for a playbook that is gone is dropped, with a warning", async () => {
    const { config, workspace } = await setup();
    const { engine, calls } = fakeEngine();
    const warnings: string[] = [];
    const logger = { log: (_level: "warn", message: string) => void warnings.push(message) };
    const old = { id: "sch_old", playbookId: "gone", label: "Daily", rule: SEOUL_DAILY, nextRunAt: MON_0900_SEOUL, enabled: true, lastRun: null };
    await rawStore.set(config, workspace.id, JSON.stringify({ schedules: [old], runs: [], waiting: [] }));
    const state = await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 1_000, logger);
    expect(state.schedules).toEqual([]);
    expect(state.legacy).toEqual([]);
    expect(calls).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect((await readSchedules(config, workspace.id)).legacy).toEqual([]);
  });
});

describe("a target from the screen", () => {
  test("a prompt or a skill, checked", () => {
    expect(readTarget({ kind: "prompt", text: "  Summarise my inbox " })).toEqual({ kind: "prompt", text: "Summarise my inbox" });
    expect(readTarget({ kind: "skill", name: "weekly-report", instructions: "" })).toEqual({ kind: "skill", name: "weekly-report" });
    expect(readTarget({ kind: "skill", name: "weekly-report", instructions: "Short." })).toEqual({
      kind: "skill",
      name: "weekly-report",
      instructions: "Short.",
    });
    expect(() => readTarget({ kind: "prompt", text: "  " })).toThrow();
    expect(() => readTarget({ kind: "prompt", text: "x".repeat(20_001) })).toThrow();
    expect(() => readTarget({ kind: "skill", name: "Not A Skill" })).toThrow();
    expect(() => readTarget({ kind: "skill", name: "ok", instructions: "x".repeat(20_001) })).toThrow();
    expect(() => readTarget({ kind: "playbook", playbookId: "weekly-update" })).toThrow();
    expect(() => readTarget(undefined)).toThrow();
  });
});
