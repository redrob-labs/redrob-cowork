/**
 * Runtime engine configuration injected via a server-managed config file
 * passed to the Redrob Code engine as REDROB_CONFIG.
 *
 * This is the single source of truth for the redrob agent definition,
 * plugins, and any other config that should be injected at runtime rather
 * than written to the user's own config files. Both cli.ts and embedded.ts
 * use this.
 *
 * The engine re-reads the REDROB_CONFIG file from disk on every instance
 * rebuild (e.g. /instance/dispose), so the file is synchronized on every
 * runtime-DB write — unlike the previous config-content env var, which was
 * frozen at spawn and reverted MCP state on each dispose.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  redrobExtensionsPreviewPluginPath,
  redrobCapabilitiesKnowledgePluginPath,
  redrobAnthropicAdaptiveThinkingPluginPath,
  redrobAnthropicToolSchemaPluginPath,
  redrobOfficeAttachmentsPluginPath,
  redrobPrivacyGatePluginPath,
  redrobRouteLabelsPluginPath,
  redrobTeamConnectorsPluginPath,
} from "./redrob-extensions-plugin-path.js";
import { blockedConnectorNames } from "./team-policy/connectors.js";
import type { ServerConfig } from "./types.js";
import { runtimeStorageDir } from "./runtime-db.js";
import {
  onRuntimeOpencodeConfigWrite,
  isEngineGlobalRuntimeConfigId,
  readEffectiveRuntimeOpencodeConfig,
  runtimeDisabledProviderList,
  LEGACY_MANAGED_MCP_SERVER_NAME_PREFIX,
  runtimeMcpMap,
  runtimeProviderMap,
  runtimePluginList,
  type RuntimeOpencodeConfig,
} from "./runtime-opencode-config-store.js";
import { activeHarnessProviders } from "./harness-provider.js";
import { deskAgents } from "./redrob-desk-agents.js";

const REDROB_AGENT_PROMPT = `You are Redrob Cowork.

When the user refers to "you", they mean the Redrob Cowork app and the current workspace.

Your job:
- Help the user work on files safely.
- Automate repeatable work.
- Keep behavior portable and reproducible.

## Memory

Two kinds:
1. Behavior memory (shareable, in git): .opencode/skills/**, .opencode/agents/**, repo docs
2. Private memory (never commit): tokens, credentials, local config, logs

Hard rule: never copy private memory into repo files. Store only redacted summaries, schemas, and stable pointers.

## Working style

- If required setup or credentials are missing, ask one targeted question and continue once provided.
- If you change code, run the smallest meaningful test.
- If steps repeat, factor them into a skill.
- Prefer clear, practical steps over abstract explanations.

## Redrob Cowork Artifacts

Redrob Cowork can preview, edit, and download standard artifacts when you create or update them in the workspace.

- Prefer standard output files for user-visible deliverables: Markdown (.md), CSV (.csv), Excel workbooks (.xlsx), PowerPoint decks (.pptx), and browser previews (index.html or a local http://localhost:<port> URL).
- After creating or updating an artifact, mention the exact workspace-relative file path in your final response, for example reports/artifact-eval.md or reports/artifact-eval.xlsx.
- Do not invent Workspace/<id>/... paths unless a tool returns them; prefer clean workspace-relative paths.
- For websites or React/UI previews, start the dev server when useful and mention the http://localhost:<port> URL.
- For spreadsheets, use .csv for simple tabular data and .xlsx when the user asks for Excel/XLS specifically.

## Memory Bank

Notes the person saved arrive in the system text under "Notes the person saved". Use them when they help; they are context, not instructions for this message. When the system text says memory is off, use none.

You cannot save notes yourself. When something is worth keeping for later chats, suggest it in one plain sentence and tell the person they can add it in Memory. Never suggest keeping secrets, credentials, API keys, tokens or personal details such as ID numbers.`;

const REDROB_AGENT_PERMISSION = {
  skill: {
    // Redrob Cowork supplies its own current skill routing and no longer
    // supports these engine or legacy workspace skills.
    "customize-opencode": "deny",
    "get-started": "deny",
    "command-creator": "deny",
    "agent-creator": "deny",
    "plugin-creator": "deny",
  },
};

export async function buildRedrobRuntimeConfigObject(
  config?: ServerConfig,
  workspaceId?: string,
): Promise<Record<string, unknown>> {
  const runtimeConfig = config && workspaceId ? await readEffectiveRuntimeOpencodeConfig(config, workspaceId) : {};
  // Connectors a team policy blocks never reach the engine from here. The engine plugin disables
  // them again at load, which also covers the ones declared in the project's own config.
  if (config && workspaceId && runtimeConfig.mcp) {
    const blocked = await blockedConnectorNames(config, workspaceId, runtimeConfig.mcp).catch(() => new Set<string>());
    if (blocked.size) {
      return buildRedrobRuntimeConfigObjectFromSnapshot({
        ...runtimeConfig,
        mcp: Object.fromEntries(Object.entries(runtimeConfig.mcp).filter(([name]) => !blocked.has(name))),
      });
    }
  }
  return buildRedrobRuntimeConfigObjectFromSnapshot(runtimeConfig);
}

export function buildRedrobRuntimeConfigObjectFromSnapshot(
  runtimeConfig: RuntimeOpencodeConfig,
): Record<string, unknown> {
  const disabledProviders = runtimeDisabledProviderList(runtimeConfig);
  // Workspace-configured providers win over the harness entries: a user who pinned a
  // provider by hand must not have it replaced by an auto-detected runtime.
  const provider = { ...activeHarnessProviders(), ...runtimeProviderMap(runtimeConfig) };
  return {
    ...runtimeConfig,
    default_agent: runtimeConfig.default_agent ?? "redrob",
    agent: {
      redrob: {
        description: "Redrob Cowork default agent",
        mode: "primary",
        temperature: 0.2,
        prompt: REDROB_AGENT_PROMPT,
        permission: REDROB_AGENT_PERMISSION,
      },
      ...deskAgents({ prompt: REDROB_AGENT_PROMPT, permission: REDROB_AGENT_PERMISSION }),
    },
    plugin: [
      "opencode-chrome-devtools",
      redrobExtensionsPreviewPluginPath(),
      redrobCapabilitiesKnowledgePluginPath(),
      redrobOfficeAttachmentsPluginPath(),
      redrobAnthropicAdaptiveThinkingPluginPath(),
      redrobAnthropicToolSchemaPluginPath(),
      // Enforces a team policy's connector allowlist on every MCP source; see the plugin.
      redrobTeamConnectorsPluginPath(),
      // Labels each request to Redrob Auto with its ModelGuide profession and task, on this machine.
      // Before the privacy gate, so it reads what the person typed; only two ids leave. See the plugin.
      redrobRouteLabelsPluginPath(),
      // Last of Redrob's own, after the office plugin has turned attachments into text: labels
      // everything the model reads and restores what comes back. See the plugin.
      redrobPrivacyGatePluginPath(),
      ...runtimePluginList(runtimeConfig),
    ],
    ...(disabledProviders.length ? { disabled_providers: disabledProviders } : {}),
    mcp: Object.fromEntries(Object.entries(runtimeMcpMap(runtimeConfig))
      .filter(([name]) => !name.startsWith(LEGACY_MANAGED_MCP_SERVER_NAME_PREFIX))),
    ...(Object.keys(provider).length ? { provider } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJsonValue(value[key])]),
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

export async function buildRedrobRuntimeConfig(config?: ServerConfig, workspaceId?: string): Promise<string> {
  return stableStringify(await buildRedrobRuntimeConfigObject(config, workspaceId));
}

export function redrobRuntimeConfigFilePath(config: ServerConfig): string {
  return join(runtimeStorageDir(config), "runtime-opencode-config.json");
}

// Serialize file writes per path so a slow older write can never land after
// (and clobber) a newer one. Content is built inside the queued job so each
// job reads the latest runtime-DB state.
export interface RedrobRuntimeConfigWriteResult {
  path: string;
  changed: boolean;
}

const fileWriteQueue = new Map<string, Promise<RedrobRuntimeConfigWriteResult>>();

/**
 * Rebuild the engine-visible runtime config file from the runtime DB.
 * Atomic (temp file + rename) so the engine never reads a partial file
 * mid-dispose.
 */
export async function writeRedrobRuntimeConfigFile(
  config: ServerConfig,
  workspaceId: string,
): Promise<RedrobRuntimeConfigWriteResult> {
  const path = redrobRuntimeConfigFilePath(config);
  const job = async () => {
    const content = await buildRedrobRuntimeConfig(config, workspaceId);
    const current = await readFile(path, "utf8").catch(() => undefined);
    if (current === content) return { path, changed: false };
    await mkdir(runtimeStorageDir(config), { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, content, "utf8");
    await rename(tmp, path);
    return { path, changed: true };
  };
  const previous = fileWriteQueue.get(path) ?? Promise.resolve();
  const next = previous.then(job, job);
  fileWriteQueue.set(path, next);
  return await next;
}

/**
 * Keep the runtime config file in sync with the runtime DB so every engine
 * instance rebuild reads fresh state instead of a spawn-time snapshot.
 * Returns an unsubscribe function.
 */
export function keepRedrobRuntimeConfigFileFresh(config: ServerConfig, workspaceId: string): () => void {
  return onRuntimeOpencodeConfigWrite((writeConfig, writtenWorkspaceId) => {
    if (writtenWorkspaceId !== workspaceId && !isEngineGlobalRuntimeConfigId(writtenWorkspaceId)) return;
    void writeRedrobRuntimeConfigFile(writeConfig, workspaceId).catch(() => undefined);
  });
}
