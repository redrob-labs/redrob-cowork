import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const MAX_CONFIG_ROOT_LENGTH = 4_096;
const FORBIDDEN_CONFIG_ROOT_CHARS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function pathApi(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function invalidWindowsWorkspaceRoot(value) {
  const error = new TypeError(`Invalid Windows workspace root: ${value}`);
  Object.defineProperty(error, "code", { value: "invalid_workspace_root" });
  return error;
}

function isWindowsDeviceNamespace(value) {
  return /^\\\\[?.]\\/.test(value);
}

/**
 * Normalizes Windows verbatim drive and UNC paths without consulting the
 * filesystem. Missing drives and disconnected shares must remain unchanged so
 * callers can report their real accessibility error instead of resolving them
 * against another drive.
 */
export function normalizeWorkspaceRootPath(value, opts) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || optionPlatform(opts) !== "win32") return trimmed;

  const windowsPath = trimmed.replace(/\//g, "\\");
  let normalized = windowsPath;
  if (windowsPath.startsWith("\\\\?\\")) {
    const verbatimPath = windowsPath.slice(4);
    if (/^UNC(?:\\|$)/i.test(verbatimPath)) {
      const uncPath = verbatimPath.slice(3).replace(/^\\/, "");
      const [server, share] = uncPath.split("\\");
      if (!server || !share) throw invalidWindowsWorkspaceRoot(trimmed);
      normalized = `\\\\${uncPath}`;
    } else {
      if (!/^[A-Za-z]:\\/.test(verbatimPath)) throw invalidWindowsWorkspaceRoot(trimmed);
      normalized = verbatimPath;
    }
  }

  if (isWindowsDeviceNamespace(normalized)) {
    throw invalidWindowsWorkspaceRoot(trimmed);
  }

  if (/^[A-Za-z]:(?!\\)/.test(normalized)) {
    throw invalidWindowsWorkspaceRoot(trimmed);
  }
  if (normalized.startsWith("\\")) {
    if (!normalized.startsWith("\\\\")) throw invalidWindowsWorkspaceRoot(trimmed);
    const [server, share] = normalized.slice(2).split("\\");
    if (!server || !share) throw invalidWindowsWorkspaceRoot(trimmed);
  }
  return normalized;
}

function optionEnv(opts) {
  return opts?.env ?? process.env;
}

function optionPlatform(opts) {
  return opts?.platform ?? process.platform;
}

function envValue(env, key) {
  return String(env?.[key] ?? "").trim();
}

function envRawValue(env, key) {
  const value = env?.[key];
  return typeof value === "string" ? value : "";
}

function optionHomeDir(opts) {
  const configured = opts?.homeDir?.trim();
  if (configured) return configured;
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const fromEnv = platform === "win32"
    ? envValue(env, "USERPROFILE") || envValue(env, "HOME")
    : envValue(env, "HOME");
  return fromEnv || homedir();
}

function defaultRedrobConfigDir(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const homeDir = optionHomeDir(opts);
  if (platform === "win32") {
    const appData = envValue(env, "APPDATA");
    const root = appData || paths.join(homeDir, "AppData", "Roaming");
    return paths.join(root, "redrob");
  }
  const xdgConfigHome = envValue(env, "XDG_CONFIG_HOME");
  const root = xdgConfigHome || paths.join(homeDir, ".config");
  return paths.join(root, "redrob");
}

export function redrobConfigDir(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const override = envValue(env, "REDROB_SERVER_CONFIG");
  if (override) return paths.dirname(paths.resolve(override));
  return defaultRedrobConfigDir(opts);
}

export function redrobServerConfigPath(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const override = envValue(env, "REDROB_SERVER_CONFIG");
  if (override) return paths.resolve(override);
  return paths.join(defaultRedrobConfigDir(opts), "server.json");
}

export function redrobEnvStorePath(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const override = envValue(env, "REDROB_ENV_STORE");
  if (override) return paths.resolve(override);
  return paths.join(defaultRedrobConfigDir(opts), "env.json");
}

function safeConfigRoot(value, paths) {
  return value.length > 0
    && value.length <= MAX_CONFIG_ROOT_LENGTH
    && paths.isAbsolute(value)
    && !FORBIDDEN_CONFIG_ROOT_CHARS.test(value);
}

/**
 * Directory the engine loads its global config from.
 *
 * This must track Redrob Code, not upstream OpenCode: the engine resolves
 * `${XDG_CONFIG_HOME:-$HOME/.config}/redrob` (packages/core/src/global.ts) and
 * reads `redrob.json` / `redrob.jsonc` inside it. It reads `REDROB_CONFIG_DIR`
 * as the explicit override; `OPENCODE_CONFIG_DIR` is honoured only as a legacy
 * fallback so an existing dev setup keeps working.
 */
export function globalEngineConfigDir(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  for (const name of ["REDROB_CONFIG_DIR", "OPENCODE_CONFIG_DIR"]) {
    const configuredDirectory = envRawValue(env, name);
    if (safeConfigRoot(configuredDirectory, paths)) return configuredDirectory;
  }

  const configuredRoot = envRawValue(env, "XDG_CONFIG_HOME");
  const configRoot = safeConfigRoot(configuredRoot, paths)
    ? configuredRoot
    : paths.join(optionHomeDir(opts), ".config");
  // REDROB_CONFIG_DIR names the directory that CONTAINS redrob.json(c). It is
  // not an XDG parent directory, which is why the app name is appended here and
  // not there.
  return paths.join(configRoot, "redrob");
}

/** Global config file to read or write. Prefers JSONC, which the engine ranks higher. */
export function resolveGlobalEngineConfigPath(opts) {
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const base = globalEngineConfigDir(opts);
  const jsonc = paths.join(base, "redrob.jsonc");
  const json = paths.join(base, "redrob.json");
  if (existsSync(jsonc)) return jsonc;
  if (existsSync(json)) return json;
  return jsonc;
}

/**
 * Workspace-level user config, in the engine's own load order.
 *
 * Deliberately only the workspace ROOT files. The engine also reads
 * `redrob.json(c)` inside `.opencode/` and `.redrob/`, but `.opencode/redrob.json`
 * is already Redrob Work's own managed runtime config (`redrobConfigPath` in
 * apps/server/src/workspace-files.ts), so listing those here would point the
 * user-config editor at a file the app owns. Root files load BEFORE the
 * directory files, so a Work-managed key still wins over a user key -- the
 * precedence that held before this contract was fixed.
 */
export function workspaceEngineConfigCandidates(workspaceRoot) {
  return [
    path.join(workspaceRoot, "redrob.jsonc"),
    path.join(workspaceRoot, "redrob.json"),
  ];
}

export function resolveWorkspaceEngineConfigPath(workspaceRoot) {
  const candidates = workspaceEngineConfigCandidates(workspaceRoot);
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

/**
 * Files earlier versions of Redrob Work wrote and the engine never read.
 *
 * The app used upstream OpenCode's filenames (`opencode.json(c)`) while the
 * engine had already moved to `redrob.json(c)`, so anything configured through
 * the UI -- MCP servers, plugins -- landed in a file nothing loaded. These are
 * read-only migration sources; nothing writes them again.
 */
export function legacyWorkspaceConfigCandidates(workspaceRoot) {
  return [
    path.join(workspaceRoot, "opencode.jsonc"),
    path.join(workspaceRoot, "opencode.json"),
    path.join(workspaceRoot, ".opencode", "opencode.jsonc"),
    path.join(workspaceRoot, ".opencode", "opencode.json"),
  ];
}

/** Legacy global config files, for the same one-way migration. */
export function legacyGlobalConfigCandidates(opts) {
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const env = optionEnv(opts);
  const configuredRoot = envRawValue(env, "XDG_CONFIG_HOME");
  const configRoot = safeConfigRoot(configuredRoot, paths)
    ? configuredRoot
    : paths.join(optionHomeDir(opts), ".config");
  const base = paths.join(configRoot, "opencode");
  return [paths.join(base, "opencode.jsonc"), paths.join(base, "opencode.json")];
}


function desktopConfigDir(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const xdgConfigHome = envValue(env, "XDG_CONFIG_HOME");
  if (xdgConfigHome) return xdgConfigHome;
  if (platform === "win32") {
    const localAppData = envValue(env, "LOCALAPPDATA");
    if (localAppData) return localAppData;
    return paths.join(optionHomeDir(opts), "AppData", "Local");
  }
  return paths.join(optionHomeDir(opts), ".config");
}

export function desktopBootstrapPath(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const override = envValue(env, "REDROB_DESKTOP_BOOTSTRAP_PATH");
  if (override) return override;
  if (envValue(env, "REDROB_DEV_MODE") === "1" && opts?.userDataDir) {
    return paths.join(opts.userDataDir, "redrob-dev-data", "home", ".config", "redrob", "desktop-bootstrap.json");
  }
  return paths.join(desktopConfigDir(opts), "redrob", "desktop-bootstrap.json");
}

export function legacyDesktopBootstrapPath(opts) {
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  // Existing installers may have written this file using USERPROFILE/HOME while
  // Electron used os.homedir(). optionHomeDir accepts an explicit homeDir but
  // otherwise checks the same env variables before os.homedir(), so both legacy
  // locations continue to resolve for normal installs.
  return paths.join(optionHomeDir(opts), ".config", "redrob", "desktop-bootstrap.json");
}

export function expandHomePath(value, opts) {
  if (value === "~") return optionHomeDir(opts);
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return pathApi(optionPlatform(opts)).join(optionHomeDir(opts), value.slice(2));
  }
  return value;
}

export function redrobServerDataDir(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const override = envValue(env, "REDROB_DATA_DIR");
  if (override) return expandHomePath(override, opts);
  return paths.join(optionHomeDir(opts), ".redrob", "redrob-server");
}

export function opencodeDataDirs(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const homeDir = optionHomeDir(opts);
  const dirs = [];
  const xdgDataHome = envValue(env, "XDG_DATA_HOME");
  if (xdgDataHome) dirs.push(paths.join(xdgDataHome, "opencode"));
  dirs.push(paths.join(homeDir, ".local", "share", "opencode"));
  if (platform === "darwin") dirs.push(paths.join(homeDir, "Library", "Application Support", "opencode"));
  if (platform === "win32") {
    const appData = envValue(env, "APPDATA") || paths.join(homeDir, "AppData", "Roaming");
    dirs.push(paths.join(appData, "opencode"));
  }
  return Array.from(new Set(dirs));
}

export function opencodeCacheDirs(opts) {
  const env = optionEnv(opts);
  const platform = optionPlatform(opts);
  const paths = pathApi(platform);
  const dirs = [];
  const xdgCacheHome = envValue(env, "XDG_CACHE_HOME");
  if (xdgCacheHome) dirs.push(paths.join(xdgCacheHome, "opencode"));
  dirs.push(paths.join(optionHomeDir(opts), ".cache", "opencode"));
  return Array.from(new Set(dirs));
}
