import type { PrivacyLevel, PrivacyState } from "../services/types";

/** Where a workspace keeps its privacy settings, in its redrob config. */
export const COWORK_PRIVACY_CONFIG_KEY = "coworkPrivacy";

/** Protection is on from the start, at the level with the fewest surprises. */
export const DEFAULT_PRIVACY_LEVEL: PrivacyLevel = "standard";

const LEVELS: readonly PrivacyLevel[] = ["off", "standard", "high", "strict"];

export type StoredPrivacy = PrivacyState;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A workspace's privacy settings, read from its redrob config; the defaults where nothing is set. */
export function readStoredPrivacy(redrob: Record<string, unknown> | null | undefined): StoredPrivacy {
  const value = redrob?.[COWORK_PRIVACY_CONFIG_KEY];
  const stored = isRecord(value) ? value : {};
  const level = LEVELS.find((entry) => entry === stored.level) ?? DEFAULT_PRIVACY_LEVEL;
  const names = Array.isArray(stored.names)
    ? stored.names.filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    : [];
  const setBy = typeof stored.setBy === "string" && stored.setBy.trim() ? stored.setBy.trim() : null;
  return { level, names, setBy, locked: stored.locked === true };
}
