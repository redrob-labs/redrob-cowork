import { randomBytes } from "node:crypto";
import type { ServerConfig } from "./types.js";
import { createWorkspaceKvStore, isRecord } from "./workspace-kv-store.js";

/**
 * Who this install is, to the people it works with.
 *
 * A handoff names its sender and a live room names everyone in it, so each install needs a
 * stable id and a name a teammate would recognise. Neither is verified: the name is a label the
 * person chose, and the UI says so wherever it shows one. The id never changes once made, so a
 * comment or a message keeps its author across renames.
 */
export type ParticipantProfile = {
  /** `par_` plus 24 hex characters, created on first read. */
  participantId: string;
  /** What teammates see. Empty until the person sets it. */
  displayName: string;
  updatedAt: number;
};

/** One profile per install, so the workspace-keyed table holds it under a reserved key. */
const PROFILE_KEY = "__install__";

/** Matches the design system's NameInput: a real name can be long. */
export const DISPLAY_NAME_MAX_LENGTH = 120;
const PARTICIPANT_ID_RE = /^par_[a-f0-9]{24}$/;

export function createParticipantId(): string {
  return `par_${randomBytes(12).toString("hex")}`;
}

export function isParticipantId(value: unknown): value is string {
  return typeof value === "string" && PARTICIPANT_ID_RE.test(value);
}

/**
 * The name as it will be stored, or an error message. Whitespace runs collapse and control
 * characters are refused rather than stripped: a name that carries a newline or a direction
 * override is not a typo, and quietly fixing it would show the person something they did not type.
 */
export function normalizeDisplayName(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: "displayName must be a string" };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)) {
    return { ok: false, error: "displayName must not contain control characters" };
  }
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (Array.from(collapsed).length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, error: `displayName must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer` };
  }
  return { ok: true, value: collapsed };
}

/** Defensive: the row is user-writable, and a damaged one must not lose the id it still has. */
function parseProfile(json: string): ParticipantProfile | undefined {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed) || !isParticipantId(parsed.participantId)) return undefined;
    const name = normalizeDisplayName(parsed.displayName);
    return {
      participantId: parsed.participantId,
      displayName: name.ok ? name.value : "",
      updatedAt: typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
    };
  } catch {
    return undefined;
  }
}

const profileStore = createWorkspaceKvStore<ParticipantProfile>({
  tableName: "participant_profile",
  valueColumn: "profile_json",
  parse: (json) => parseProfile(json) as ParticipantProfile,
  serialize: (value) => JSON.stringify(value),
});

/** The install's profile, created with a fresh id the first time anything asks. */
export async function readParticipantProfile(config: ServerConfig): Promise<ParticipantProfile> {
  const existing = await profileStore.get(config, PROFILE_KEY);
  if (existing && isParticipantId(existing.participantId)) return existing;
  const created: ParticipantProfile = { participantId: createParticipantId(), displayName: "", updatedAt: Date.now() };
  if (config.readOnly) return created;
  await profileStore.set(config, PROFILE_KEY, created);
  return created;
}

/** Changes the name. The id is never taken from the caller. */
export async function updateParticipantProfile(
  config: ServerConfig,
  patch: { displayName: string },
): Promise<ParticipantProfile> {
  const current = await readParticipantProfile(config);
  const next: ParticipantProfile = { ...current, displayName: patch.displayName, updatedAt: Date.now() };
  await profileStore.set(config, PROFILE_KEY, next);
  return next;
}

export const participantProfileInternals = { PROFILE_KEY, parseProfile };
