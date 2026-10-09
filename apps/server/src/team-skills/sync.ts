import { readFile } from "node:fs/promises";
import { z } from "zod";

import { recordAudit } from "../audit.js";
import { REDROB_CONSOLE_API_BASE_URL } from "../redrob-device.js";
import { externalFetch } from "../server-fetch.js";
import { buildSkillContent, deleteSkill, listSkills, renderSkillDocument, upsertSkill } from "../skills.js";
import type { ServerConfig, WorkspaceType } from "../types.js";
import { shortId } from "../utils.js";
import { validateDescription, validateSkillName } from "../validators.js";
import { createWorkspaceKvStore } from "../workspace-kv-store.js";

/*
 * Team skills: the skills a team keeps in the Redrob Console, installed into every local workspace.
 *
 * The Console answers GET /skill-sync for the workspace that owns the Redrob Key the engine holds,
 * so the key is the only thing that ties this machine to a team. Each skill becomes
 * `.opencode/skills/<name>/SKILL.md` with `metadata.source: team`; they are edited in the Console,
 * not here, and the next check puts back whatever changed on disk.
 *
 * What is recorded per workspace (`team_skill_installs`) is what this sync installed, so it only ever
 * removes its own files. A skill already in the workspace under the same name that this sync did not
 * install wins: it is listed as a conflict and left alone.
 *
 * What each answer does:
 * - 200: install new and changed skills, remove the ones the team dropped.
 * - 304: nothing changed (not asked while there are conflicts, so a resolved one gets installed).
 * - 401: the key is not accepted (revoked, or not a key): remove the team's skills, `not_connected`.
 * - 403: the key's owner is not in the team any more: remove the team's skills, `not_member`.
 * - no key: `not_connected`, and nothing on disk changes (a key that is merely missing says nothing
 *   about the team).
 * - anything else, or no answer: `unreachable`. The installed skills stay as they are.
 */

export const TEAM_SKILLS_SYNC_INTERVAL_MS = 30 * 60_000;
const SYNC_JITTER_MS = 5 * 60_000;
const STARTUP_DELAY_MS = 20_000;
const REQUEST_TIMEOUT_MS = 15_000;

export type TeamSkillsStatus = "synced" | "not_connected" | "not_member" | "unreachable";

export type TeamSkillsState = {
  etag: string | null;
  /** The skills this sync wrote, by name. */
  installed: string[];
  /** Team skills not installed because a skill of the same name was already there. */
  conflicts: string[];
  lastSyncAt: number | null;
  status: TeamSkillsStatus | null;
};

/** A workspace as this sync needs it. */
export type TeamSkillsWorkspace = { id: string; path: string; workspaceType?: WorkspaceType };

const EMPTY_STATE: TeamSkillsState = { etag: null, installed: [], conflicts: [], lastSyncAt: null, status: null };

const stateSchema = z.object({
  etag: z.string().nullable(),
  installed: z.array(z.string()),
  conflicts: z.array(z.string()),
  lastSyncAt: z.number().nullable(),
  status: z.enum(["synced", "not_connected", "not_member", "unreachable"]).nullable(),
});

const store = createWorkspaceKvStore<TeamSkillsState | null>({
  tableName: "team_skill_installs",
  valueColumn: "state_json",
  parse: (json) => {
    try {
      const parsed = stateSchema.safeParse(JSON.parse(json));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
  serialize: (value) => JSON.stringify(value),
});

export async function readTeamSkillsState(config: ServerConfig, workspaceId: string): Promise<TeamSkillsState> {
  return (await store.get(config, workspaceId)) ?? EMPTY_STATE;
}

const teamSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  body: z.string(),
  profession: z.string().nullish(),
  task: z.string().nullish(),
  language: z.string().nullish(),
  version: z.number(),
});

const syncResponseSchema = z.object({ etag: z.string().optional(), skills: z.array(teamSkillSchema) });

type TeamSkill = z.infer<typeof teamSkillSchema>;

export type TeamSkillsFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type TeamSkillsSyncDeps = {
  /** The Redrob Key, read from the engine at the moment it is needed. Null when there is none. */
  readKey: () => Promise<string | null>;
  fetchImpl?: TeamSkillsFetch;
  baseUrl?: string;
  now?: () => number;
  /** Called after a sync changed skill files in the workspace. */
  onChange?: (workspace: TeamSkillsWorkspace) => void;
};

function isValidSkill(skill: TeamSkill): boolean {
  try {
    validateSkillName(skill.name);
    validateDescription(skill.description);
    return Boolean(skill.body.trim());
  } catch {
    return false;
  }
}

/** The file as upsertSkill writes it, to tell whether it changed. */
function contentFor(skill: TeamSkill): string {
  return buildSkillContent({ name: skill.name, content: renderSkillDocument({
    name: skill.name,
    description: skill.description,
    body: skill.body,
    metadata: {
      ...(skill.profession ? { profession: skill.profession } : {}),
      ...(skill.task ? { task: skill.task } : {}),
      ...(skill.language ? { language: skill.language } : {}),
      version: skill.version,
      source: "team",
    },
  }) }).content;
}

async function removeInstalled(workspace: TeamSkillsWorkspace, names: readonly string[]): Promise<boolean> {
  let changed = false;
  for (const name of names) {
    try {
      await deleteSkill(workspace.path, name);
      changed = true;
    } catch {
      // Already gone: nothing to remove.
    }
  }
  return changed;
}

const inFlight = new Map<string, Promise<TeamSkillsState>>();

/** One check for one workspace. Concurrent calls for the same workspace share one run. */
export function syncTeamSkills(config: ServerConfig, workspace: TeamSkillsWorkspace, deps: TeamSkillsSyncDeps): Promise<TeamSkillsState> {
  const running = inFlight.get(workspace.id);
  if (running) return running;
  const run = runSync(config, workspace, deps).finally(() => {
    if (inFlight.get(workspace.id) === run) inFlight.delete(workspace.id);
  });
  inFlight.set(workspace.id, run);
  return run;
}

async function runSync(config: ServerConfig, workspace: TeamSkillsWorkspace, deps: TeamSkillsSyncDeps): Promise<TeamSkillsState> {
  const now = deps.now ?? Date.now;
  const previous = await readTeamSkillsState(config, workspace.id);
  const save = async (next: TeamSkillsState, changed: boolean, summary?: string) => {
    await store.set(config, workspace.id, next, now());
    if (changed) {
      await recordAudit(workspace.path, {
        id: shortId(),
        workspaceId: workspace.id,
        actor: { type: "host" },
        action: "skills.team_sync",
        target: workspace.path,
        summary: summary ?? "Updated team skills from the Redrob Console",
        timestamp: now(),
      }).catch(() => undefined);
      deps.onChange?.(workspace);
    }
    return next;
  };

  const key = await deps.readKey();
  if (!key) return save({ ...previous, status: "not_connected" }, false);

  const base = (deps.baseUrl ?? REDROB_CONSOLE_API_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = deps.fetchImpl ?? externalFetch;
  const revalidate = previous.etag && previous.conflicts.length === 0 && previous.status === "synced";

  let response: Response;
  try {
    response = await fetchImpl(`${base}/skill-sync`, {
      headers: {
        authorization: `Bearer ${key}`,
        accept: "application/json",
        ...(revalidate && previous.etag ? { "if-none-match": previous.etag } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return save({ ...previous, status: "unreachable" }, false);
  }

  if (response.status === 304) return save({ ...previous, status: "synced", lastSyncAt: now() }, false);
  if (response.status === 401 || response.status === 403) {
    const changed = await removeInstalled(workspace, previous.installed);
    return save(
      { etag: null, installed: [], conflicts: [], lastSyncAt: now(), status: response.status === 401 ? "not_connected" : "not_member" },
      changed,
      "Removed team skills: the Redrob Console no longer accepts this key for the team",
    );
  }
  if (!response.ok) return save({ ...previous, status: "unreachable" }, false);

  let parsed: z.infer<typeof syncResponseSchema>;
  try {
    parsed = syncResponseSchema.parse(await response.json());
  } catch {
    return save({ ...previous, status: "unreachable" }, false);
  }

  const wanted = parsed.skills.filter(isValidSkill);
  const wantedNames = new Set(wanted.map((skill) => skill.name));
  const ours = new Set(previous.installed);
  const local = new Map((await listSkills(workspace.path, false)).map((skill) => [skill.name, skill]));
  const installed: string[] = [];
  const conflicts: string[] = [];
  let changed = false;

  for (const skill of wanted) {
    const existing = local.get(skill.name);
    // A file that says it is a team skill is one this sync wrote, even if the record was lost.
    if (existing && !ours.has(skill.name) && existing.metadata?.source !== "team") {
      conflicts.push(skill.name);
      continue;
    }
    const content = contentFor(skill);
    const current = existing ? await readFile(existing.path, "utf8").catch(() => null) : null;
    if (current !== content) {
      await upsertSkill(workspace.path, { name: skill.name, content });
      changed = true;
    }
    installed.push(skill.name);
  }

  const dropped = previous.installed.filter((name) => !wantedNames.has(name));
  if (await removeInstalled(workspace, dropped)) changed = true;

  return save(
    { etag: response.headers.get("etag") ?? parsed.etag ?? null, installed, conflicts, lastSyncAt: now(), status: "synced" },
    changed,
  );
}

/**
 * Checks every local workspace on a timer: 20 seconds after start, then every 30 minutes with
 * jitter. Returns a stop function. Failures are logged and never thrown.
 */
export function startTeamSkillsSync(
  config: ServerConfig,
  deps: TeamSkillsSyncDeps,
  logger?: { log: (level: "info" | "warn", message: string, meta?: Record<string, unknown>) => void },
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const runAll = async () => {
    for (const workspace of config.workspaces) {
      if (stopped) return;
      if (workspace.workspaceType === "remote") continue;
      try {
        await syncTeamSkills(config, workspace, deps);
      } catch (error) {
        logger?.log("warn", "Team skills check failed", {
          workspaceId: workspace.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  };

  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      void runAll().finally(() => schedule(TEAM_SKILLS_SYNC_INTERVAL_MS + Math.floor((Math.random() * 2 - 1) * SYNC_JITTER_MS)));
    }, delay);
    timer.unref?.();
  };
  schedule(STARTUP_DELAY_MS);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
