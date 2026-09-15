import { resolveWorkspaceOpencodeConnection } from "./opencode-connection.js";
import { ApiError } from "./errors.js";
import { loopbackFetch } from "./server-fetch.js";
import type { ServerConfig } from "./types.js";
import { findManagedEngineWorkspace } from "./workspaces.js";

/**
 * Redrob Code owns the Redrob Key.
 *
 * The engine's auth store (`auth.json`, written only by its own
 * `PUT`/`DELETE /auth/:providerID`) is the single source of truth for the
 * console.redrob.ai credential. Redrob Cowork never persists that value: it
 * collects it during onboarding, hands it straight to the engine, and from then
 * on only *observes* whether the engine holds one.
 *
 * This module is the whole Work-side surface for that relationship —
 * connect/replace, disconnect, status, and a one-shot migration for installs
 * that stored the key in Work's own env store before ownership moved.
 */

/** The one provider id whose credential the engine owns end to end. */
export const REDROB_PROVIDER_ID = "redrob";

/**
 * Where Work used to persist the credential. Only ever read (and then deleted)
 * by the legacy migration below; nothing writes this name any more, and
 * `isReservedEnvKey` rejects it again.
 */
export const LEGACY_REDROB_API_KEY_ENV = "REDROB_API_KEY";

/**
 * Sentinel the engine substitutes for a missing Redrob credential. Its redrob
 * provider loader resolves `ok = env REDROB_API_KEY || auth.get("redrob") ||
 * config.provider.redrob.options.apiKey` and, when that is false, publishes
 * `options.apiKey = "public"` so the free catalog still works unauthenticated.
 * That makes it the engine's own report of "no credential", which is why status
 * reads it rather than guessing.
 */
const ENGINE_PUBLIC_API_KEY_SENTINEL = "public";

export type RedrobAuthSource = "api" | "env" | "config" | "none";

export type RedrobAuthStatus = {
  connected: boolean;
  /**
   * Which engine-side origin supplied the credential. Diagnostic only — it is
   * never the credential itself.
   */
  source: RedrobAuthSource;
};

export type RedrobAuthLogger = {
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
};

/**
 * The engine-facing fetch. Narrower than `typeof fetch` so `loopbackFetch` (and
 * a test double) satisfy it without implementing the static `preconnect` member.
 */
export type RedrobAuthFetch = (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
) => Promise<Response>;

export type RedrobAuthInput = {
  config: ServerConfig;
  fetchImpl?: RedrobAuthFetch;
  logger?: RedrobAuthLogger;
};

type EngineTarget = {
  baseUrl: string;
  headers: Record<string, string>;
  fetchImpl: RedrobAuthFetch;
};

function resolveEngineTarget(input: RedrobAuthInput): EngineTarget {
  const workspace = findManagedEngineWorkspace(input.config.workspaces) ?? input.config.workspaces[0];
  const connection = workspace ? resolveWorkspaceOpencodeConnection(input.config, workspace) : undefined;
  const baseUrl = connection?.baseUrl?.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new ApiError(503, "engine_unavailable", "Redrob Code is not reachable yet");
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (connection?.authHeader) headers.authorization = connection.authHeader;
  return { baseUrl, headers, fetchImpl: input.fetchImpl ?? loopbackFetch };
}

function authUrl(target: EngineTarget): string {
  return `${target.baseUrl}/auth/${encodeURIComponent(REDROB_PROVIDER_ID)}`;
}

/**
 * Store (or rotate) the Redrob Key in the engine's auth store.
 *
 * Rotation needs no separate call: `PUT /auth/redrob` overwrites the entry, so
 * connect and replace are the same request with a different value.
 *
 * Errors are deliberately opaque. The engine's failure body could echo the
 * payload, so nothing from it is forwarded — a caller learns that delivery
 * failed and the status code, never the credential.
 */
export async function putRedrobEngineAuth(input: RedrobAuthInput, key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new ApiError(400, "invalid_redrob_key", "Redrob Key is required");
  }
  const target = resolveEngineTarget(input);
  let response: Response;
  try {
    response = await target.fetchImpl(authUrl(target), {
      method: "PUT",
      headers: target.headers,
      body: JSON.stringify({ type: "api", key: trimmed }),
    });
  } catch (error) {
    input.logger?.error("redrob key delivery to the engine failed", {
      provider_id: REDROB_PROVIDER_ID,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    throw new ApiError(502, "engine_auth_unreachable", "Redrob Code did not accept the Redrob Key");
  }
  if (!response.ok) {
    input.logger?.error("redrob key delivery rejected by the engine", {
      provider_id: REDROB_PROVIDER_ID,
      status: response.status,
    });
    throw new ApiError(502, "engine_auth_rejected", "Redrob Code rejected the Redrob Key");
  }
}

/** Remove the Redrob Key from the engine's auth store. */
export async function deleteRedrobEngineAuth(input: RedrobAuthInput): Promise<void> {
  const target = resolveEngineTarget(input);
  let response: Response;
  try {
    response = await target.fetchImpl(authUrl(target), { method: "DELETE", headers: target.headers });
  } catch (error) {
    input.logger?.error("redrob key removal failed", {
      provider_id: REDROB_PROVIDER_ID,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    throw new ApiError(502, "engine_auth_unreachable", "Redrob Code did not accept the disconnect");
  }
  // A 404 means the entry is already gone, which is the state the caller asked
  // for. Anything else is a real failure to revoke and must not read as success.
  if (!response.ok && response.status !== 404) {
    input.logger?.error("redrob key removal rejected by the engine", {
      provider_id: REDROB_PROVIDER_ID,
      status: response.status,
    });
    throw new ApiError(502, "engine_auth_rejected", "Redrob Code rejected the disconnect");
  }
}

type EngineProviderEntry = {
  id?: unknown;
  source?: unknown;
  key?: unknown;
  options?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Derive connect status from the engine's provider report.
 *
 * Two things make the obvious signals unusable, so this reads deliberately:
 *
 * - `connected: [...]` always contains `redrob`. The engine seeds the console
 *   provider unconditionally and every console model costs 0, so its loader
 *   always autoloads and the id is always listed regardless of credentials.
 * - `source` is confounded. Work registers a `redrob` provider entry for the
 *   model picker, and the engine's config pass runs last and stamps
 *   `source: "config"` over the `"api"` the auth pass set.
 *
 * What survives both is the credential gate itself: `options.apiKey === "public"`
 * exactly when the engine could not resolve a Redrob credential. This requires
 * that marker to be absent *and* independent positive evidence (an api/env
 * source, or a resolved key), so a change to either signal fails closed rather
 * than reporting a credential that is not there.
 *
 * `key` holds the raw credential. It is inspected for presence only and never
 * returned, logged, or forwarded.
 */
export function deriveRedrobAuthStatus(providerList: unknown): RedrobAuthStatus {
  const disconnected: RedrobAuthStatus = { connected: false, source: "none" };
  if (!isRecord(providerList) || !Array.isArray(providerList.all)) return disconnected;
  const entry = providerList.all.find(
    (candidate): candidate is EngineProviderEntry => isRecord(candidate) && candidate.id === REDROB_PROVIDER_ID,
  );
  if (!entry) return disconnected;

  const options = isRecord(entry.options) ? entry.options : {};
  if (options.apiKey === ENGINE_PUBLIC_API_KEY_SENTINEL) return disconnected;

  const source = entry.source;
  const hasResolvedKey = typeof entry.key === "string" && entry.key.trim().length > 0;
  const hasCredentialEvidence = source === "api" || source === "env" || hasResolvedKey;
  if (!hasCredentialEvidence) return disconnected;

  const reportedSource: RedrobAuthSource =
    source === "api" || source === "env" || source === "config" ? source : "api";
  return { connected: true, source: reportedSource };
}

/**
 * Ask the engine whether it currently holds a Redrob credential.
 *
 * Reads the engine's own provider report rather than any Work-side state, so
 * there is nothing to drift. Unreachable is reported as disconnected: a status
 * probe must never take the UI down, and "cannot confirm a credential" is
 * honestly the same as "not connected" for gating purposes.
 */
export async function readRedrobEngineAuthStatus(input: RedrobAuthInput): Promise<RedrobAuthStatus> {
  const target = resolveEngineTarget(input);
  try {
    const response = await target.fetchImpl(`${target.baseUrl}/provider`, { headers: target.headers });
    if (!response.ok) return { connected: false, source: "none" };
    return deriveRedrobAuthStatus(await response.json());
  } catch {
    return { connected: false, source: "none" };
  }
}

export type LegacyRedrobKeyMigration = "none" | "migrated" | "failed";

type EnvStore = {
  list: () => Promise<Array<{ key: string; value: string }>>;
  delete: (key: string) => Promise<boolean>;
};

export type LegacyRedrobKeyMigrationInput = RedrobAuthInput & { env: EnvStore };

/**
 * Runs at most once per process. Repeat status polls must not re-deliver, and
 * two concurrent polls must not both attempt the handoff.
 */
let legacyMigration: Promise<LegacyRedrobKeyMigration> | undefined;
let legacyMigrationCompleted = false;

/** Test seam: forget the once-per-process migration guard. */
export function resetLegacyRedrobKeyMigrationState(): void {
  legacyMigration = undefined;
  legacyMigrationCompleted = false;
}

/**
 * Hand a pre-ownership credential to the engine and drop Work's copy.
 *
 * Installs created before Redrob Code owned the key have it sitting in Work's
 * env store under `REDROB_API_KEY`. Those users must not have to re-paste it,
 * and the value must not linger in two places.
 *
 * Ordering is the whole point: deliver first, delete only after the engine has
 * confirmed. A delete-first migration that hit an unreachable engine would
 * destroy the only copy of the user's credential.
 *
 * This is driven from the authenticated status route rather than from server
 * start on purpose. At boot the engine may not be listening yet, so a failed
 * delivery would be the normal case and would leave the retry logic racing
 * engine startup; by the time the app asks for status the engine is up.
 *
 * The value is never logged, returned, or included in any response.
 */
export async function migrateLegacyRedrobKey(
  input: LegacyRedrobKeyMigrationInput,
): Promise<LegacyRedrobKeyMigration> {
  // Already handed over in this process: report what this call did, which is
  // nothing, rather than replaying an earlier outcome forever.
  if (legacyMigrationCompleted) return "none";
  const result = await (legacyMigration ??= runLegacyRedrobKeyMigration(input));
  if (result === "failed") {
    // Not terminal: the credential is still in the store, so let a later status
    // poll retry once the engine is reachable.
    legacyMigration = undefined;
    return "failed";
  }
  legacyMigrationCompleted = true;
  return result;
}

async function runLegacyRedrobKeyMigration(
  input: LegacyRedrobKeyMigrationInput,
): Promise<LegacyRedrobKeyMigration> {
  let legacyValue = "";
  try {
    const records = await input.env.list();
    legacyValue = records.find((record) => record.key === LEGACY_REDROB_API_KEY_ENV)?.value?.trim() ?? "";
  } catch {
    // An unreadable store has nothing to migrate and is surfaced by the env
    // routes themselves; status must not fail because of it.
    return "none";
  }
  if (!legacyValue) return "none";

  try {
    await putRedrobEngineAuth(input, legacyValue);
  } catch {
    input.logger?.warn("legacy redrob key migration deferred", { provider_id: REDROB_PROVIDER_ID });
    return "failed";
  }

  try {
    await input.env.delete(LEGACY_REDROB_API_KEY_ENV);
  } catch {
    // The engine holds it now, which is the state that matters. Report success
    // and let the next poll retry the cleanup.
    input.logger?.warn("legacy redrob key delivered but not yet removed from the Work store", {
      provider_id: REDROB_PROVIDER_ID,
    });
  }
  return "migrated";
}
