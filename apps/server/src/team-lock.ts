import { LOCKED_MEMORY_TAG } from "./local-memory-store.js";

/*
 * Locks on the workspace's privacy setting and on team notes. Only a verified team policy sets
 * one (team-policy/apply.ts writes them directly, never through a route): an unsigned team file
 * proves nothing about who made it, so it cannot lock anything, and no route sets a lock for any
 * token.
 *
 * Earlier builds let a team file lock them. Those locks may still be on disk, so lifting or
 * changing one, or removing such a note, stays the machine owner's. A collaborator token works
 * under any lock but cannot move it.
 */

/** Matches DESK_PRIVACY_CONFIG_KEY in apps/app/src/react-app/desk/privacy/privacy-store.ts. */
export const DESK_PRIVACY_CONFIG_KEY = "deskPrivacy";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const lockedPrivacy = (redrob: Record<string, unknown>) => {
  const privacy = redrob[DESK_PRIVACY_CONFIG_KEY];
  return isRecord(privacy) && privacy.locked === true;
};

/** Whether going from `before` to `after` sets, lifts or changes a locked privacy setting. */
export function touchesPrivacyLock(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  if (!lockedPrivacy(before) && !lockedPrivacy(after)) return false;
  return stable(before[DESK_PRIVACY_CONFIG_KEY]) !== stable(after[DESK_PRIVACY_CONFIG_KEY]);
}

/** Whether `after` holds a locked privacy setting that `before` does not hold as it is: a new lock. */
export function setsPrivacyLock(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  return lockedPrivacy(after) && stable(before[DESK_PRIVACY_CONFIG_KEY]) !== stable(after[DESK_PRIVACY_CONFIG_KEY]);
}

/** The redrob config an import would leave behind, for the lock check. */
export function redrobAfterImport(before: Record<string, unknown>, payload: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(payload.redrob)) return before;
  const replace = isRecord(payload.mode) && payload.mode.redrob === "replace";
  return replace ? payload.redrob : { ...before, ...payload.redrob };
}

/** Whether a note's tags would lock it. */
export function carriesLockTag(tags: readonly string[] | null | undefined): boolean {
  return tags?.includes(LOCKED_MEMORY_TAG) ?? false;
}
