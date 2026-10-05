import { create, type StateCreator } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { PrivacyLevel, PrivacyState } from "../services/types";
import type { PlaceholderMap, RedactCategory } from "./redact";

/** Where a workspace keeps its privacy settings, in its redrob config. */
export const DESK_PRIVACY_CONFIG_KEY = "deskPrivacy";

/** Protection is on from the start, at the level with the fewest surprises. */
export const DEFAULT_PRIVACY_LEVEL: PrivacyLevel = "standard";

const LEVELS: readonly PrivacyLevel[] = ["off", "standard", "high", "strict"];

export type StoredPrivacy = Omit<PrivacyState, "detailsKeptThisWeek">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A workspace's privacy settings, read from its redrob config; the defaults where nothing is set. */
export function readStoredPrivacy(redrob: Record<string, unknown> | null | undefined): StoredPrivacy {
  const value = redrob?.[DESK_PRIVACY_CONFIG_KEY];
  const stored = isRecord(value) ? value : {};
  const level = LEVELS.find((entry) => entry === stored.level) ?? DEFAULT_PRIVACY_LEVEL;
  const names = Array.isArray(stored.names)
    ? stored.names.filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    : [];
  const setBy = typeof stored.setBy === "string" && stored.setBy.trim() ? stored.setBy.trim() : null;
  return { level, names, setBy, locked: stored.locked === true };
}

/** The ISO week a moment falls in, as "2026-W41": the counter starts again each week. */
export function weekKey(at: number): string {
  const date = new Date(at);
  const day = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 3));
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type PrivacyMapState = {
  /** Per chat: placeholder to the real value. Kept on this computer only. */
  maps: Record<string, PlaceholderMap>;
  kept: { week: string; count: number };
  remember(sessionId: string, map: PlaceholderMap, found: readonly RedactCategory[], at?: number): void;
  /** A chat that starts from another one (a fork, a compare) reads its placeholders too. */
  share(fromSessionId: string, toSessionId: string): void;
  keptThisWeek(at?: number): number;
};

export const PRIVACY_MAP_STORE_KEY = "redrob.desk.privacy-map.v1";

export function createPrivacyMapStore(options: { storage?: () => StateStorage } = {}) {
  const initializer: StateCreator<PrivacyMapState> = (set, get) => ({
    maps: {},
    kept: { week: "", count: 0 },
    remember: (sessionId, map, found, at = Date.now()) =>
      set((state) => {
        const week = weekKey(at);
        const count = (state.kept.week === week ? state.kept.count : 0) + found.length;
        return { maps: { ...state.maps, [sessionId]: { ...state.maps[sessionId], ...map } }, kept: { week, count } };
      }),
    share: (fromSessionId, toSessionId) =>
      set((state) => {
        const from = state.maps[fromSessionId];
        return from ? { maps: { ...state.maps, [toSessionId]: { ...from, ...state.maps[toSessionId] } } } : {};
      }),
    keptThisWeek: (at = Date.now()) => {
      const { kept } = get();
      return kept.week === weekKey(at) ? kept.count : 0;
    },
  });
  if (!options.storage) return create<PrivacyMapState>()(initializer);
  return create<PrivacyMapState>()(
    persist(initializer, {
      name: PRIVACY_MAP_STORE_KEY,
      storage: createJSONStorage(options.storage),
      partialize: (state) => ({ maps: state.maps, kept: state.kept }),
    }),
  );
}

export const usePrivacyMapStore = createPrivacyMapStore({ storage: () => localStorage });

const EMPTY_MAP: PlaceholderMap = {};

/** The placeholders of one chat, for showing it with the real values. */
export function usePlaceholderMap(sessionId: string | null | undefined): PlaceholderMap {
  return usePrivacyMapStore((state) => (sessionId ? state.maps[sessionId] : undefined) ?? EMPTY_MAP);
}
