import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { ApiError } from "../errors.js";
import { listLocalManagedMcpConnectionsSafe } from "../local-managed-mcp.js";
import { runtimeStorageDir } from "../runtime-db.js";
import type { ServerConfig } from "../types.js";
import { activeTeamPolicy } from "./apply.js";
import {
  blockedConnectors,
  connectorVerdict,
  TEAM_CONNECTORS_FILE,
  type ConnectorPolicy,
  type ConnectorVerdict,
  type TeamConnectorsFile,
} from "./connector-rules.js";

/*
 * The connector allowlist on the server's side: refusing to add or enable a connector the team's
 * policy does not allow, and keeping team-connectors.json (read by the engine plugin
 * redrob-team-connectors) in step with which workspaces follow which policy.
 */

export async function teamConnectorPolicy(config: ServerConfig, workspaceId: string): Promise<ConnectorPolicy | null> {
  const active = await activeTeamPolicy(config, workspaceId);
  return active?.policy ? active.policy.connectors : null;
}

const REASON_TEXT: Record<Exclude<ConnectorVerdict, { allowed: true }>["reason"], string> = {
  local_programs_blocked: "Your team's policy does not allow connectors that start programs on this computer",
  not_listed: "Your team's policy does not allow this connector",
  url_mismatch: "Your team's policy allows this connector only at a different address",
};

/** Throws a 403 when the workspace follows a policy that blocks this connector. */
export async function refuseBlockedConnector(
  config: ServerConfig,
  workspaceId: string,
  name: string,
  entry: unknown,
  options: { managedServerUrl?: string | null } = {},
): Promise<void> {
  const policy = await teamConnectorPolicy(config, workspaceId);
  if (!policy) return;
  const verdict = connectorVerdict(policy, name, entry, options);
  if (!verdict.allowed) {
    throw new ApiError(403, "team_policy_connector_blocked", `${REASON_TEXT[verdict.reason]}: ${name}`, {
      name,
      reason: verdict.reason,
    });
  }
}

/** Every connector in an MCP map the policy blocks. Used for import payloads. */
export async function refuseBlockedConnectors(config: ServerConfig, workspaceId: string, mcp: unknown): Promise<void> {
  if (typeof mcp !== "object" || mcp === null || Array.isArray(mcp)) return;
  for (const [name, entry] of Object.entries(mcp)) {
    await refuseBlockedConnector(config, workspaceId, name, entry);
  }
}

async function managedServerUrls(config: ServerConfig, workspaceId: string): Promise<Record<string, string>> {
  const listed = await listLocalManagedMcpConnectionsSafe(config, workspaceId).catch(() => null);
  return Object.fromEntries((listed?.connections ?? []).map((connection) => [connection.name, connection.serverUrl]));
}

/** Names in an MCP map this workspace's policy blocks, for filtering what reaches the engine. */
export async function blockedConnectorNames(
  config: ServerConfig,
  workspaceId: string,
  mcp: Record<string, unknown>,
): Promise<Set<string>> {
  const policy = await teamConnectorPolicy(config, workspaceId);
  if (!policy) return new Set();
  const managed = await managedServerUrls(config, workspaceId);
  return new Set(blockedConnectors(policy, mcp, managed).map((item) => item.name));
}

export function teamConnectorsFilePath(config: ServerConfig): string {
  return join(runtimeStorageDir(config), TEAM_CONNECTORS_FILE);
}

let writeChain: Promise<unknown> = Promise.resolve();

/**
 * Rewrites team-connectors.json from the current state of every workspace. Removed when no workspace
 * follows a team, so a machine without one carries no file the plugin has to read.
 */
export function writeTeamConnectorsFile(config: ServerConfig): Promise<void> {
  const job = writeChain.then(async () => {
    const workspaces: TeamConnectorsFile["workspaces"] = [];
    for (const workspace of config.workspaces) {
      const active = await activeTeamPolicy(config, workspace.id).catch(() => null);
      if (!active?.policy) continue;
      workspaces.push({
        directory: resolve(workspace.path),
        accountId: active.accountId,
        version: active.version,
        policy: active.policy.connectors,
        managed: await managedServerUrls(config, workspace.id),
      });
    }
    const path = teamConnectorsFilePath(config);
    if (workspaces.length === 0) {
      await rm(path, { force: true });
      return;
    }
    const file: TeamConnectorsFile = { v: 1, workspaces };
    await mkdir(runtimeStorageDir(config), { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
    await rename(tmp, path);
  });
  writeChain = job.catch(() => undefined);
  return job;
}
