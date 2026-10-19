/*
 * Cowork follows Redrob Launcher's language (redrob-launcher docs/shared-language.md).
 *
 * The launcher writes `language.json` in the shared Redrob directory; the desktop app reads it
 * through a read-only bridge (`__readSharedLanguage`) and never writes it. Order of precedence for
 * Cowork, as the launcher's contract defines it:
 *   1. a language the person picked inside Cowork (onboarding or Settings; source `app`),
 *   2. the launcher's per-app override `apps["redrob-cowork"]`,
 *   3. the launcher's suite language,
 *   4. what Cowork already had (its stored value, else English).
 * A code Cowork has no translation for draws in English (contract rule 4). The file is read at
 * startup and again whenever the window regains focus (rule 3), so a change in the launcher's
 * Settings shows up the next time Cowork is brought forward.
 *
 * A language stored before this sync existed carries no source. It is treated as following the
 * launcher: the person never had a launcher to follow before, and the point of this change is that
 * the two agree. Picking a language in Cowork's Settings makes it an `app` choice again, and the
 * "Same as Redrob Launcher" option goes back to following.
 */
import { readLauncherLanguage, type SharedLanguageReading } from "../app/lib/desktop";
import { isLanguage, LANGUAGE_SOURCE_KEY, setLocale, type Language, type LanguageSource } from "./index";

/** The language the launcher asks Cowork to use, or null when the file names none. */
export function launcherLocale(reading: SharedLanguageReading | null): Language | null {
  const code = reading?.app ?? reading?.language ?? null;
  if (!code) return null;
  // `pt-br` and friends: Cowork's languages are bare codes. Untranslated codes draw in English.
  const base = code.split("-")[0] ?? code;
  return isLanguage(base) ? base : "en";
}

/** Whether the stored language is Cowork's own pick (it then wins over the launcher). */
export function hasAppLanguagePick(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(LANGUAGE_SOURCE_KEY) === ("app" satisfies LanguageSource);
  } catch {
    return false;
  }
}

/** What Settings needs to offer "Same as Redrob Launcher (X)". */
export type LauncherLanguageState = {
  /** The launcher's language for Cowork, or null when there is no launcher file. */
  locale: Language | null;
  /** True while Cowork follows the launcher rather than its own pick. */
  following: boolean;
};

let state: LauncherLanguageState = { locale: null, following: false };
const listeners = new Set<() => void>();

function publish(next: LauncherLanguageState) {
  if (next.locale === state.locale && next.following === state.following) return;
  state = next;
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore. */
export function subscribeToLauncherLanguage(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** For useSyncExternalStore. */
export function launcherLanguageState(): LauncherLanguageState {
  return state;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Reads the launcher's file and, unless the person picked a language in Cowork, applies it. */
export async function syncLauncherLanguage(read: () => Promise<SharedLanguageReading | null> = readLauncherLanguage): Promise<void> {
  const locale = launcherLocale(await read());
  const following = locale !== null && !hasAppLanguagePick(storage());
  publish({ locale, following });
  if (following && locale) setLocale(locale, { source: "launcher" });
}

/** "Same as Redrob Launcher": drop Cowork's own pick and follow the launcher again. */
export async function followLauncherLanguage(read: () => Promise<SharedLanguageReading | null> = readLauncherLanguage): Promise<void> {
  try {
    storage()?.setItem(LANGUAGE_SOURCE_KEY, "launcher" satisfies LanguageSource);
  } catch {
    // Storage is unavailable; the sync below still applies the launcher's language for this run.
  }
  await syncLauncherLanguage(read);
}

/** A language picked in Cowork's Settings: Cowork's own choice from now on. */
export function pickAppLanguage(language: Language): void {
  setLocale(language, { source: "app" });
  publish({ locale: state.locale, following: false });
}

let started = false;

/** Read at startup and on every window focus. Safe to call more than once. */
export function startLauncherLanguageSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  void syncLauncherLanguage();
  window.addEventListener("focus", () => void syncLauncherLanguage());
}
