import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  addSchedule,
  answerWaiting,
  nextRunAfter,
  readRule,
  readSchedules,
  tickWorkspace,
  updateSchedule,
  zonedTime,
  type ScheduleEngine,
  type ScheduleRule,
} from "./desk-schedules.js";
import type { ServerConfig, WorkspaceInfo } from "./types.js";

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
  const state = {
    statuses: {} as Record<string, string>,
    asks: [] as Array<{ id: string; sessionID: string; permission: string; patterns: string[] }>,
    sessions: 0,
  };
  const engine: ScheduleEngine = {
    template: async (_workspace, playbookId) => (playbookId === "gone" ? null : `# ${playbookId}\n\nDo it.`),
    startRun: async (_workspace, input) => {
      state.sessions += 1;
      const id = `ses_${state.sessions}`;
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
  return { engine, calls, state };
}

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
  test("a due schedule starts its playbook once, and the next run moves on", async () => {
    const { config, workspace } = await setup();
    const { engine, calls } = fakeEngine();
    await addSchedule(config, workspace.id, { playbookId: "weekly-update", label: "Every day at 09:00", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    const due = MON_0900_SEOUL + 10_000;
    const first = await tickWorkspace(config, workspace, engine, due);
    await tickWorkspace(config, workspace, engine, due + 30_000);
    expect(calls).toEqual(["start:Every day at 09:00:# weekly-update"]);
    expect(first.schedules[0]).toMatchObject({ nextRunAt: MON_0900_SEOUL + 86_400_000, lastRun: { state: "running", sessionId: "ses_1" } });
  });

  test("a time missed while the app was closed is recorded and skipped, not run late", async () => {
    const { config, workspace } = await setup();
    const { engine, calls } = fakeEngine();
    await addSchedule(config, workspace.id, { playbookId: "weekly-update", label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
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
    await addSchedule(config, workspace.id, { playbookId: "send-notices", label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
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
    await addSchedule(config, workspace.id, { playbookId: "send-notices", label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 1_000);
    state.asks = [{ id: "per_9", sessionID: "ses_1", permission: "edit", patterns: [] }];
    const waiting = await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 31_000);
    await answerWaiting(config, workspace, engine, waiting.waiting[0]?.id ?? "", false);
    expect(calls).toContain("reply:per_9:reject");
  });

  test("a paused schedule does not run, and starts from now when turned back on", async () => {
    const { config, workspace } = await setup();
    const { engine, calls } = fakeEngine();
    const added = await addSchedule(config, workspace.id, { playbookId: "p", label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    const id = added.schedules[0]?.id ?? "";
    await updateSchedule(config, workspace.id, id, { enabled: false });
    await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 1_000);
    expect(calls).toEqual([]);
    const resumed = await updateSchedule(config, workspace.id, id, { enabled: true }, MON_0900_SEOUL + 3_600_000);
    expect(resumed.schedules[0]?.nextRunAt).toBe(MON_0900_SEOUL + 86_400_000);
  });

  test("a playbook that is gone fails the run instead of throwing", async () => {
    const { config, workspace } = await setup();
    const { engine } = fakeEngine();
    await addSchedule(config, workspace.id, { playbookId: "gone", label: "Daily", rule: SEOUL_DAILY }, MON_0900_SEOUL - 60_000);
    const state = await tickWorkspace(config, workspace, engine, MON_0900_SEOUL + 1_000);
    expect(state.schedules[0]?.lastRun?.state).toBe("failed");
  });
});
