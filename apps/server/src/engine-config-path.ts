import { join } from "node:path";
import { directoryConfigDir } from "./engine-daemon.js";
import { runtimeStorageDir } from "./runtime-db.js";
import type { ServerConfig } from "./types.js";
import { findManagedEngineWorkspace } from "./workspaces.js";

/**
 * The engine reads this file for every instance on the managed workspace's directory
 * (redrob-code `ConfigPaths.directoryConfigDir`): it lives in the engine's state dir, keyed
 * by the directory, never inside the workspace. It replaced the REDROB_CONFIG file cowork
 * handed to the engine it used to spawn; the shared daemon has no per-app environment.
 * Falls back to cowork's own storage dir when no local workspace is configured (tests,
 * remote-only setups), where nothing reads it.
 */
export function redrobRuntimeConfigFilePath(config: ServerConfig): string {
  const workspace = findManagedEngineWorkspace(config.workspaces);
  if (!workspace) return join(runtimeStorageDir(config), "runtime-opencode-config.json");
  return join(directoryConfigDir(workspace.path), "redrob.json");
}
