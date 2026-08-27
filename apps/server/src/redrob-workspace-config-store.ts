import type { ServerConfig } from "./types.js";
import { createWorkspaceKvStore, isRecord } from "./workspace-kv-store.js";

function normalizeRedrobWorkspaceConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function parseRedrobWorkspaceConfig(configJson: string): Record<string, unknown> {
  try {
    return normalizeRedrobWorkspaceConfig(JSON.parse(configJson));
  } catch {
    return {};
  }
}

const redrobWorkspaceConfigStore = createWorkspaceKvStore<Record<string, unknown>>({
  tableName: "redrob_workspace_configs",
  valueColumn: "config_json",
  parse: parseRedrobWorkspaceConfig,
  serialize: (value) => JSON.stringify(value),
});

export async function readRedrobWorkspaceConfig(config: ServerConfig, workspaceId: string): Promise<Record<string, unknown>> {
  return await redrobWorkspaceConfigStore.get(config, workspaceId) ?? {};
}

export async function writeRedrobWorkspaceConfig(
  config: ServerConfig,
  workspaceId: string,
  updater: (current: Record<string, unknown>) => Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const next = normalizeRedrobWorkspaceConfig(updater(await readRedrobWorkspaceConfig(config, workspaceId)));
  await redrobWorkspaceConfigStore.set(config, workspaceId, next);
  return next;
}

export async function hasRedrobWorkspaceConfig(
  config: ServerConfig,
  workspaceId: string,
): Promise<boolean> {
  return redrobWorkspaceConfigStore.has(config, workspaceId);
}

/**
 * Seed the DB-backed redrob config for a workspace if no row exists yet.
 * Used at workspace creation and as the migrate-on-read landing spot for
 * legacy `.opencode/redrob.json` files. No-op when a row is already present,
 * so it never clobbers live provisioning state.
 */
export async function seedRedrobWorkspaceConfigIfEmpty(
  config: ServerConfig,
  workspaceId: string,
  seed: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (await hasRedrobWorkspaceConfig(config, workspaceId)) {
    return readRedrobWorkspaceConfig(config, workspaceId);
  }
  return writeRedrobWorkspaceConfig(config, workspaceId, () => seed);
}

export function mergeRedrobWorkspaceConfigs(
  legacy: Record<string, unknown>,
  stored: Record<string, unknown>,
): Record<string, unknown> {
  return { ...legacy, ...stored };
}
