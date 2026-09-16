import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  commandMatchesPackagedSidecar,
  createRuntimeManager,
  embeddedServerImportUrl,
  migrateRedrobServerTokenStore,
  prepareRuntimeWorkspaceRoot,
  prioritizeWorkspacePaths,
  resetRuntimeStatesAfterFailedServerStart,
  resolveEngineRolloverPreference,
  resolveEvalLocalServerDelayMs,
  resolveRedrobServerConfigPath,
  seedWorkspacePathsForEmbeddedServer,
  selectStickyRedrobPortWorkspace,
  snapshotEngineState,
  snapshotRedrobServerState,
} from "./runtime.mjs";

describe("workspace root preparation", () => {
  it("reports an inaccessible Windows drive as a controlled recoverable error", async () => {
    const mkdirError = Object.assign(new Error("drive is unavailable"), { code: "ENOENT" });
    let attemptedPath = null;

    await assert.rejects(
      prepareRuntimeWorkspaceRoot("\\\\?\\Z:\\Disconnected\\Workspace", {
        platform: "win32",
        mkdirImpl: async (workspaceRoot) => {
          attemptedPath = workspaceRoot;
          throw mkdirError;
        },
      }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok("code" in error);
        assert.ok("workspacePath" in error);
        assert.equal(error.code, "workspace_inaccessible");
        assert.equal(error.workspacePath, "\\\\?\\Z:\\Disconnected\\Workspace");
        assert.equal(error.cause, mkdirError);
        return true;
      },
    );
    assert.equal(attemptedPath, "Z:\\Disconnected\\Workspace");
  });

  it("returns the runtime lifecycle to idle after root preparation fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "redrob-runtime-root-"));
    try {
      const manager = createRuntimeManager({
        app: {
          getPath: (name) => name === "exe" ? path.join(root, "Redrob Cowork.exe") : root,
          isPackaged: false,
        },
        desktopRoot: path.dirname(fileURLToPath(import.meta.url)),
        listLocalWorkspacePaths: async () => [],
        localManagedMcpVaultKey: "test-key",
        workspaceMkdir: async () => {
          throw Object.assign(new Error("network share disconnected"), { code: "ENOENT" });
        },
        workspacePlatform: "win32",
      });

      await assert.rejects(
        manager.engineStart("\\\\server\\share\\Workspace"),
        (error) => error instanceof Error && "code" in error && error.code === "workspace_inaccessible",
      );
      const status = await manager.runtimeStatus();
      assert.equal(status.lifecycleState, "idle");
      assert.equal(status.engine.running, false);
      assert.equal(status.engine.projectDir, null);
      assert.equal(status.redrobServer.running, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("bundled Redrob Code runtime", () => {
  it("pins the Redrob Code engine release the sidecar downloads", async () => {
    const constantsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../constants.json");
    const constants = JSON.parse(await readFile(constantsPath, "utf8"));

    // The engine's own release tag, `v`-prefixed as GitHub publishes it. The old
    // v0.0.12 pin named a CDN prefix that no longer has a build behind it.
    assert.equal(constants.redrobCodeVersion, "v1.18.31-redrob.2");
    // The upstream OpenCode pin must be gone: a stale reader would resolve an
    // OpenCode version that no longer describes the shipped engine.
    assert.equal(constants.opencodeVersion, undefined);
  });
});

describe("engine rollover preference", () => {
  it("uses an explicit value and otherwise restores the persisted value", () => {
    assert.equal(resolveEngineRolloverPreference(true, false), true);
    assert.equal(resolveEngineRolloverPreference(false, true), false);
    assert.equal(resolveEngineRolloverPreference(undefined, true), true);
    assert.equal(resolveEngineRolloverPreference(undefined, false), false);
  });

  it("reports the active mode in the desktop server snapshot", () => {
    const snapshot = snapshotRedrobServerState({
      child: null,
      childExited: true,
      inProcess: true,
      engineRollover: true,
    });
    assert.equal(snapshot.running, true);
    assert.equal(snapshot.engineRollover, true);
  });
});

describe("prioritizeWorkspacePaths", () => {
  it("keeps the active runtime workspace first", () => {
    assert.deepEqual(
      prioritizeWorkspacePaths("/workspace/current", ["/workspace/other", "/workspace/current"]),
      ["/workspace/current", "/workspace/other"],
    );
  });

  it("dedupes equivalent paths", () => {
    assert.deepEqual(
      prioritizeWorkspacePaths("/workspace/current/../current", ["/workspace/current"]),
      ["/workspace/current/../current"],
    );
  });
});

describe("seedWorkspacePathsForEmbeddedServer", () => {
  it("uses persisted server config instead of Electron workspace state once config exists", () => {
    assert.deepEqual(
      seedWorkspacePathsForEmbeddedServer(["/workspace/legacy"], true),
      [],
    );
  });

  it("seeds from Electron workspace state before server config exists", () => {
    assert.deepEqual(
      seedWorkspacePathsForEmbeddedServer(["/workspace/first"], false),
      ["/workspace/first"],
    );
  });
});

describe("selectStickyRedrobPortWorkspace", () => {
  it("uses the requested workspace even when server config owns workspace loading", () => {
    assert.equal(
      selectStickyRedrobPortWorkspace(["/workspace/current"], []),
      "/workspace/current",
    );
  });

  it("falls back to server workspace paths when no requested path is available", () => {
    assert.equal(
      selectStickyRedrobPortWorkspace([], ["/workspace/from-server"]),
      "/workspace/from-server",
    );
  });
});

describe("resolveEvalLocalServerDelayMs", () => {
  it("enables only positive finite eval delays", () => {
    assert.equal(resolveEvalLocalServerDelayMs({ REDROB_EVAL_LOCAL_SERVER_DELAY_MS: "3000" }), 3000);
    assert.equal(resolveEvalLocalServerDelayMs({ REDROB_EVAL_LOCAL_SERVER_DELAY_MS: "0" }), 0);
    assert.equal(resolveEvalLocalServerDelayMs({ REDROB_EVAL_LOCAL_SERVER_DELAY_MS: "-1" }), 0);
    assert.equal(resolveEvalLocalServerDelayMs({ REDROB_EVAL_LOCAL_SERVER_DELAY_MS: "Infinity" }), 0);
    assert.equal(resolveEvalLocalServerDelayMs({ REDROB_EVAL_LOCAL_SERVER_DELAY_MS: "invalid" }), 0);
  });
});

describe("commandMatchesPackagedSidecar", () => {
  it("matches packaged redrob sidecars with platform suffixes", () => {
    assert.equal(
      commandMatchesPackagedSidecar(
        "/Applications/Redrob Cowork.app/Contents/Resources/sidecars/redrob-aarch64-apple-darwin serve --hostname 127.0.0.1 --port 49174 --cors *",
        ["/Applications/Redrob Cowork.app/Contents/Resources/sidecars"],
      ),
      true,
    );
  });

  it("does not match unrelated redrob processes outside sidecar directories", () => {
    assert.equal(
      commandMatchesPackagedSidecar(
        "/usr/local/bin/redrob serve --hostname 127.0.0.1 --port 49174",
        ["/Applications/Redrob Cowork.app/Contents/Resources/sidecars"],
      ),
      false,
    );
  });

  it("no longer reaps upstream opencode sidecars", () => {
    assert.equal(
      commandMatchesPackagedSidecar(
        "/Applications/Redrob Cowork.app/Contents/Resources/sidecars/opencode-aarch64-apple-darwin serve --hostname 127.0.0.1 --port 49174",
        ["/Applications/Redrob Cowork.app/Contents/Resources/sidecars"],
      ),
      false,
    );
  });
});

describe("Redrob Code engine resolution", () => {
  const engineScript = ["#!/bin/sh", 'if [ "$1" = "serve" ]; then echo "Usage: redrob serve"; exit 0; fi', 'echo "0.0.1"'].join("\n");

  async function withManager(root, run) {
    const manager = createRuntimeManager({
      app: { getPath: () => root, isPackaged: false },
      desktopRoot: path.dirname(fileURLToPath(import.meta.url)),
      listLocalWorkspacePaths: async () => [],
      localManagedMcpVaultKey: "test-key",
    });
    await run(manager);
  }

  it("honors REDROB_CODE_BIN as the explicit engine path", async (t) => {
    if (process.platform === "win32") return t.skip("POSIX shell fixture");
    const root = await mkdtemp(path.join(os.tmpdir(), "redrob-engine-bin-"));
    const bin = path.join(root, "redrob");
    const previous = process.env.REDROB_CODE_BIN;
    try {
      await writeFile(bin, engineScript, { mode: 0o755 });
      process.env.REDROB_CODE_BIN = bin;
      await withManager(root, async (manager) => {
        const doctor = manager.engineDoctor();
        assert.equal(doctor.found, true);
        assert.equal(doctor.resolvedPath, bin);
        assert.equal(doctor.resolvedSource, "custom");
        assert.equal(doctor.supportsServe, true);
      });
    } finally {
      if (previous === undefined) delete process.env.REDROB_CODE_BIN;
      else process.env.REDROB_CODE_BIN = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("finds the conventional ~/.redrob/bin install and never falls back to opencode", async (t) => {
    if (process.platform === "win32") return t.skip("POSIX shell fixture");
    const root = await mkdtemp(path.join(os.tmpdir(), "redrob-engine-known-"));
    const previousBin = process.env.REDROB_CODE_BIN;
    const previousPath = process.env.PATH;
    try {
      delete process.env.REDROB_CODE_BIN;
      // Only upstream `opencode` is on PATH: starting it would spawn a product
      // with different env and readiness contracts, so it must not be resolved.
      const pathDir = path.join(root, "path-bin");
      await mkdir(pathDir, { recursive: true });
      await writeFile(path.join(pathDir, "opencode"), engineScript, { mode: 0o755 });
      process.env.PATH = pathDir;

      await withManager(root, async (manager) => {
        const missing = manager.engineDoctor();
        assert.equal(missing.found, false);
        assert.equal(missing.resolvedPath, null);
        assert.match(missing.notes.join(" "), /Redrob Code binary not found/);
      });

      const installed = path.join(root, ".redrob", "bin", "redrob");
      await mkdir(path.dirname(installed), { recursive: true });
      await writeFile(installed, engineScript, { mode: 0o755 });

      await withManager(root, async (manager) => {
        const doctor = manager.engineDoctor();
        assert.equal(doctor.found, true);
        assert.equal(doctor.resolvedPath, installed);
        assert.equal(doctor.resolvedSource, "known-location");
      });
    } finally {
      if (previousBin === undefined) delete process.env.REDROB_CODE_BIN;
      else process.env.REDROB_CODE_BIN = previousBin;
      process.env.PATH = previousPath;
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("embeddedServerImportUrl", () => {
  it("returns the same file URL for unchanged metadata", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "redrob-runtime-"));
    try {
      const embeddedPath = path.join(dir, "embedded.js");
      await writeFile(embeddedPath, "export const value = 1;\n");

      const first = embeddedServerImportUrl(embeddedPath);
      const second = embeddedServerImportUrl(embeddedPath);
      const url = new URL(first);

      assert.equal(first, second);
      assert.equal(url.protocol, "file:");
      assert.equal(fileURLToPath(url), embeddedPath);
      assert.ok(url.searchParams.get("mtimeMs"));
      assert.equal(url.searchParams.get("size"), String("export const value = 1;\n".length));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("changes when the file metadata changes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "redrob-runtime-"));
    try {
      const embeddedPath = path.join(dir, "embedded.js");
      await writeFile(embeddedPath, "export const value = 1;\n");
      const first = embeddedServerImportUrl(embeddedPath);

      await writeFile(embeddedPath, "export const value = 12;\n");

      assert.notEqual(embeddedServerImportUrl(embeddedPath), first);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the plain file URL if stat fails", () => {
    const missingPath = path.join(os.tmpdir(), "redrob-missing-embedded.js");

    assert.equal(embeddedServerImportUrl(missingPath), pathToFileURL(missingPath).href);
  });
});

describe("resolveRedrobServerConfigPath", () => {
  it("respects explicit server config path", () => {
    assert.equal(
      resolveRedrobServerConfigPath({ REDROB_SERVER_CONFIG: "/tmp/redrob/server.json" }),
      "/tmp/redrob/server.json",
    );
  });

  it("uses XDG config home on Unix", () => {
    if (process.platform === "win32") return;
    assert.equal(
      resolveRedrobServerConfigPath({ XDG_CONFIG_HOME: "/tmp/xdg" }),
      "/tmp/xdg/redrob/server.json",
    );
  });
});

describe("Redrob Cowork server credential persistence", () => {
  it("deterministically migrates legacy workspace credentials into one server bundle", () => {
    const migrated = migrateRedrobServerTokenStore({
      version: 1,
      workspaces: {
        "/workspace/z": {
          clientToken: "client-z",
          hostToken: "host-z",
          ownerToken: "owner-z",
          updatedAt: 20,
        },
        "/workspace/a": {
          clientToken: "client-a",
          hostToken: "host-a",
          ownerToken: "owner-a",
          updatedAt: 20,
        },
        "/workspace/old": {
          clientToken: "client-old",
          hostToken: "host-old",
          ownerToken: "owner-old",
          updatedAt: 10,
        },
      },
    });

    assert.deepEqual(migrated, {
      version: 2,
      credentials: {
        clientToken: "client-a",
        hostToken: "host-a",
        ownerToken: "owner-a",
        updatedAt: 20,
      },
    });
    assert.deepEqual(migrateRedrobServerTokenStore(migrated), migrated);
  });
});

describe("snapshotEngineState", () => {
  it("reports server-managed OpenCode liveness and pid without a child handle", () => {
    const snapshot = snapshotEngineState({
      child: null,
      childExited: false,
      runtime: "direct",
      projectDir: "/workspace/current",
      hostname: "127.0.0.1",
      port: 4097,
      baseUrl: "http://127.0.0.1:4097",
      opencodeUsername: null,
      opencodePassword: null,
      opencodeBinPath: null,
      opencodeBinSource: null,
      managedByServer: true,
      managedPid: 12345,
      managedIsAlive: () => true,
      lastStdout: null,
      lastStderr: null,
      execution: null,
    });
    assert.equal(snapshot.running, true);
    assert.equal(snapshot.managedByServer, true);
    assert.equal(snapshot.pid, 12345);
  });
});

describe("resetRuntimeStatesAfterFailedServerStart", () => {
  function staleServerState() {
    return {
      child: null,
      childExited: true,
      inProcess: true,
      remoteAccessEnabled: true,
      host: "127.0.0.1",
      port: 4141,
      baseUrl: "http://127.0.0.1:4141",
      connectUrl: null,
      mdnsUrl: null,
      lanUrl: null,
      clientToken: "client-token",
      ownerToken: "owner-token",
      hostToken: "host-token",
      managedOpencodeBinPath: "/usr/local/bin/opencode",
      managedOpencodeBinSource: "known-location",
      lastStdout: "server stdout",
      lastStderr: "server stderr",
      managedOpencodeExecution: { command: "opencode" },
    };
  }

  function staleEngineState() {
    return {
      child: null,
      childExited: false,
      runtime: "direct",
      projectDir: "/workspace/current",
      hostname: "127.0.0.1",
      port: 4097,
      baseUrl: "http://127.0.0.1:4097",
      opencodeUsername: "user",
      opencodePassword: "pass",
      opencodeBinPath: "/usr/local/bin/opencode",
      opencodeBinSource: "known-location",
      managedByServer: true,
      managedPid: 12345,
      managedIsAlive: () => true,
      lastStdout: "engine stdout",
      lastStderr: "engine stderr",
      execution: { command: "opencode" },
    };
  }

  it("clears a dead managed runtime so snapshots cannot report it running", () => {
    const serverState = staleServerState();
    const engineState = staleEngineState();

    resetRuntimeStatesAfterFailedServerStart(serverState, engineState, { manageOpencode: true });

    assert.equal(serverState.inProcess, false);
    assert.equal(serverState.port, null);
    assert.equal(serverState.baseUrl, null);
    assert.equal(serverState.ownerToken, null);
    // Diagnostics survive the reset.
    assert.equal(serverState.lastStdout, "server stdout");
    assert.equal(serverState.lastStderr, "server stderr");

    assert.equal(engineState.baseUrl, null);
    assert.equal(engineState.managedByServer, false);
    assert.equal(engineState.managedPid, null);
    assert.equal(snapshotEngineState(engineState).running, false);
    // A retry via engineRestart still knows its workspace.
    assert.equal(engineState.projectDir, "/workspace/current");
    assert.equal(engineState.lastStderr, "engine stderr");
  });

  it("leaves an external engine untouched when the failed start did not manage it", () => {
    const serverState = staleServerState();
    const engineState = staleEngineState();
    engineState.managedByServer = false;

    resetRuntimeStatesAfterFailedServerStart(serverState, engineState, { manageOpencode: false });

    assert.equal(serverState.inProcess, false);
    assert.equal(engineState.baseUrl, "http://127.0.0.1:4097");
    assert.equal(engineState.projectDir, "/workspace/current");
  });
});
