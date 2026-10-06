import { LOCKED_MEMORY_TAG } from "./local-memory-store.js";

/*
 * What a team file locks: the workspace's privacy setting and the team's notes. Only the
 * machine's owner can set, lift or change a lock. A collaborator token works under a lock
 * but cannot move it, so sharing a workspace never hands out the power to unlock it.
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
