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

/** At most what the engine accepts for one request, checked here so a bad request never reaches it. */
const MAX_SPEECH_CHARACTERS = 4_096;

/**
 * Speak text on the engine's Redrob credential and return the audio, for read-aloud in the app.
 *
 * The engine's `POST /redrob/speech` holds the key and calls the gateway; this only relays. Work
 * never sees the credential here either, which is the point of going through the engine rather than
 * calling the console with a key of its own.
 *
 * The engine's refusals keep their status and message: 400 for text it will not speak, 503 when no
 * Redrob credential is connected, 502 and 504 for the gateway's own failures.
 */
export async function speakWithRedrobEngine(
  input: RedrobAuthInput,
  payload: { text: string; voice?: string; model?: string },
): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const text = payload.text.trim();
  if (!text) throw new ApiError(400, "speech_text_missing", "Give the words to speak.");
  if ([...text].length > MAX_SPEECH_CHARACTERS) {
    throw new ApiError(400, "speech_text_too_long", `Speak at most ${MAX_SPEECH_CHARACTERS} characters at a time.`);
  }
  const target = resolveEngineTarget(input);
  let response: Response;
  try {
    response = await target.fetchImpl(`${target.baseUrl}/redrob/speech`, {
      method: "POST",
      headers: target.headers,
      body: JSON.stringify({
        text,
        ...(payload.voice ? { voice: payload.voice } : {}),
        ...(payload.model ? { model: payload.model } : {}),
      }),
    });
  } catch {
    throw new ApiError(503, "engine_unavailable", "Redrob Code is not reachable yet");
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = isRecord(body) && typeof body.message === "string" ? body.message : "Speech could not be made.";
    if (response.status === 503) throw new ApiError(503, "redrob_not_connected", message);
    if (response.status === 400) throw new ApiError(400, "speech_invalid", message);
    throw new ApiError(response.status === 504 ? 504 : 502, "speech_failed", message);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!contentType.startsWith("audio/")) {
    throw new ApiError(502, "speech_failed", "Redrob Code answered speech with something that is not audio.");
  }
  return { audio: await response.arrayBuffer(), contentType };
}

/** The containers the engine accepts, which are the ones the gateway's upstream documents. */
const TRANSCRIPTION_FORMATS = new Set(["wav", "mp3", "flac", "m4a", "ogg", "webm", "aac"]);

/** The engine's limit, 10 MB decoded, as base64 characters, so an over-size clip never reaches it. */
const MAX_TRANSCRIPTION_BASE64 = Math.ceil((10 * 1024 * 1024) / 3) * 4;

/**
 * Transcribe a recording on the engine's Redrob credential, for push-to-talk in the app. It relays
 * the same way read-aloud does, through the engine's `POST /redrob/transcribe`, so Work never holds
 * the credential, and the engine's refusals keep their status and message.
 */
export async function transcribeWithRedrobEngine(
  input: RedrobAuthInput,
  payload: { audio: string; format: string; language?: string },
): Promise<{ text: string; seconds?: number; costUsd?: number }> {
  if (!payload.audio) throw new ApiError(400, "transcription_audio_missing", "Give the audio to transcribe.");
  if (payload.audio.length > MAX_TRANSCRIPTION_BASE64) {
    throw new ApiError(400, "transcription_audio_too_large", "Transcribe at most 10 MB of audio at a time.");
  }
  if (!TRANSCRIPTION_FORMATS.has(payload.format)) {
    throw new ApiError(400, "transcription_format_unsupported", `Audio in ${payload.format || "no"} format cannot be transcribed.`);
  }
  const target = resolveEngineTarget(input);
  let response: Response;
  try {
    response = await target.fetchImpl(`${target.baseUrl}/redrob/transcribe`, {
      method: "POST",
      headers: target.headers,
      body: JSON.stringify({
        audio: payload.audio,
        format: payload.format,
        ...(payload.language ? { language: payload.language } : {}),
      }),
    });
  } catch {
    throw new ApiError(503, "engine_unavailable", "Redrob Code is not reachable yet");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.message === "string" ? body.message : "Speech could not be transcribed.";
    if (response.status === 503) throw new ApiError(503, "redrob_not_connected", message);
    if (response.status === 400) throw new ApiError(400, "transcription_invalid", message);
    throw new ApiError(response.status === 504 ? 504 : 502, "transcription_failed", message);
  }
  if (!isRecord(body) || typeof body.text !== "string") {
    throw new ApiError(502, "transcription_failed", "Redrob Code answered without a transcript.");
  }
  return {
    text: body.text,
    ...(typeof body.seconds === "number" ? { seconds: body.seconds } : {}),
    ...(typeof body.costUsd === "number" ? { costUsd: body.costUsd } : {}),
  };
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
 * The Redrob Key the engine resolved, for the one in-process caller that has to present it to the
 * console itself: team policy sync (team-policy/sync.ts), which fetches the workspace's signed
 * policy with it. The same gate as status applies, so the engine's "public" sentinel is never
 * mistaken for a key. The value is read at the moment it is needed and never stored, logged or
 * returned to a client; ownership stays with the engine.
 */
export function extractRedrobEngineKey(providerList: unknown): string | null {
  if (!deriveRedrobAuthStatus(providerList).connected) return null;
  if (!isRecord(providerList) || !Array.isArray(providerList.all)) return null;
  const entry = providerList.all.find(
    (candidate): candidate is EngineProviderEntry => isRecord(candidate) && candidate.id === REDROB_PROVIDER_ID,
  );
  const options = entry && isRecord(entry.options) ? entry.options : {};
  for (const value of [entry?.key, options.apiKey]) {
    if (typeof value === "string" && value.trim() && value !== ENGINE_PUBLIC_API_KEY_SENTINEL) return value.trim();
  }
  return null;
}

export async function readRedrobEngineKey(input: RedrobAuthInput): Promise<string | null> {
  let target: EngineTarget;
  try {
    target = resolveEngineTarget(input);
  } catch {
    return null;
  }
  try {
    const response = await target.fetchImpl(`${target.baseUrl}/provider`, { headers: target.headers });
    if (!response.ok) return null;
    return extractRedrobEngineKey(await response.json());
  } catch {
    return null;
  }
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
