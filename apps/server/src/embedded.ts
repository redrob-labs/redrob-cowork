/**
 * Single entry point for embedding the Redrob Cowork server in-process.
 *
 * Handles config resolution, attaching to the shared Redrob Code daemon, and
 * server start in one call -- mirrors what cli.ts does but returns a handle
 * instead of owning the process lifecycle.
 */
import { resolveServerConfig, type CliArgs } from "./config.js";
import { startSharedEngineForConfig, type SharedEngineStart } from "./engine-startup.js";
import { createServerLogger, startServer, syncAllWorkspacesRuntimeMcpToEngine } from "./server.js";
import type { EngineExecutionSnapshot } from "./shared-engine.js";
import { ensureLocalWorkspaceFiles } from "./workspace-init.js";
import type { ServeResult } from "./serve-node.js";
import type { LocalManagedMcpVaultKeyProvider, ServerConfig } from "./types.js";

export type EmbeddedServerOptions = CliArgs & {
  /** When true, attach to (or start) the shared Redrob Code daemon for the local workspace. */
  manageOpencode?: boolean;
  /** Path to a Redrob Code binary. Falls back to REDROB_CODE_BIN / REDROB_OPENCODE_BIN, then the user's install. */
  opencodeBin?: string;
  /** Cowork's bundled Redrob Code binary, used to start the daemon only when the user has none installed. */
  bundledOpencodeBin?: string;
  /** Kept for callers; the shared daemon chooses its own working directory. */
  opencodeCwd?: string;
  /** Secure key custody for the local managed MCP credential vault. */
  localManagedMcpVaultKey?: LocalManagedMcpVaultKeyProvider;
};

export type EmbeddedServerHandle = {
  /** Bound port the HTTP server is listening on. */
  port: number;
  /** Full base URL, e.g. http://127.0.0.1:48123 */
  url: string;
  /** The resolved server config (with engine URLs populated). */
  config: ServerConfig;
  /** How this server reached the shared engine (no secrets), when it did. */
  managedOpencodeExecution: EngineExecutionSnapshot | null;
  /** The shared daemon's pid and liveness, when attached. */
  managedOpencode: { pid: number | null; isAlive: () => boolean } | null;
  /** There is one shared engine now, never a pool of generations; kept for callers. */
  managedOpencodePool: () => null;
  /** Stop the HTTP server and detach from the engine (the daemon keeps running for other apps). */
  stop: () => Promise<void>;
};

export async function startEmbeddedServer(options: EmbeddedServerOptions): Promise<EmbeddedServerHandle> {
  const config = await resolveServerConfig(options);
  config.localManagedMcpVaultKey = options.localManagedMcpVaultKey;
  const logger = createServerLogger(config);

  let engine: SharedEngineStart | null = null;
  let server: ServeResult | null = null;
  let stopPromise: Promise<void> | null = null;

  const releaseResources = async (): Promise<void> => {
    const errors: unknown[] = [];

    const started = engine;
    engine = null;
    if (started) {
      try {
        await started.stop();
      } catch (error) {
        errors.push(error);
      }
    }

    const httpServer = server;
    server = null;
    if (httpServer) {
      try {
        await httpServer.stop();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "Failed to stop embedded Redrob Cowork server");
    }
  };

  const stop = (): Promise<void> => {
    stopPromise ??= releaseResources();
    return stopPromise;
  };

  const duringStartup = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (startupError) {
      try {
        await stop();
      } catch (cleanupError) {
        throw new AggregateError(
          [startupError, cleanupError],
          "Embedded Redrob Cowork server startup failed and cleanup was incomplete",
        );
      }
      throw startupError;
    }
  };

  if (!config.readOnly) {
    await ensureLocalWorkspaceFiles(config.workspaces);
  }

  // Bind the HTTP server before touching the engine: serve-node may fall back
  // to an OS-assigned port on EADDRINUSE, and the plugins' callback URL
  // written into the engine config must be the port that actually bound.
  // Proxy requests that land in the short window before the engine is attached
  // fail with opencode_unconfigured and clients retry.
  server = await duringStartup(() => startServer(config));
  config.port = server.port;
  const serverUrl = `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${server.port}`;

  if (!config.opencodeBaseUrl && options.manageOpencode) {
    engine = await duringStartup(() =>
      startSharedEngineForConfig({
        config,
        logger,
        serverUrl,
        explicitBin: options.opencodeBin,
        bundledBin: options.bundledOpencodeBin,
      }),
    );
  }

  // The config file above only covers the managed workspace. Push every
  // workspace's runtime-DB MCPs into the engine so they aren't invisible
  // until a manual reload. Best-effort.
  if (engine) {
    void syncAllWorkspacesRuntimeMcpToEngine(config).catch((error) => {
      logger.log("error", "Startup MCP synchronization crashed.", {
        "mcp.trigger": "startup",
        "mcp.failure.message": error instanceof Error ? error.message : String(error),
      });
    });
  }

  const started = engine;
  return {
    port: server.port,
    url: serverUrl,
    config,
    managedOpencodeExecution: started?.engine.execution ?? null,
    managedOpencode: started
      ? {
          get pid() {
            return started.engine.pid;
          },
          isAlive: () => started.engine.isAlive(),
        }
      : null,
    managedOpencodePool: () => null,
    stop,
  };
}
