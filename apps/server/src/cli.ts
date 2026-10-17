#!/usr/bin/env bun

import { parseCliArgs, printHelp, resolveServerConfig } from "./config.js";
import { startCoworkAppBridge, type CoworkAppBridge } from "./cowork-app-bridge.js";
import { startSharedEngineForConfig, type SharedEngineStart } from "./engine-startup.js";
import { createServerLogger, startServer, syncAllWorkspacesRuntimeMcpToEngine } from "./server.js";
import { ensureLocalWorkspaceFiles } from "./workspace-init.js";
import { startWorkerActivityHeartbeat } from "./worker-activity-heartbeat.js";
import pkg from "../package.json" with { type: "json" };

const args = parseCliArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.version) {
  console.log(pkg.version);
  process.exit(0);
}

const config = await resolveServerConfig(args);
const logger = createServerLogger(config);
let engine: SharedEngineStart | null = null;

if (!config.readOnly) {
  await ensureLocalWorkspaceFiles(config.workspaces);
}

// Bind the HTTP server before touching the engine: serve-node may fall back
// to an OS-assigned port on EADDRINUSE, and the plugins' callback URL written
// into the engine config must be the port that actually bound.
const server = await startServer(config);
config.port = server.port;
const serverUrl = `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${server.port}`;
const workerActivityHeartbeat = startWorkerActivityHeartbeat(config, logger);

if (!config.opencodeBaseUrl && process.env.REDROB_MANAGE_OPENCODE === "1") {
  engine = await startSharedEngineForConfig({ config, logger, serverUrl });
  if (engine) logger.log("info", `Shared Redrob Code engine at ${engine.engine.url}`);
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

const url = `http://${config.host}:${server.port}`;
logger.log("info", `Redrob Cowork server listening on ${url}`);

// Hand the shared daemon's agent this server's tasks. Optional: without a daemon the
// server runs as before.
const appBridge: CoworkAppBridge | null = await startCoworkAppBridge({ config, serverUrl, logger });

if (config.tokenSource === "generated") {
  logger.log("info", `Client token: ${config.token}`);
}

if (config.hostTokenSource === "generated") {
  logger.log("info", `Host token: ${config.hostToken}`);
}

if (config.workspaces.length === 0) {
  logger.log("info", "No workspaces configured. Add --workspace or update server.json.");
} else {
  logger.log("info", `Workspaces: ${config.workspaces.length}`);
}

if (args.verbose) {
  logger.log("info", `Config path: ${config.configPath ?? "unknown"}`);
  logger.log("info", `Read-only: ${config.readOnly ? "true" : "false"}`);
  logger.log("info", `Approval: ${config.approval.mode} (${config.approval.timeoutMs}ms)`);
  logger.log("info", `CORS origins: ${config.corsOrigins.join(", ")}`);
  logger.log("info", `Authorized roots: ${config.authorizedRoots.join(", ")}`);
  logger.log("info", `Token source: ${config.tokenSource}`);
  logger.log("info", `Host token source: ${config.hostTokenSource}`);
}

const shutdown = async () => {
  workerActivityHeartbeat?.stop();
  // Unregister the app bridge first so the daemon stops routing tool calls here.
  await appBridge?.stop();
  // Detach from the shared daemon; it keeps serving other apps and exits on its own
  // once nobody is attached.
  await engine?.stop().catch(() => undefined);
  (server as { stop?: (closeActiveConnections?: boolean) => void }).stop?.(true);
};

process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
