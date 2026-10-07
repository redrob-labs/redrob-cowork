import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  blockedConnectors,
  parseTeamConnectorsFile,
  TEAM_CONNECTORS_FILE,
} from "../team-policy/connector-rules.js";

/*
 * Enforces a team policy's connector allowlist inside the engine.
 *
 * The engine merges MCP servers from several files: the global config, the runtime config
 * redrob-server writes (REDROB_CONFIG), and the project's own config, which is merged last and so
 * wins. A server-side check alone would miss a connector someone, or an agent, wrote into the
 * project config. The engine runs every plugin's `config` hook on the merged result before any MCP
 * server is started ("Plugin can mutate config so it has to be initialized before anything else",
 * redrob-code project/bootstrap.ts), so this hook is the one place that sees every connector from
 * every file, and disabling one here means its program is never started.
 *
 * The policy comes from team-connectors.json, which redrob-server writes beside the runtime config
 * whenever a workspace joins, follows or leaves a team. Absent means no workspace follows a team.
 * Present but unreadable means the hook cannot tell what is allowed, so for the directories it
 * cannot vouch for it disables every connector: a broken file must not read as "allow everything".
 */

type McpMap = Record<string, Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(path: string): string {
  try {
    return realpathSync(resolve(path));
  } catch {
    return resolve(path);
  }
}

type Loaded = { kind: "none" } | { kind: "broken" } | { kind: "policy"; file: NonNullable<ReturnType<typeof parseTeamConnectorsFile>> };

function loadPolicyFile(env: Record<string, string | undefined>): Loaded {
  const runtimeConfig = env.REDROB_CONFIG?.trim();
  if (!runtimeConfig) return { kind: "none" };
  let text: string;
  try {
    text = readFileSync(join(dirname(runtimeConfig), TEAM_CONNECTORS_FILE), "utf8");
  } catch (error) {
    return (error as { code?: string }).code === "ENOENT" ? { kind: "none" } : { kind: "broken" };
  }
  try {
    const file = parseTeamConnectorsFile(JSON.parse(text));
    return file ? { kind: "policy", file } : { kind: "broken" };
  } catch {
    return { kind: "broken" };
  }
}

/** Disables, in place, every connector the policy blocks for this directory. Returns their names. */
function enforce(config: unknown, directory: string | null, env: Record<string, string | undefined>): string[] {
  if (!isRecord(config) || !isRecord(config.mcp)) return [];
  const mcp = config.mcp as McpMap;
  const loaded = loadPolicyFile(env);
  if (loaded.kind === "none") return [];

  const disable = (names: string[]) => {
    for (const name of names) {
      const entry = mcp[name];
      if (isRecord(entry)) entry.enabled = false;
    }
    return names;
  };

  if (loaded.kind === "broken") return disable(Object.keys(mcp));
  if (!directory) return [];
  const here = canonical(directory);
  const workspace = loaded.file.workspaces.find((item) => canonical(item.directory) === here);
  if (!workspace) return [];
  return disable(blockedConnectors(workspace.policy, mcp, workspace.managed).map((item) => item.name));
}

// Single export: the OpenCode plugin loader treats every export of a plugin
// module as a plugin factory, so helpers must stay module-private.
export const RedrobWorkTeamConnectors = async (factoryInput?: unknown) => {
  const directory = isRecord(factoryInput) && typeof factoryInput.directory === "string" ? factoryInput.directory : null;
  return {
    config: async (config: unknown) => {
      const disabled = enforce(config, directory, process.env);
      if (disabled.length) {
        // Names only, never the entries: a connector's config can carry a token.
        console.warn(`[redrob-team-connectors] disabled by the team policy: ${disabled.join(", ")}`);
      }
    },
  };
};
