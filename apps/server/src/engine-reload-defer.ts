import type { ServerConfig, WorkspaceInfo } from "./types.js";

export interface EngineSessionsProbe {
  (config: ServerConfig, workspace: WorkspaceInfo): Promise<boolean>;
}

/**
 * OpenCode's instance cache and `/instance/dispose?directory=...` are scoped
 * to one directory. Only the target directory can be interrupted by this
 * reload; sessions in other workspaces on the same server are independent.
 */
export async function shouldDeferInPlaceEngineReload(
  config: ServerConfig,
  target: WorkspaceInfo,
  hasActiveSessions: EngineSessionsProbe,
): Promise<boolean> {
  return hasActiveSessions(config, target);
}
