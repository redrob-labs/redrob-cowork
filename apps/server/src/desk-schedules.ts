import { randomUUID } from "node:crypto";

import { z } from "zod";

import { ApiError } from "./errors.js";
import type { ServerConfig, WorkspaceInfo } from "./types.js";
import { validateSkillName } from "./validators.js";
import { createWorkspaceKvStore } from "./workspace-kv-store.js";

/*
 * Scheduled runs. A schedule runs a prompt, or a skill with optional instructions, on a
 * calendar, inside redrob-server, while the app is open: there is no service that wakes the
 * computer. A run is a new session with that prompt on the Run agent. A time that passed while
 * the app was closed is recorded as missed and skipped, not run late. A run that asks for
 * permission waits on the Scheduled screen until the person answers.
 */

/** When a schedule runs: the schedule picker's value, without the file-arrives mode. */
export type ScheduleRule = {
  mode: "once" | "repeat";
  /** "2026-10-05", for once. */
  date?: string;
  /** The first day a repeat may run. */
  start?: string;
  /** "08:00", in `zone`. */
  time: string;
  /** IANA zone, e.g. "Asia/Seoul". */
  zone: string;
  freq?: "daily" | "weekdays" | "weekly" | "monthly";
  /** Days of the week for weekly, "0" Sunday to "6" Saturday. */
  days?: string[];
  /** Day of the month for monthly. */
  dom?: string;
};

export type ScheduleRunState = "running" | "waiting" | "done" | "missed" | "failed";

/** What a schedule runs: a prompt as written, or a skill with optional extra instructions. */
export type ScheduleTarget = { kind: "prompt"; text: string } | { kind: "skill"; name: string; instructions?: string };

const TEXT_LIMIT = 20_000;

const targetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("prompt"), text: z.string().trim().min(1).max(TEXT_LIMIT) }),
  z.strictObject({ kind: z.literal("skill"), name: z.string().trim(), instructions: z.string().trim().max(TEXT_LIMIT).optional() }),
]);

/** A target from the screen, checked. Throws a 400 when it is not one. */
export function readTarget(value: unknown): ScheduleTarget {
  const parsed = targetSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "invalid_schedule", "A schedule runs a prompt (1-20000 characters) or a skill");
  }
  const target = parsed.data;
  if (target.kind === "prompt") return target;
  validateSkillName(target.name);
  return target.instructions ? target : { kind: "skill", name: target.name };
}

/** The prompt a run starts with. `skillExists` is asked only for a skill. */
export async function promptForTarget(target: ScheduleTarget, skillExists: (name: string) => Promise<boolean>): Promise<string> {
  if (target.kind === "prompt") return target.text;
  if (!(await skillExists(target.name))) throw new Error("The skill is gone");
  return `Use the \`${target.name}\` skill.` + (target.instructions ? `\n\n${target.instructions}` : "");
}

export type StoredSchedule = {
  id: string;
  target: ScheduleTarget;
  /** How often, in words, as the picker said it. */
  label: string;
  rule: ScheduleRule;
  nextRunAt: number | null;
  enabled: boolean;
  /** `reason` says why a run failed. */
  lastRun: { state: ScheduleRunState; at: number; sessionId?: string; reason?: string } | null;
};

/**
 * A schedule saved before skills, when a schedule ran a playbook (a workspace command) by id.
 * It is turned into a prompt schedule with the command's text on the next pass.
 */
export type LegacySchedule = Omit<StoredSchedule, "target"> & { playbookId: string };

export type ScheduleRun = {
  id: string;
  scheduleId: string;
  sessionId: string | null;
  at: number;
  state: ScheduleRunState;
  reason?: string;
};

/** A scheduled run stopped at a permission ask. */
export type WaitingAsk = {
  id: string;
  scheduleId: string;
  sessionId: string;
  /** The engine's permission request id, answered by Approve or Not now. */
  requestId: string;
  permission: string;
  patterns: string[];
  askedAt: number;
};

export type ScheduleState = { schedules: StoredSchedule[]; runs: ScheduleRun[]; waiting: WaitingAsk[]; legacy: LegacySchedule[] };

const EMPTY: ScheduleState = { schedules: [], runs: [], waiting: [], legacy: [] };
/** The runs kept for the screen, newest last. */
const RUNS_KEPT = 50;
/** A one-off later than this is missed rather than run. */
const ONCE_GRACE_MS = 60 * 60_000;
export const SCHEDULE_TICK_MS = 30_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseState(json: string): ScheduleState {
  try {
    const value: unknown = JSON.parse(json);
    if (!isRecord(value)) return EMPTY;
    return {
      schedules: Array.isArray(value.schedules) ? value.schedules.filter(isStoredSchedule) : [],
      runs: Array.isArray(value.runs) ? value.runs.filter(isRun) : [],
      waiting: Array.isArray(value.waiting) ? value.waiting.filter(isWaiting) : [],
      legacy: [
        ...(Array.isArray(value.legacy) ? value.legacy : []),
        ...(Array.isArray(value.schedules) ? value.schedules : []),
      ].filter(isLegacySchedule),
    };
  } catch {
    return EMPTY;
  }
}

function isStoredSchedule(value: unknown): value is StoredSchedule {
  return isRecord(value) && typeof value.id === "string" && targetSchema.safeParse(value.target).success && isRecord(value.rule);
}
function isLegacySchedule(value: unknown): value is LegacySchedule {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.playbookId === "string" &&
    value.target === undefined &&
    isRecord(value.rule)
  );
}
function isRun(value: unknown): value is ScheduleRun {
  return isRecord(value) && typeof value.id === "string" && typeof value.scheduleId === "string";
}
function isWaiting(value: unknown): value is WaitingAsk {
  return isRecord(value) && typeof value.id === "string" && typeof value.requestId === "string" && typeof value.sessionId === "string";
}

const store = createWorkspaceKvStore<ScheduleState>({
  tableName: "desk_schedules",
  valueColumn: "state_json",
  parse: parseState,
  serialize: (value) => JSON.stringify(value),
});

export async function readSchedules(config: ServerConfig, workspaceId: string): Promise<ScheduleState> {
  return (await store.get(config, workspaceId)) ?? EMPTY;
}

async function writeSchedules(config: ServerConfig, workspaceId: string, state: ScheduleState): Promise<void> {
  await store.set(config, workspaceId, { ...state, runs: state.runs.slice(-RUNS_KEPT) });
}

/* ---------- The calendar ---------- */

const DAY_MS = 86_400_000;

/** The offset of `zone` from UTC at a moment, in minutes (Seoul is +540). */
function zoneOffsetMinutes(at: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - Math.floor(at / 60_000) * 60_000) / 60_000);
}

/** A wall-clock time in a zone, as a moment. */
export function zonedTime(day: { y: number; m: number; d: number }, time: string, zone: string): number {
  const [hour, minute] = time.split(":").map(Number);
  const naive = Date.UTC(day.y, day.m - 1, day.d, hour ?? 0, minute ?? 0);
  // Twice: the offset at the guess can differ from the offset at the answer across a change.
  const first = naive - zoneOffsetMinutes(naive, zone) * 60_000;
  return naive - zoneOffsetMinutes(first, zone) * 60_000;
}

function zonedDay(at: number, zone: string): { y: number; m: number; d: number; weekday: number } {
  const local = new Date(at + zoneOffsetMinutes(at, zone) * 60_000);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate(), weekday: local.getUTCDay() };
}

function parseDay(value: string | undefined): { y: number; m: number; d: number } | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) } : null;
}

const dayKey = (day: { y: number; m: number; d: number }) => day.y * 10_000 + day.m * 100 + day.d;

function runsOn(rule: ScheduleRule, day: { y: number; m: number; d: number; weekday: number }): boolean {
  switch (rule.freq ?? "daily") {
    case "daily":
      return true;
    case "weekdays":
      return day.weekday >= 1 && day.weekday <= 5;
    case "weekly":
      return (rule.days ?? []).includes(String(day.weekday));
    case "monthly": {
      const lastDay = new Date(Date.UTC(day.y, day.m, 0)).getUTCDate();
      return Math.min(Number(rule.dom ?? "1"), lastDay) === day.d;
    }
  }
}

/** The first time the rule fires after `after`, or null. Walks forward day by day, up to 400 days. */
export function nextRunAfter(rule: ScheduleRule, after: number): number | null {
  if (rule.mode === "once") {
    const day = parseDay(rule.date);
    if (!day) return null;
    const at = zonedTime(day, rule.time, rule.zone);
    return at > after ? at : null;
  }
  const start = parseDay(rule.start);
  for (let offset = 0; offset <= 400; offset += 1) {
    const day = zonedDay(after + offset * DAY_MS, rule.zone);
    if (start && dayKey(day) < dayKey(start)) continue;
    if (!runsOn(rule, day)) continue;
    const at = zonedTime(day, rule.time, rule.zone);
    if (at > after) return at;
  }
  return null;
}

export function readRule(value: unknown): ScheduleRule {
  if (!isRecord(value)) throw new ApiError(400, "invalid_schedule", "A schedule needs a rule");
  const mode = value.mode === "once" || value.mode === "repeat" ? value.mode : null;
  if (!mode) throw new ApiError(400, "invalid_schedule", "Schedules run once or on a repeat");
  const time = typeof value.time === "string" && /^\d{2}:\d{2}$/.test(value.time) ? value.time : null;
  const zone = typeof value.zone === "string" && value.zone.trim() ? value.zone.trim() : null;
  if (!time || !zone) throw new ApiError(400, "invalid_schedule", "A schedule needs a time and a zone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    throw new ApiError(400, "invalid_schedule", "Unknown time zone");
  }
  const freqs = ["daily", "weekdays", "weekly", "monthly"] as const;
  const freq = freqs.find((entry) => entry === value.freq);
  return {
    mode,
    time,
    zone,
    ...(typeof value.date === "string" ? { date: value.date } : {}),
    ...(typeof value.start === "string" ? { start: value.start } : {}),
    ...(freq ? { freq } : {}),
    ...(Array.isArray(value.days) ? { days: value.days.filter((day): day is string => typeof day === "string") } : {}),
    ...(typeof value.dom === "string" ? { dom: value.dom } : {}),
  };
}

/* ---------- Changes the screen makes ---------- */

export async function addSchedule(
  config: ServerConfig,
  workspaceId: string,
  input: { target: ScheduleTarget; label: string; rule: ScheduleRule },
  now = Date.now(),
): Promise<ScheduleState> {
  const state = await readSchedules(config, workspaceId);
  const schedule: StoredSchedule = {
    id: randomUUID(),
    target: input.target,
    label: input.label,
    rule: input.rule,
    nextRunAt: nextRunAfter(input.rule, now),
    enabled: true,
    lastRun: null,
  };
  const next = { ...state, schedules: [...state.schedules, schedule] };
  await writeSchedules(config, workspaceId, next);
  return next;
}

export async function updateSchedule(
  config: ServerConfig,
  workspaceId: string,
  scheduleId: string,
  patch: { enabled?: boolean; target?: ScheduleTarget; label?: string; rule?: ScheduleRule },
  now = Date.now(),
): Promise<ScheduleState> {
  const state = await readSchedules(config, workspaceId);
  if (!state.schedules.some((schedule) => schedule.id === scheduleId)) throw new ApiError(404, "not_found", "Schedule not found");
  const schedules = state.schedules.map((schedule) => {
    if (schedule.id !== scheduleId) return schedule;
    const changed: StoredSchedule = {
      ...schedule,
      enabled: patch.enabled ?? schedule.enabled,
      target: patch.target ?? schedule.target,
      label: patch.label ?? schedule.label,
      rule: patch.rule ?? schedule.rule,
    };
    // A new rule, or turned back on, starts from now: the times it was paused for are not owed.
    const fromNow = patch.rule !== undefined || patch.enabled === true;
    return fromNow ? { ...changed, nextRunAt: nextRunAfter(changed.rule, now) } : changed;
  });
  const next = { ...state, schedules };
  await writeSchedules(config, workspaceId, next);
  return next;
}

export async function removeSchedule(config: ServerConfig, workspaceId: string, scheduleId: string): Promise<ScheduleState> {
  const state = await readSchedules(config, workspaceId);
  const next = {
    ...state,
    schedules: state.schedules.filter((schedule) => schedule.id !== scheduleId),
    waiting: state.waiting.filter((ask) => ask.scheduleId !== scheduleId),
  };
  await writeSchedules(config, workspaceId, next);
  return next;
}

/* ---------- The engine, as the scheduler needs it ---------- */

export type ScheduleEngine = {
  /** The prompt a run of the target starts with. Throws when it cannot run (a skill that is gone). */
  resolvePrompt(workspace: WorkspaceInfo, target: ScheduleTarget): Promise<string>;
  /**
   * A workspace (then global) command's prompt, or null when it no longer exists. Only for
   * turning schedules saved before skills, which named a playbook command, into prompt schedules.
   */
  legacyCommandTemplate(workspace: WorkspaceInfo, commandName: string): Promise<string | null>;
  /** Starts a session on the Run agent with the prompt. Returns its id. */
  startRun(workspace: WorkspaceInfo, input: { title: string; prompt: string }): Promise<string>;
  /** Session id to status type ("idle", "busy", "retry"). */
  status(workspace: WorkspaceInfo): Promise<Record<string, string>>;
  pendingPermissions(workspace: WorkspaceInfo): Promise<Array<{ id: string; sessionID: string; permission: string; patterns: string[] }>>;
  reply(workspace: WorkspaceInfo, requestId: string, reply: "once" | "reject"): Promise<void>;
};

/** Answers a waiting run: Approve lets it go on, Not now refuses the step. */
export async function answerWaiting(
  config: ServerConfig,
  workspace: WorkspaceInfo,
  engine: Pick<ScheduleEngine, "reply">,
  waitingId: string,
  approve: boolean,
): Promise<ScheduleState> {
  const state = await readSchedules(config, workspace.id);
  const ask = state.waiting.find((entry) => entry.id === waitingId);
  if (!ask) throw new ApiError(404, "not_found", "Nothing is waiting with that id");
  await engine.reply(workspace, ask.requestId, approve ? "once" : "reject");
  const runs = state.runs.map((run) =>
    run.sessionId === ask.sessionId && run.state === "waiting" ? { ...run, state: "running" as const } : run,
  );
  const next = { ...state, runs, waiting: state.waiting.filter((entry) => entry.id !== waitingId) };
  await writeSchedules(config, workspace.id, next);
  return next;
}

type ScheduleLogger = { log(level: "warn", message: string, fields?: Record<string, unknown>): void };

/**
 * Turns schedules saved before skills (a playbook by id) into prompt schedules with the
 * command's text, once. A command that no longer exists drops its schedule, with a warning.
 * A lookup that fails keeps the schedule for the next pass. Returns the state, saved when changed.
 */
export async function resolveLegacySchedules(
  config: ServerConfig,
  workspace: WorkspaceInfo,
  engine: Pick<ScheduleEngine, "legacyCommandTemplate">,
  logger?: ScheduleLogger,
): Promise<ScheduleState> {
  const state = await readSchedules(config, workspace.id);
  if (!state.legacy.length) return state;
  const schedules = [...state.schedules];
  const legacy: LegacySchedule[] = [];
  for (const old of state.legacy) {
    const { playbookId, ...rest } = old;
    const template = await engine.legacyCommandTemplate(workspace, playbookId).catch(() => undefined);
    if (template === undefined) legacy.push(old);
    else if (template === null) {
      logger?.log("warn", "Dropped a scheduled run whose playbook is gone.", { workspaceId: workspace.id, playbookId });
    } else schedules.push({ ...rest, target: { kind: "prompt", text: template } });
  }
  const next = { ...state, schedules, legacy };
  await writeSchedules(config, workspace.id, next);
  return next;
}

/**
 * One pass for one workspace: start what is due, record what was missed, and follow the
 * runs under way: a permission ask makes a run wait, an idle session is a finished run.
 * Returns the state, saved when anything changed.
 */
export async function tickWorkspace(
  config: ServerConfig,
  workspace: WorkspaceInfo,
  engine: ScheduleEngine,
  now: number,
  logger?: ScheduleLogger,
): Promise<ScheduleState> {
  const state = await resolveLegacySchedules(config, workspace, engine, logger);
  if (!state.schedules.length && !state.waiting.length) return state;
  let changed = false;
  const runs = [...state.runs];
  const schedules: StoredSchedule[] = [];

  for (const schedule of state.schedules) {
    if (!schedule.enabled || schedule.nextRunAt === null || schedule.nextRunAt > now) {
      schedules.push(schedule);
      continue;
    }
    changed = true;
    const following = nextRunAfter(schedule.rule, schedule.nextRunAt);
    // A whole period went by (or a one-off is an hour late): the app was closed. Skip it.
    const missed = schedule.rule.mode === "once" ? now - schedule.nextRunAt > ONCE_GRACE_MS : following !== null && following <= now;
    const nextRunAt = nextRunAfter(schedule.rule, now);
    if (missed) {
      runs.push({ id: randomUUID(), scheduleId: schedule.id, sessionId: null, at: schedule.nextRunAt, state: "missed" });
      schedules.push({ ...schedule, nextRunAt, lastRun: { state: "missed", at: schedule.nextRunAt } });
      continue;
    }
    try {
      const prompt = await engine.resolvePrompt(workspace, schedule.target);
      const sessionId = await engine.startRun(workspace, { title: schedule.label, prompt });
      runs.push({ id: randomUUID(), scheduleId: schedule.id, sessionId, at: now, state: "running" });
      schedules.push({ ...schedule, nextRunAt, lastRun: { state: "running", at: now, sessionId } });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The run did not start";
      runs.push({ id: randomUUID(), scheduleId: schedule.id, sessionId: null, at: now, state: "failed", reason });
      schedules.push({ ...schedule, nextRunAt, lastRun: { state: "failed", at: now, reason } });
    }
  }

  let waiting = [...state.waiting];
  const active = runs.filter((run) => run.sessionId && (run.state === "running" || run.state === "waiting"));
  if (active.length) {
    const [statuses, asks] = await Promise.all([
      engine.status(workspace).catch(() => null),
      engine.pendingPermissions(workspace).catch(() => null),
    ]);
    if (statuses && asks) {
      const askIds = new Set(asks.map((ask) => ask.id));
      const answered = waiting.filter((ask) => !askIds.has(ask.requestId));
      if (answered.length) {
        waiting = waiting.filter((ask) => askIds.has(ask.requestId));
        changed = true;
      }
      for (const run of active) {
        const own = asks.filter((ask) => ask.sessionID === run.sessionId);
        for (const ask of own) {
          if (waiting.some((entry) => entry.requestId === ask.id)) continue;
          waiting.push({
            id: randomUUID(),
            scheduleId: run.scheduleId,
            sessionId: ask.sessionID,
            requestId: ask.id,
            permission: ask.permission,
            patterns: ask.patterns,
            askedAt: now,
          });
          changed = true;
        }
        const nextState: ScheduleRunState = own.length
          ? "waiting"
          : (statuses[run.sessionId ?? ""] ?? "idle") === "idle"
            ? "done"
            : "running";
        if (nextState !== run.state) {
          changed = true;
          const index = runs.indexOf(run);
          runs[index] = { ...run, state: nextState };
          const owner = schedules.findIndex((schedule) => schedule.id === run.scheduleId);
          const schedule = schedules[owner];
          if (schedule?.lastRun?.sessionId === run.sessionId) {
            schedules[owner] = { ...schedule, lastRun: { ...schedule.lastRun, state: nextState } };
          }
        }
      }
    }
  }

  const next = { ...state, schedules, runs, waiting };
  if (changed) await writeSchedules(config, workspace.id, next);
  return next;
}

/** Starts the scheduler: a pass over every local workspace every 30 seconds. Returns stop. */
export function startScheduler(input: {
  config: ServerConfig;
  engine: ScheduleEngine;
  logger?: ScheduleLogger;
  intervalMs?: number;
  now?: () => number;
}): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const workspace of input.config.workspaces) {
        if (workspace.workspaceType === "remote") continue;
        await tickWorkspace(input.config, workspace, input.engine, (input.now ?? Date.now)(), input.logger).catch((error: unknown) => {
          input.logger?.log("warn", "A scheduled run pass failed.", {
            workspaceId: workspace.id,
            error: error instanceof Error ? error.message : "unknown",
          });
        });
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), input.intervalMs ?? SCHEDULE_TICK_MS);
  // The scheduler never keeps the process alive on its own.
  timer.unref();
  return () => clearInterval(timer);
}
