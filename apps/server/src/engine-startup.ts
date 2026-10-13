/**
 * Bring a Cowork server onto the shared Redrob Code daemon. One function for both entry
 * points (cli.ts and embedded.ts) so they cannot drift:
 *
 *   1. reap engines an older Cowork spawned itself and left behind,
 *   2. start the harness shim (its providers must be in the config before the engine
 *      reads it),
 *   3. write the engine's per-directory config for the managed workspace and keep it in
 *      sync with the runtime DB,
 *   4. find or start the daemon and attach,
 *   5. point every workspace at it and register it as the trusted engine process,
 *   6. if the config file changed under a daemon that was already running, dispose the
 *      workspace's instance so the next request rebuilds it on the new file.
 *
 * `stop` detaches (the daemon keeps running for other apps), closes the shim and stops
 * the config refresh. It never kills the engine.
 */
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { discoverClaudeBinary } from "./claude-runtime.js";
import { discoverCodexBinary } from "./codex-runtime.js";
import { reapOrphanEngineInstances } from "./engine-registry.js";
import { setActiveHarnessShim } from "./harness-provider.js";
import { startHarnessShim, type HarnessShim } from "./harness-shim.js";
import { sweepLegacyOpenCodeConfig } from "./legacy-config-sweep.js";
import {
  keepRedrobRuntimeConfigFileFresh,
  redrobRuntimeConfigFilePath,
  writeRedrobRuntimeConfigFile,
  type RedrobPluginOptions,
} from "./redrob-runtime-config.js";
import { clearSharedEngineForConfig, setSharedEngineForConfig } from "./engine-connection.js";
import { loopbackFetch } from "./server-fetch.js";
import { clearTrustedOpencodeProcess, registerTrustedOpencodeProcess } from "./server.js";
import { attachSharedEngine, resolveEngineBin, type SharedEngineHandle } from "./shared-engine.js";
import type { ServerConfig, WorkspaceInfo } from "./types.js";
import { findManagedEngineWorkspace } from "./workspaces.js";

export type EngineLogger = {
  log: (level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => void;
};

export type StartSharedEngineOptions = {
  config: ServerConfig;
  logger: EngineLogger;
  /** The Cowork server URL plugins call back to; must be the port that actually bound. */
  serverUrl: string;
  /** `--opencode-bin` / the desktop's custom binary; wins over everything. */
  explicitBin?: string;
  /** Cowork's bundled `redrob`, used only when the user has none installed. */
  bundledBin?: string;
  env?: NodeJS.ProcessEnv;
};

export type SharedEngineStart = {
  workspace: WorkspaceInfo;
  engine: SharedEngineHandle;
  /** Detach, close the shim, stop the config refresh. Idempotent. */
  stop: () => Promise<void>;
};

/** Ask the daemon to drop its instance for `directory`; the next request rebuilds it. Best effort. */
export async function disposeEngineDirectory(engine: SharedEngineHandle, directory: string): Promise<boolean> {
  const url = new URL(engine.url);
  url.pathname = "/instance/dispose";
  url.search = "";
  url.searchParams.set("directory", directory);
  const auth = `Basic ${Buffer.from(`${engine.username}:${engine.password}`).toString("base64")}`;
  try {
    const response = await loopbackFetch(url.toString(), {
      method: "POST",
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Returns null when there is no local workspace to serve (remote-only config): the server
 * then runs without an engine of its own, as before.
 */
export async function startSharedEngineForConfig(options: StartSharedEngineOptions): Promise<SharedEngineStart | null> {
  const { config, logger } = options;
  const env = options.env ?? process.env;
  const workspace = findManagedEngineWorkspace(config.workspaces);
  if (!workspace) return null;

  // Engines recorded by an older Cowork that spawned them itself and died without cleanup.
  // Best effort: a failed reap must never block startup.
  await reapOrphanEngineInstances(config, { logger }).catch(() => undefined);

  // The shim BEFORE the config: the config is what tells the engine which harness providers
  // exist. Best effort; with neither runtime installed the providers are simply absent.
  let harnessShim: HarnessShim | null = null;
  try {
    const shim = await startHarnessShim({ workingDirectory: workspace.path });
    const codexAvailable = discoverCodexBinary() !== null;
    const claudeAvailable = discoverClaudeBinary() !== null;
    if (codexAvailable || claudeAvailable) {
      harnessShim = shim;
      setActiveHarnessShim({ baseUrl: shim.baseUrl, codexAvailable, claudeAvailable });
      logger.log("info", `harness shim listening on ${shim.baseUrl} (codex: ${codexAvailable}, claude: ${claudeAvailable})`);
    } else {
      await shim.close();
    }
  } catch (error) {
    logger.log("warn", `harness shim did not start: ${error instanceof Error ? error.message : String(error)}`);
  }

  // The engine reads this file for the workspace directory on every instance build, and
  // the refresh below rewrites it on every runtime-DB write. The plugins get the server
  // URL and token from it as options: a shared daemon never sees this process's env.
  const docsDir = env.REDROB_DOCS_DIR?.trim();
  const pluginOptions: RedrobPluginOptions = {
    serverUrl: options.serverUrl,
    serverToken: config.token,
    runtimeConfigPath: redrobRuntimeConfigFilePath(config),
    ...(docsDir ? { docsDir } : {}),
  };
  const before = await readFile(redrobRuntimeConfigFilePath(config), "utf8").catch(() => undefined);
  const written = await writeRedrobRuntimeConfigFile(config, workspace.id, pluginOptions);
  const stopRefresh = keepRedrobRuntimeConfigFileFresh(config, workspace.id, pluginOptions);
  await sweepLegacyOpenCodeConfig(config).catch(() => undefined);

  const bin = await resolveEngineBin({ explicit: options.explicitBin, bundledBin: options.bundledBin, env });
  let engine: SharedEngineHandle;
  try {
    engine = await attachSharedEngine(bin, { env, logger });
  } catch (error) {
    stopRefresh();
    setActiveHarnessShim(null);
    await harnessShim?.close().catch(() => undefined);
    throw error;
  }

  const pointWorkspacesAtEngine = () => {
    config.opencodeBaseUrl = engine.url;
    config.opencodeUsername = engine.username;
    config.opencodePassword = engine.password;
    for (const entry of config.workspaces) {
      if (entry.workspaceType === "remote") {
        entry.baseUrl ??= engine.url;
        entry.opencodeUsername ??= engine.username;
        entry.opencodePassword ??= engine.password;
        entry.directory ??= entry.path;
        continue;
      }
      entry.baseUrl = engine.url;
      entry.opencodeUsername = engine.username;
      entry.opencodePassword = engine.password;
      entry.directory = entry.path;
    }
    registerTrustedOpencodeProcess(config, {
      baseUrl: engine.url,
      identity: `${engine.identity}:${randomUUID()}`,
      isAlive: engine.isAlive,
    });
  };
  pointWorkspacesAtEngine();
  setSharedEngineForConfig(config, engine);

  // A daemon that was already up may hold an instance built on the previous file.
  if (engine.execution.mode === "attached" && (written.changed || before === undefined)) {
    await disposeEngineDirectory(engine, workspace.path);
  }

  // A daemon that restarts gets a new url and secret; the proxy reports failures here.
  const originalRefresh = engine.refresh;
  engine.refresh = async () => {
    const changed = await originalRefresh();
    if (changed) pointWorkspacesAtEngine();
    return changed;
  };

  let stopped: Promise<void> | null = null;
  const stop = () =>
    (stopped ??= (async () => {
      const errors: unknown[] = [];
      clearSharedEngineForConfig(config);
      try {
        clearTrustedOpencodeProcess(config);
      } catch (error) {
        errors.push(error);
      }
      try {
        await engine.close();
      } catch (error) {
        errors.push(error);
      }
      try {
        stopRefresh();
      } catch (error) {
        errors.push(error);
      }
      // Clear the registry as well as closing: it is module-level, and a stale entry would make
      // the NEXT server write a config pointing at a dead shim port.
      const shim = harnessShim;
      harnessShim = null;
      setActiveHarnessShim(null);
      if (shim) {
        try {
          await shim.close();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, "Failed to release the shared engine");
    })());

  return { workspace, engine, stop };
}
