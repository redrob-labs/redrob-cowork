import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  desktopBootstrapPath,
  engineHomeDirs,
  globalEngineConfigDir,
  legacyGlobalConfigCandidates,
  legacyWorkspaceConfigCandidates,
  legacyDesktopBootstrapPath,
  MAX_CONFIG_ROOT_LENGTH,
  normalizeWorkspaceRootPath,
  redrobEnvStorePath,
  redrobServerConfigPath,
  resolveGlobalEngineConfigPath,
  resolveWorkspaceEngineConfigPath,
  workspaceEngineConfigCandidates,
} from "../index.mjs";

async function withTempDir(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "redrob-paths-"));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("workspace root paths", () => {
  test("normalizes valid Windows verbatim drive and UNC paths cross-platform", () => {
    const opts = { platform: "win32" };
    expect(normalizeWorkspaceRootPath("\\\\?\\C:\\Users\\Ada\\Workspace", opts))
      .toBe("C:\\Users\\Ada\\Workspace");
    expect(normalizeWorkspaceRootPath("\\\\?\\C:\\", opts)).toBe("C:\\");
    expect(normalizeWorkspaceRootPath("//?/UNC/server/share/Workspace", opts))
      .toBe("\\\\server\\share\\Workspace");
    expect(normalizeWorkspaceRootPath("\\\\?\\UNC\\server\\share", opts))
      .toBe("\\\\server\\share");
  });

  test("preserves valid normal drives and UNC shares without checking availability", () => {
    const opts = { platform: "win32" };
    expect(normalizeWorkspaceRootPath("Z:\\Disconnected\\Workspace", opts))
      .toBe("Z:\\Disconnected\\Workspace");
    expect(normalizeWorkspaceRootPath("\\\\offline-server\\share\\Workspace", opts))
      .toBe("\\\\offline-server\\share\\Workspace");
    expect(normalizeWorkspaceRootPath("\\\\offline-server\\pipe\\Workspace", opts))
      .toBe("\\\\offline-server\\pipe\\Workspace");
  });

  test("rejects Win32 device namespace roots", () => {
    const opts = { platform: "win32" };
    for (const value of [
      "\\\\.\\pipe\\redrob",
      "//./PIPE/redrob",
      "\\\\.\\PhysicalDrive0",
      "\\\\?\\UNC\\.\\pipe\\redrob",
      "\\\\?\\UNC\\?\\PhysicalDrive0",
    ]) {
      expect(() => normalizeWorkspaceRootPath(value, opts)).toThrow("Invalid Windows workspace root");
    }
  });

  test("rejects incomplete Windows drive and UNC roots", () => {
    const opts = { platform: "win32" };
    for (const value of [
      "C:",
      "\\\\?\\",
      "\\\\?\\C:",
      "\\\\?\\C:Workspace",
      "\\\\?\\UNC",
      "\\\\?\\UNC\\server",
      "\\\\server",
    ]) {
      expect(() => normalizeWorkspaceRootPath(value, opts)).toThrow("Invalid Windows workspace root");
    }
  });

  test("applies Windows validation only when Windows is injected", () => {
    expect(normalizeWorkspaceRootPath("\\\\?\\C:", { platform: "linux" })).toBe("\\\\?\\C:");
  });
});

describe("redrob server config paths", () => {
  test("uses APPDATA on Windows", () => {
    expect(redrobServerConfigPath({
      env: { APPDATA: "C:\\Users\\Ada\\AppData\\Roaming" },
      homeDir: "C:\\Users\\Ada",
      platform: "win32",
    })).toBe("C:\\Users\\Ada\\AppData\\Roaming\\redrob\\server.json");
  });

  test("uses XDG_CONFIG_HOME on Unix", () => {
    expect(redrobServerConfigPath({
      env: { XDG_CONFIG_HOME: "/tmp/xdg" },
      homeDir: "/home/ada",
      platform: "linux",
    })).toBe("/tmp/xdg/redrob/server.json");
  });

  test("falls back to ~/.config", () => {
    expect(redrobServerConfigPath({ env: {}, homeDir: "/home/ada", platform: "linux" }))
      .toBe("/home/ada/.config/redrob/server.json");
  });

  test("honors REDROB_SERVER_CONFIG", () => {
    expect(redrobServerConfigPath({
      env: { REDROB_SERVER_CONFIG: "/tmp/redrob/server.json" },
      homeDir: "/home/ada",
      platform: "linux",
    })).toBe("/tmp/redrob/server.json");
  });
});

describe("redrob env store and desktop bootstrap paths", () => {
  test("honors REDROB_ENV_STORE", () => {
    expect(redrobEnvStorePath({
      env: { REDROB_ENV_STORE: "/tmp/redrob/env.json" },
      homeDir: "/home/ada",
      platform: "linux",
    })).toBe("/tmp/redrob/env.json");
  });

  test("uses the same redrob config layout for env.json", () => {
    expect(redrobEnvStorePath({
      env: { XDG_CONFIG_HOME: "/tmp/xdg" },
      homeDir: "/home/ada",
      platform: "linux",
    })).toBe("/tmp/xdg/redrob/env.json");
  });

  test("honors REDROB_DESKTOP_BOOTSTRAP_PATH", () => {
    expect(desktopBootstrapPath({
      env: { REDROB_DESKTOP_BOOTSTRAP_PATH: "/tmp/bootstrap.json" },
      homeDir: "/home/ada",
      platform: "linux",
    })).toBe("/tmp/bootstrap.json");
  });

  test("preserves dev-data desktop bootstrap path when userDataDir is injected", () => {
    expect(desktopBootstrapPath({
      env: { REDROB_DEV_MODE: "1" },
      homeDir: "/Users/ada",
      platform: "darwin",
      userDataDir: "/tmp/redrob-userdata",
    })).toBe("/tmp/redrob-userdata/redrob-dev-data/home/.config/redrob/desktop-bootstrap.json");
  });

  test("resolves the legacy desktop bootstrap path from the chosen home", () => {
    expect(legacyDesktopBootstrapPath({ env: {}, homeDir: "/Users/ada", platform: "darwin" }))
      .toBe("/Users/ada/.config/redrob/desktop-bootstrap.json");
  });
});

describe("global engine config paths", () => {
  /**
   * These paths must track Redrob Code, not upstream OpenCode. The engine reads
   * `${XDG_CONFIG_HOME:-$HOME/.config}/redrob/redrob.json(c)` and honours
   * REDROB_CONFIG_DIR; it never reads `opencode.json(c)`. Anything here drifting
   * back to the upstream names means user config silently stops being loaded.
   */
  test("accepts a safe REDROB_CONFIG_DIR as the config directory", async () => {
    await withTempDir(async (root) => {
      const configDir = path.join(root, "explicit-redrob");
      await mkdir(configDir, { recursive: true });
      const json = path.join(configDir, "redrob.json");
      await writeFile(json, "{}", "utf8");

      const opts = {
        env: { REDROB_CONFIG_DIR: configDir, XDG_CONFIG_HOME: path.join(root, "xdg") },
        homeDir: path.join(root, "home"),
        platform: "linux",
      };
      expect(globalEngineConfigDir(opts)).toBe(configDir);
      expect(resolveGlobalEngineConfigPath(opts)).toBe(json);
    });
  });

  test("still honours OPENCODE_CONFIG_DIR as a legacy fallback", () => {
    const opts = {
      env: { OPENCODE_CONFIG_DIR: "/tmp/legacy-dir", XDG_CONFIG_HOME: "/tmp/xdg" },
      homeDir: "/home/ada",
      platform: "linux",
    };
    expect(globalEngineConfigDir(opts)).toBe("/tmp/legacy-dir");
  });

  test("REDROB_CONFIG_DIR wins over OPENCODE_CONFIG_DIR", () => {
    const opts = {
      env: { REDROB_CONFIG_DIR: "/tmp/current", OPENCODE_CONFIG_DIR: "/tmp/legacy", XDG_CONFIG_HOME: "/tmp/xdg" },
      homeDir: "/home/ada",
      platform: "linux",
    };
    expect(globalEngineConfigDir(opts)).toBe("/tmp/current");
  });

  test("defaults to the engine's XDG directory, not opencode's", () => {
    const opts = { env: { XDG_CONFIG_HOME: "/tmp/xdg" }, homeDir: "/home/ada", platform: "linux" };
    expect(globalEngineConfigDir(opts)).toBe("/tmp/xdg/redrob");
  });

  test("prefers redrob.jsonc over redrob.json and falls back to jsonc", async () => {
    await withTempDir(async (root) => {
      const dir = path.join(root, "xdg", "redrob");
      await mkdir(dir, { recursive: true });
      const opts = { env: { XDG_CONFIG_HOME: path.join(root, "xdg") }, homeDir: path.join(root, "home"), platform: "linux" };
      const jsonc = path.join(dir, "redrob.jsonc");
      const json = path.join(dir, "redrob.json");

      expect(resolveGlobalEngineConfigPath(opts)).toBe(jsonc);
      await writeFile(json, "{}", "utf8");
      expect(resolveGlobalEngineConfigPath(opts)).toBe(json);
      await writeFile(jsonc, "{}", "utf8");
      expect(resolveGlobalEngineConfigPath(opts)).toBe(jsonc);
    });
  });

  test("rejects a relative REDROB_CONFIG_DIR", () => {
    const opts = {
      env: { REDROB_CONFIG_DIR: "relative/redrob", XDG_CONFIG_HOME: "/tmp/xdg" },
      homeDir: "/home/ada",
      platform: "linux",
    };
    expect(globalEngineConfigDir(opts)).toBe("/tmp/xdg/redrob");
  });

  test("rejects an over-long REDROB_CONFIG_DIR", () => {
    const opts = {
      env: { REDROB_CONFIG_DIR: `/${"a".repeat(MAX_CONFIG_ROOT_LENGTH)}`, XDG_CONFIG_HOME: "/tmp/xdg" },
      homeDir: "/home/ada",
      platform: "linux",
    };
    expect(globalEngineConfigDir(opts)).toBe("/tmp/xdg/redrob");
  });

  test("rejects forbidden control characters in REDROB_CONFIG_DIR", () => {
    const opts = {
      env: { REDROB_CONFIG_DIR: "/tmp/redrob\n", XDG_CONFIG_HOME: "/tmp/xdg" },
      homeDir: "/home/ada",
      platform: "linux",
    };
    expect(globalEngineConfigDir(opts)).toBe("/tmp/xdg/redrob");
  });

  test("names the legacy global files without making them a write target", () => {
    const opts = { env: { XDG_CONFIG_HOME: "/tmp/xdg" }, homeDir: "/home/ada", platform: "linux" };
    expect(legacyGlobalConfigCandidates(opts)).toEqual([
      "/tmp/xdg/opencode/opencode.jsonc",
      "/tmp/xdg/opencode/opencode.json",
    ]);
    expect(resolveGlobalEngineConfigPath(opts)).toBe("/tmp/xdg/redrob/redrob.jsonc");
  });
});

describe("workspace engine config paths", () => {
  test("offers only the workspace-root files the engine loads", () => {
    // `.opencode/redrob.json` is Redrob Cowork's own managed runtime config, so it
    // is deliberately absent here: listing it would point the user-config editor
    // at a file the app owns.
    expect(workspaceEngineConfigCandidates("/repo/workspace")).toEqual([
      "/repo/workspace/redrob.jsonc",
      "/repo/workspace/redrob.json",
    ]);
  });

  test("resolves the first existing candidate and defaults to jsonc", async () => {
    await withTempDir(async (root) => {
      const jsonc = path.join(root, "redrob.jsonc");
      const json = path.join(root, "redrob.json");
      expect(resolveWorkspaceEngineConfigPath(root)).toBe(jsonc);
      await writeFile(json, "{}", "utf8");
      expect(resolveWorkspaceEngineConfigPath(root)).toBe(json);
      await writeFile(jsonc, "{}", "utf8");
      expect(resolveWorkspaceEngineConfigPath(root)).toBe(jsonc);
    });
  });

  test("names the legacy workspace files the engine never read", () => {
    expect(legacyWorkspaceConfigCandidates("/repo/workspace")).toEqual([
      "/repo/workspace/opencode.jsonc",
      "/repo/workspace/opencode.json",
      "/repo/workspace/.opencode/opencode.jsonc",
      "/repo/workspace/.opencode/opencode.json",
    ]);
  });

  test("no engine-visible candidate uses an upstream opencode filename", () => {
    const offenders = [
      ...workspaceEngineConfigCandidates("/repo/workspace"),
      resolveGlobalEngineConfigPath({ env: { XDG_CONFIG_HOME: "/tmp/xdg" }, homeDir: "/home/ada", platform: "linux" }),
    ].filter((candidate) => /opencode\.jsonc?$/.test(candidate));
    expect(offenders).toEqual([]);
  });
});

describe("engineHomeDirs", () => {
  test("uses POSIX-shaped profile paths on Windows, not %APPDATA%", () => {
    // redrob-code resolves these with xdg-basedir, which does not special-case Windows. This is the
    // detail that made the reset gap easy to miss: the paths look like Linux paths on a Windows box.
    const dirs = engineHomeDirs({
      platform: "win32",
      homeDir: "C:\\Users\\USER",
      env: {},
    });

    expect(dirs).toContain("C:\\Users\\USER\\.local\\share\\redrob");
    expect(dirs).toContain("C:\\Users\\USER\\.config\\redrob");
    expect(dirs).toContain("C:\\Users\\USER\\.cache\\redrob");
    expect(dirs).toContain("C:\\Users\\USER\\.local\\state\\redrob");
    expect(dirs).toContain("C:\\Users\\USER\\.redrob");

    // %APPDATA%-shaped paths belong to the DESKTOP app, not the engine. Asserting their absence keeps
    // this function from drifting into covering the app's own directories, which are deleted by their
    // own targets.
    expect(dirs.some((dir) => dir.includes("AppData"))).toBe(false);
  });

  test("honours XDG overrides when they are set", () => {
    const dirs = engineHomeDirs({
      platform: "linux",
      homeDir: "/home/user",
      env: {
        XDG_DATA_HOME: "/custom/data",
        XDG_CONFIG_HOME: "/custom/config",
        XDG_CACHE_HOME: "/custom/cache",
        XDG_STATE_HOME: "/custom/state",
      },
    });

    expect(dirs).toContain("/custom/data/redrob");
    expect(dirs).toContain("/custom/config/redrob");
    expect(dirs).toContain("/custom/cache/redrob");
    expect(dirs).toContain("/custom/state/redrob");
    // The install script's bin directory is not an xdg path, so it stays under the home directory.
    expect(dirs).toContain("/home/user/.redrob");
  });

  test("names the engine, never the upstream product", () => {
    // opencodeDataDirs and its siblings cover the `opencode`-named directories, and they are also read
    // by the server to FIND the engine database. These two sets stay separate on purpose.
    const dirs = engineHomeDirs({ platform: "linux", homeDir: "/home/user", env: {} });
    expect(dirs.some((dir) => dir.includes("opencode"))).toBe(false);
  });

  test("returns no duplicates", () => {
    const dirs = engineHomeDirs({ platform: "linux", homeDir: "/home/user", env: {} });
    expect(new Set(dirs).size).toBe(dirs.length);
  });
});
