import { create } from "zustand";

import { t } from "../../../i18n";
import { readStoredPrivacy, usePrivacyMapStore } from "./privacy-store";
import {
  PLACEHOLDER_INSTRUCTION,
  foundCategories,
  redact,
  type PlaceholderMap,
  type PrivacySettings,
  type RedactCategory,
} from "./redact";

type ConfigClient = { getConfig(workspaceId: string): Promise<{ redrob: Record<string, unknown> }> };

const SETTINGS_TTL_MS = 5_000;
const settingsCache = new WeakMap<object, Map<string, { at: number; settings: PrivacySettings }>>();

/** A workspace's level and names, read once and reused for a few seconds. */
export async function privacySettingsFor(client: ConfigClient, workspaceId: string, now = Date.now()): Promise<PrivacySettings> {
  let byWorkspace = settingsCache.get(client);
  if (!byWorkspace) {
    byWorkspace = new Map();
    settingsCache.set(client, byWorkspace);
  }
  const cached = byWorkspace.get(workspaceId);
  if (cached && now - cached.at < SETTINGS_TTL_MS) return cached.settings;
  const stored = readStoredPrivacy((await client.getConfig(workspaceId)).redrob);
  const settings = { level: stored.level, names: stored.names };
  byWorkspace.set(workspaceId, { at: now, settings });
  return settings;
}

/** Forgets the cached settings, after the Privacy screen changes them. */
export function clearPrivacySettings(client: object) {
  settingsCache.delete(client);
}

/**
 * One send's redaction: every piece of text the model will read goes through the same
 * placeholder map, so a detail is the same placeholder in the message, the notes and the
 * check. `commit` keeps the map for the chat once the send goes ahead.
 */
export function createSendRedactor(settings: PrivacySettings, previous: PlaceholderMap) {
  let map: PlaceholderMap = { ...previous };
  const found: RedactCategory[] = [];
  const redactText = (value: string): string => {
    const result = redact(value, settings, map);
    map = result.map;
    found.push(...result.found);
    return result.text;
  };
  return {
    text: redactText,
    parts<P extends { type: string }>(parts: P[]): P[] {
      return parts.map((part) => ("text" in part && typeof part.text === "string" && part.type === "text" ? { ...part, text: redactText(part.text) } : part));
    },
    get found(): readonly RedactCategory[] {
      return found;
    },
    get map(): PlaceholderMap {
      return map;
    },
    /** The system line to add while the chat carries placeholders, from this send or an earlier one. */
    instruction(): string | null {
      return Object.keys(map).length ? PLACEHOLDER_INSTRUCTION : null;
    },
    commit(sessionId: string) {
      if (found.length) usePrivacyMapStore.getState().remember(sessionId, map, found);
    },
  };
}

/** What a Strict send would hide, before anything is sent. */
export function previewRedaction(text: string, settings: PrivacySettings, previous: PlaceholderMap) {
  return redact(text, settings, previous).found;
}

export type PrivacyConfirm = { count: number; kinds: RedactCategory[]; resolve: (send: boolean) => void };

type PrivacyConfirmState = {
  pending: PrivacyConfirm | null;
  /** Asks whether to send with the details hidden; resolves false for Edit. */
  ask(found: readonly RedactCategory[]): Promise<boolean>;
  answer(send: boolean): void;
};

export const usePrivacyConfirmStore = create<PrivacyConfirmState>()((set, get) => ({
  pending: null,
  ask: (found) =>
    new Promise<boolean>((resolve) => {
      get().pending?.resolve(false);
      set({ pending: { count: found.length, kinds: foundCategories(found), resolve } });
    }),
  answer: (send) => {
    const pending = get().pending;
    set({ pending: null });
    pending?.resolve(send);
  },
}));

/** The kinds of detail, in words, for the Strict confirm. */
export function kindsLabel(kinds: readonly RedactCategory[]): string {
  const label: Record<RedactCategory, () => string> = {
    email: () => t("desk.privacy_kind_email"),
    phone: () => t("desk.privacy_kind_phone"),
    rrn: () => t("desk.privacy_kind_rrn"),
    brn: () => t("desk.privacy_kind_brn"),
    card: () => t("desk.privacy_kind_card"),
    account: () => t("desk.privacy_kind_account"),
    address: () => t("desk.privacy_kind_address"),
    name: () => t("desk.privacy_kind_name"),
  };
  return kinds.map((kind) => label[kind]()).join(", ");
}
