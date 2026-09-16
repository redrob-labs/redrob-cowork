import { getMcpServerName, isBuiltInRedrobWorkExtension, type McpDirectoryInfo } from "../../../app/constants";
import { evaluateEnablement, type EnablementContext } from "../../../app/enablement";
import type { EnablementResult } from "../../../app/extensions";
import type { McpServerEntry, SkillCard } from "../../../app/types";

/**
 * `marketplace` and `org-connection` sources are gone with the control plane:
 * organization marketplaces, imported cloud plugins and organization-managed
 * MCP connections no longer exist. What is left is what the machine itself
 * knows about — built-in extensions, locally configured MCP servers, and
 * installed skills.
 */
export type ExtensionItemSource = "builtin" | "mcp-directory" | "skill";
export type ExtensionInstallState = "available" | "installed";
export type ExtensionSetupState = "ready" | "needs_setup" | "partial";
export type ExtensionInventoryGroup = "ready" | "available" | "disabled";

export type ResolveExtensionInventoryGroupOptions = {
  disabledReason?: string | null;
};

export type ExtensionResourceItem = {
  id: string;
  type: string;
  title: string;
  path?: string;
};

export type ExtensionItem = {
  id: string;
  source: ExtensionItemSource;
  name: string;
  description: string | null;
  installState: ExtensionInstallState;
  setupState: ExtensionSetupState;
  active: boolean;
  enablement: { active: boolean; results: EnablementResult[] } | null;
  resources: ExtensionResourceItem[];
  builtInEntry?: McpDirectoryInfo;
  mcpEntry?: McpDirectoryInfo;
  skill?: { name: string; description?: string; path: string };
};

/** Map an inventory item into the unified Extensions readiness groups. */
export function resolveExtensionInventoryGroup(
  item: ExtensionItem,
  opts: ResolveExtensionInventoryGroupOptions = {},
): ExtensionInventoryGroup {
  if (opts.disabledReason) return "disabled";
  if (item.installState === "available") return "available";
  return "ready";
}

export type ExtensionItemBuildInput = {
  quickConnect: McpDirectoryInfo[];
  mcpServers: McpServerEntry[];
  installedSkills: Array<{ name: string; description?: string; path: string }>;
  enablementContext: EnablementContext;
  isBuiltInConnected: (entry: McpDirectoryInfo) => boolean;
};

const REDROB_PROVIDED_SKILL_NAMES = new Set([
  "workspace-guide",
  "skill-creator",
]);

export function isRedrobProvidedSkill(skill: Pick<SkillCard, "name" | "path">) {
  const normalizedName = skill.name.trim().toLowerCase();
  const normalizedPath = skill.path.replace(/\\/g, "/").toLowerCase();
  // Either config folder: `.redrob` is current, `.opencode` legacy. Matching only the legacy name
  // meant a skill we ship under `.redrob/skills/` was not recognised as ours, so the UI offered to
  // uninstall it as if it were the user's own.
  const inConfigFolder =
    normalizedPath.includes("/.redrob/skills/") || normalizedPath.includes("/.opencode/skills/");
  return inConfigFolder && REDROB_PROVIDED_SKILL_NAMES.has(normalizedName);
}

export function isToggleControlledExtension(entry: McpDirectoryInfo) {
  return entry.extensionManifest?.enablement?.some((condition) => condition.type === "toggle-enabled") === true;
}

function setupStateFromEnablement(enablement: { active: boolean; results: EnablementResult[] } | null): ExtensionSetupState {
  if (!enablement || enablement.results.length === 0) return "needs_setup";
  if (enablement.active) return "ready";
  return enablement.results.some((result) => result.met) ? "partial" : "needs_setup";
}

/**
 * The Redrob provider is not an extension a user installs or removes -- it is the engine's own
 * provider, connected from Settings, and it is present in every install. Listing it in the Library
 * beside skills and MCP servers implied it was optional and left a "Connect Redrob" card sitting in
 * READY TO USE after it was already connected.
 *
 * Excluded by provider id rather than by display name, so renaming the card cannot resurrect it.
 */
const LIBRARY_EXCLUDED_BUILTIN_IDS = new Set(["redrob"]);

const isLibraryListedBuiltIn = (entry: { id?: string | null }) =>
  !LIBRARY_EXCLUDED_BUILTIN_IDS.has((entry.id ?? "").trim().toLowerCase());

export function buildExtensionItems(input: ExtensionItemBuildInput) {
  const builtInItems = input.quickConnect
    .filter(isBuiltInRedrobWorkExtension)
    .filter(isLibraryListedBuiltIn)
    .map((entry): ExtensionItem => {
    const enablement = entry.extensionManifest?.enablement
      ? evaluateEnablement(entry.extensionManifest.enablement, input.enablementContext)
      : null;
    const active = enablement?.active ?? input.isBuiltInConnected(entry);
    return {
      id: `builtin:${entry.id ?? entry.serverName ?? entry.name}`,
      source: "builtin",
      name: entry.name,
      description: entry.description,
      installState: active ? "installed" : "available",
      setupState: enablement ? setupStateFromEnablement(enablement) : active ? "ready" : "needs_setup",
      active,
      enablement,
      resources: entry.extensionManifest?.resources.map((resource) => ({
        id: resource.id,
        type: resource.type,
        title: resource.label ?? resource.id,
        path: resource.path,
      })) ?? [],
      builtInEntry: entry,
    };
  });

  const standaloneMcpEntries = input.quickConnect.filter((entry) => {
    if (isBuiltInRedrobWorkExtension(entry)) return false;
    const serverName = getMcpServerName(entry);
    return input.mcpServers.some((server) => server.name === serverName);
  });

  const standaloneSkillItems = input.installedSkills.map((skill): ExtensionItem => ({
    id: `skill:${skill.name}`,
    source: "skill",
    name: skill.name,
    description: skill.description ?? null,
    installState: "installed",
    setupState: "ready",
    active: true,
    enablement: null,
    resources: [{ id: skill.name, type: "skill", title: skill.name, path: skill.path }],
    skill,
  }));

  const mcpDirectoryItems = standaloneMcpEntries.map((entry): ExtensionItem => ({
    id: `mcp:${getMcpServerName(entry)}`,
    source: "mcp-directory",
    name: entry.name,
    description: entry.description,
    installState: "installed",
    setupState: "ready",
    active: true,
    enablement: null,
    resources: [{ id: getMcpServerName(entry), type: "mcp", title: entry.name }],
    mcpEntry: entry,
  }));

  return {
    items: [...builtInItems, ...mcpDirectoryItems, ...standaloneSkillItems],
    builtInItems,
    installedMcpEntries: [
      ...builtInItems.flatMap((item) => item.active && item.builtInEntry ? [item.builtInEntry] : []),
      ...standaloneMcpEntries,
    ],
    // Extensions is an inventory, not a browse catalog: built-ins always show
    // so they can be turned on, and everything else only shows once it is
    // configured here.
    quickConnectEntries: [
      ...builtInItems.flatMap((item) => item.builtInEntry ? [item.builtInEntry] : []),
      ...standaloneMcpEntries,
    ],
    installedSkills: standaloneSkillItems.flatMap((item) => item.skill ? [item.skill] : []),
  };
}
