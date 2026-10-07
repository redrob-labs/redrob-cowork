import { ApiError } from "../errors.js";
import { REDROB_CONSOLE_API_BASE_URL } from "../redrob-device.js";
import { externalFetch } from "../server-fetch.js";
import type { Actor, ServerConfig } from "../types.js";
import { createWorkspaceKvStore, isRecord } from "../workspace-kv-store.js";
import { activeTeamPolicy, applyTeamPolicy, leaveTeamPolicy, readTeamPolicyState } from "./apply.js";
import { testKeysAllowed, type PinnedKey } from "./keys.js";

/*
 * Keeping a workspace on its team's current policy.
 *
 * The console publishes; this fetches with the Redrob Key the engine already holds (the workspace
 * API key the device flow issued), verifies and applies through applyTeamPolicy, and reports the
 * outcome back so admins can see which devices are on which version. The key is the only thing
 * that ties this machine to a team: the console answers for the key's own workspace, and refuses a
 * key whose owner has been removed (redrob-console K1).
 *
 * A workspace follows a team only after someone on this machine joins it (`join: true`). After that
 * it is checked at startup, every 30 minutes with jitter, and whenever the Team screen opens.
 *
 * What each answer does:
 * - 200: verify and apply. A policy that does not verify, is older, or is for another team is refused
 *   and reported; the workspace stays on what it had. Locks never fall back to unlocked.
 * - 304: nothing newer.
 * - 401/403: the console no longer accepts this key for the team, which after K1 means the owner was
 *   removed or the key revoked. A joined workspace leaves the team: its notes, playbooks and skills
 *   are removed (leaveTeamPolicy). A Redrob Key that is merely missing is NOT this case.
 * - 404: the team has not published a policy.
 * - anything else, or no answer: unreachable. Nothing changes; the last verified policy stays.
 */

export const TEAM_POLICY_SYNC_INTERVAL_MS = 30 * 60_000;
const SYNC_JITTER_MS = 5 * 60_000;
const STARTUP_DELAY_MS = 20_000;
const REQUEST_TIMEOUT_MS = 15_000;
/** After this long without a successful check, the Team screen says so. */
export const TEAM_POLICY_STALE_AFTER_MS = 7 * 24 * 60 * 60_000;

export type TeamPolicySyncStatus =
  | "applied"
  | "unchanged"
  | "no_policy"
  | "not_connected"
  | "not_joined"
  | "not_member"
  | "removed"
  | "refused"
  | "unreachable";

export type TeamPolicySyncOutcome = {
  status: TeamPolicySyncStatus;
  /** The refusal code, for `refused`. */
  code?: string;
  version?: number;
};

export type TeamPolicySyncRecord = {
  checkedAt: number;
  status: TeamPolicySyncStatus;
  code?: string;
  /** The last time a check reached the console and the workspace was on its current policy. */
  lastSuccessAt: number | null;
};

const syncStore = createWorkspaceKvStore<TeamPolicySyncRecord | null>({
  tableName: "team_policy_sync",
  valueColumn: "sync_json",
  parse: (json) => {
    try {
      const value = JSON.parse(json) as unknown;
      return isRecord(value) && typeof value.checkedAt === "number" ? (value as unknown as TeamPolicySyncRecord) : null;
    } catch {
      return null;
    }
  },
  serialize: (value) => JSON.stringify(value),
});

export async function readTeamPolicySync(config: ServerConfig, workspaceId: string): Promise<TeamPolicySyncRecord | null> {
  return (await syncStore.get(config, workspaceId)) ?? null;
}

export type TeamPolicyFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type TeamPolicySyncDeps = {
  /** The Redrob Key, read from the engine at the moment it is needed. Null when there is none. */
  readKey: () => Promise<string | null>;
  fetchImpl?: TeamPolicyFetch;
  baseUrl?: string;
  keys?: readonly PinnedKey[];
  now?: () => number;
  env?: Record<string, string | undefined>;
};

/**
 * The console the policy comes from. A development build may point at a local console with
 * REDROB_CONSOLE_API_URL; a packaged build cannot, so its key is only ever sent to Redrob's console.
 */
export function teamPolicyConsoleBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const override = env.REDROB_CONSOLE_API_URL?.trim();
  return (override && testKeysAllowed(env) ? override : REDROB_CONSOLE_API_BASE_URL).replace(/\/+$/, "");
}

type Workspace = { id: string; path: string };

const inFlight = new Map<string, Promise<TeamPolicySyncOutcome>>();

/** One check for one workspace. Concurrent calls for the same workspace share one request. */
export function syncTeamPolicy(
  config: ServerConfig,
  workspace: Workspace,
  deps: TeamPolicySyncDeps,
  options: { join?: boolean; actor?: Actor } = {},
): Promise<TeamPolicySyncOutcome> {
  const running = inFlight.get(workspace.id);
  if (running && !options.join) return running;
  const run = runSync(config, workspace, deps, options).finally(() => {
    if (inFlight.get(workspace.id) === run) inFlight.delete(workspace.id);
  });
  inFlight.set(workspace.id, run);
  return run;
}

async function runSync(
  config: ServerConfig,
  workspace: Workspace,
  deps: TeamPolicySyncDeps,
  options: { join?: boolean; actor?: Actor },
): Promise<TeamPolicySyncOutcome> {
  const now = deps.now ?? Date.now;
  const actor = options.actor ?? { type: "host" as const };
  const active = await activeTeamPolicy(config, workspace.id);
  if (!active && !options.join) return { status: "not_joined" };

  const finish = async (outcome: TeamPolicySyncOutcome): Promise<TeamPolicySyncOutcome> => {
    const previous = await readTeamPolicySync(config, workspace.id);
    const success = outcome.status === "applied" || outcome.status === "unchanged";
    await syncStore.set(
      config,
      workspace.id,
      {
        checkedAt: now(),
        status: outcome.status,
        ...(outcome.code ? { code: outcome.code } : {}),
        lastSuccessAt: success ? now() : (previous?.lastSuccessAt ?? null),
      },
      now(),
    );
    return outcome;
  };

  const key = await deps.readKey();
  if (!key) return finish({ status: "not_connected" });

  const base = (deps.baseUrl ?? teamPolicyConsoleBaseUrl(deps.env)).replace(/\/+$/, "");
  const fetchImpl = deps.fetchImpl ?? externalFetch;
  const after = active ? active.version : 0;
  const headers = { authorization: `Bearer ${key}`, accept: "application/json" };

  let response: Response;
  try {
    response = await fetchImpl(`${base}/team-policy/signed?after=${after}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return finish({ status: "unreachable" });
  }

  if (response.status === 304) return finish({ status: "unchanged", ...(active ? { version: active.version } : {}) });
  if (response.status === 404) return finish({ status: "no_policy" });
  if (response.status === 401 || response.status === 403) {
    if (active) {
      await leaveTeamPolicy(config, workspace, { actor, reason: "the team no longer accepts this device", now });
      return finish({ status: "removed" });
    }
    return finish({ status: "not_member" });
  }
  if (!response.ok) return finish({ status: "unreachable" });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return finish({ status: "unreachable" });
  }
  const jws = isRecord(body) && typeof body.jws === "string" ? body.jws : null;
  const declaredVersion = isRecord(body) && Number.isSafeInteger(body.version) ? (body.version as number) : undefined;
  if (!jws) return finish({ status: "unreachable" });

  const report = (payload: Record<string, unknown>) =>
    fetchImpl(`${base}/team-policy/applied`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch(() => undefined);

  try {
    const result = await applyTeamPolicy(config, workspace, jws, {
      actor,
      ...(deps.keys ? { keys: deps.keys } : {}),
      now,
    });
    if (result.status === "applied") {
      await report({ version: result.state.version, ok: true, payloadSha256: result.state.payloadSha256 });
    }
    return finish({ status: result.status, version: result.state.version });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (declaredVersion && declaredVersion > 0) {
      await report({ version: declaredVersion, ok: false, code: error.code });
    }
    return finish({ status: "refused", code: error.code, ...(declaredVersion ? { version: declaredVersion } : {}) });
  }
}

/** What the Team screen shows about checking, next to describeTeamPolicyState. */
export function describeTeamPolicySync(record: TeamPolicySyncRecord | null, now = Date.now()) {
  if (!record) return { checkedAt: null, status: null, code: null, lastSuccessAt: null, stale: false };
  return {
    checkedAt: record.checkedAt,
    status: record.status,
    code: record.code ?? null,
    lastSuccessAt: record.lastSuccessAt,
    stale: record.lastSuccessAt === null || now - record.lastSuccessAt > TEAM_POLICY_STALE_AFTER_MS,
  };
}

/**
 * Checks every joined workspace on a timer. Returns a stop function. Failures are logged and never
 * thrown: a check that cannot run must not take the server down, and the last verified policy keeps
 * applying either way.
 */
export function startTeamPolicySync(
  config: ServerConfig,
  deps: TeamPolicySyncDeps,
  logger?: { log: (level: "info" | "warn", message: string, meta?: Record<string, unknown>) => void },
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const runAll = async () => {
    for (const workspace of config.workspaces) {
      if (stopped) return;
      try {
        const state = await readTeamPolicyState(config, workspace.id);
        if (!state || state.left) continue;
        const outcome = await syncTeamPolicy(config, workspace, deps);
        if (outcome.status !== "unchanged") {
          logger?.log("info", "Team policy check", { workspaceId: workspace.id, status: outcome.status, code: outcome.code });
        }
      } catch (error) {
        logger?.log("warn", "Team policy check failed", {
          workspaceId: workspace.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  };

  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      void runAll().finally(() =>
        schedule(TEAM_POLICY_SYNC_INTERVAL_MS + Math.floor((Math.random() * 2 - 1) * SYNC_JITTER_MS)),
      );
    }, delay);
    (timer as { unref?: () => void }).unref?.();
  };
  schedule(STARTUP_DELAY_MS);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
