import { isBuiltInRedrobWorkExtension, type McpDirectoryInfo } from "../../../app/constants";
import { t } from "../../../i18n";

/**
 * What a user sees on an inventory row:
 * - app: a runtime that runs on this device (Ollama, Computer Use, Browser, Voice)
 * - connection: an account, shared by an organization or signed in by the member
 * - mcp: an MCP server configured in this workspace
 * - skill / command / agent: composer capabilities managed in Library
 * - plugin: organization bundles
 */
export type ExtensionTaxonomy = "app" | "connection" | "mcp" | "skill" | "command" | "agent" | "plugin";

export type ExtensionInventoryFilter = "all" | ExtensionTaxonomy;

export type ExtensionTransport = "mcp" | "native" | null;

export type ExtensionInventoryState = "all" | "ready" | "available";

/** Every taxonomy a Library row can carry, in inventory order. */
export const EXTENSION_TAXONOMIES: ExtensionTaxonomy[] = [
  "app",
  "connection",
  "mcp",
  "skill",
  "command",
  "agent",
  "plugin",
];

export const extensionInventoryFilters: ExtensionInventoryFilter[] = [
  "all",
  ...EXTENSION_TAXONOMIES,
];

/** Built-ins ship with Redrob Cowork and run here, so they are apps. Accounts arrive as org connections. */
export function taxonomyForDirectoryEntry(entry: McpDirectoryInfo): ExtensionTaxonomy {
  if (isBuiltInRedrobWorkExtension(entry) || entry.kind === "ui-control") return "app";
  return "mcp";
}

export function matchesExtensionFilter(
  filter: ExtensionInventoryFilter,
  taxonomy: ExtensionTaxonomy,
  transport: ExtensionTransport = null,
) {
  return filter === "all" || filter === taxonomy || (filter === "mcp" && transport === "mcp");
}

export function extensionFilterLabel(filter: ExtensionInventoryFilter) {
  switch (filter) {
    case "all":
      return t("extensions.filter_all");
    case "app":
      return t("extensions.filter_apps");
    case "connection":
      return t("extensions.filter_connections");
    case "mcp":
      return t("extensions.filter_mcps");
    case "skill":
      return t("extensions.filter_skills");
    case "command":
      return t("extensions.filter_commands");
    case "agent":
      return t("extensions.filter_agents");
    case "plugin":
      return t("extensions.filter_plugins");
  }
}

export function extensionTaxonomyLabel(taxonomy: ExtensionTaxonomy) {
  switch (taxonomy) {
    case "app":
      return t("extensions.badge_app");
    case "connection":
      return t("extensions.badge_connection");
    case "mcp":
      return t("extensions.badge_mcp");
    case "skill":
      return t("extensions.badge_skill");
    case "command":
      return t("extensions.badge_command");
    case "agent":
      return t("extensions.badge_agent");
    case "plugin":
      return t("extensions.badge_plugin");
  }
}

/** One sentence explaining what a taxonomy is, shown on Library detail. */
export function extensionTaxonomyDescription(taxonomy: ExtensionTaxonomy) {
  switch (taxonomy) {
    case "app":
      return t("extension.taxonomy_desc_app");
    case "connection":
      return t("extension.taxonomy_desc_connection");
    case "mcp":
      return t("extension.taxonomy_desc_mcp");
    case "skill":
      return t("extension.taxonomy_desc_skill");
    case "command":
      return t("extension.taxonomy_desc_command");
    case "agent":
      return t("extension.taxonomy_desc_agent");
    case "plugin":
      return t("extension.taxonomy_desc_plugin");
  }
}
