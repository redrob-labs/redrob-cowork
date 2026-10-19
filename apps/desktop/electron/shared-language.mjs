// Read-only access to Redrob Launcher's shared language file (redrob-launcher docs/shared-language.md).
//
// The launcher is the file's ONLY writer; this module never writes, creates or deletes it. It reads
// `language.json` from the shared Redrob directory and hands the renderer the three facts it needs:
// the suite language, whether a person chose it, and Cowork's own per-app override.

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Cowork's app id in the launcher's catalogue (`apps[...]` key in language.json). */
export const COWORK_LAUNCHER_APP_ID = "redrob-cowork";

/** The file is a few hundred bytes; anything far larger is not the launcher's file. */
const MAX_BYTES = 64 * 1024;

/** A language code as the launcher writes it: lowercase letters, optionally a region (`en`, `ko`, `pt-br`). */
const CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

/**
 * The shared Redrob directory, as the launcher computes it: `REDROB_SHARED_DIR` when set and not
 * empty, else `%APPDATA%\Redrob\Shared` (Windows), `~/Library/Application Support/ai.redrob.shared`
 * (macOS), `$XDG_CONFIG_HOME/redrob-shared` or `~/.config/redrob-shared` (Linux).
 */
export function sharedRedrobDir(env = process.env, platform = process.platform, home = os.homedir()) {
  const override = env.REDROB_SHARED_DIR?.trim();
  if (override) return override;
  if (platform === "win32") {
    const appData = env.APPDATA?.trim() || path.join(home, "AppData", "Roaming");
    return path.join(appData, "Redrob", "Shared");
  }
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "ai.redrob.shared");
  const config = env.XDG_CONFIG_HOME?.trim() || path.join(home, ".config");
  return path.join(config, "redrob-shared");
}

/**
 * The parsed file reduced to what Cowork uses, or null when it says nothing usable. An unknown or
 * malformed field is dropped rather than trusted, so a bad file means "follow your own setting".
 */
export function parseSharedLanguage(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const clean = (value) => (typeof value === "string" && CODE.test(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null);
  const language = clean(data.language);
  const app = data.apps && typeof data.apps === "object" ? clean(data.apps[COWORK_LAUNCHER_APP_ID]) : null;
  if (!language && !app) return null;
  return { language, chosen: data.chosen === true, app };
}

/** Reads the launcher's language file; null when it is missing, too large or unreadable. */
export async function readSharedLanguage(dir = sharedRedrobDir()) {
  try {
    const buffer = await readFile(path.join(dir, "language.json"));
    if (buffer.byteLength > MAX_BYTES) return null;
    return parseSharedLanguage(buffer.toString("utf8"));
  } catch {
    return null;
  }
}
