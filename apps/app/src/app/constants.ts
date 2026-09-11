import type { ModelRef, SuggestedPlugin } from "./types";
import { t } from "../i18n";
import {
  BUILT_IN_REDROB_EXTENSION_MANIFESTS,
  extensionContribution,
  extensionResource,
  isTrustedBuiltInExtension,
  type RedrobWorkExtensionManifest,
  type RedrobWorkExtensionPlatform,
} from "./extensions";
import {
  REDROB_MODEL_ID,
  REDROB_PROVIDER_ID,
} from "../react-app/domains/settings/redrob-provider";

export const MODEL_PREF_KEY = "redrob.defaultModel";
export const SESSION_MODEL_PREF_KEY = "redrob.sessionModels";
export const THINKING_PREF_KEY = "redrob.showThinking";
export const VARIANT_PREF_KEY = "redrob.modelVariant";
export { LANGUAGE_PREF_KEY } from "../i18n";
export const HIDE_TITLEBAR_PREF_KEY = "redrob.hideTitlebar";

export const DEFAULT_MODEL: ModelRef = {
  providerID: REDROB_PROVIDER_ID,
  modelID: REDROB_MODEL_ID,
};

export const SUGGESTED_PLUGINS: SuggestedPlugin[] = [];

export type ExtensionKind = "mcp" | "plugin" | "skill" | "ui-control" | "extension";

export type McpDirectoryInfo = {
  id?: string;
  /** Display name shown in the UI. */
  name: string;
  /** Safe server name for redrob.jsonc (alphanumeric, - and _ only). Auto-derived from name if omitted. */
  serverName?: string;
  description: string;
  url?: string;
  type?: "remote" | "local";
  command?: string[];
  oauth: boolean;
  /** Route OAuth through the local Redrob Work gateway instead of delegating it to OpenCode. */
  managedOAuth?: boolean;
  /** Identifies MCP entries owned by the app instead of workspace configuration. */
  managedBy?: "redrob-connect";
  oauthConfig?: {
    clientId?: string;
    clientSecret?: string;
    scope?: string;
  };
  /** Extension category for UI grouping. Defaults to "mcp". */
  kind?: ExtensionKind;
  /** Simple Icons slug for brand icon (e.g. "notion", "stripe", "figma"). */
  iconSlug?: string;
  /** Direct icon URL (e.g. local SVG). Takes priority over iconSlug. */
  iconSrc?: string;
  /** Prompt inserted from the composer extension picker. */
  composerPrompt?: string;
  /** Whether Redrob Work should show this extension as enabled before user setup. */
  defaultEnabled?: boolean;
  /** Whether Redrob Work should hide this extension from the default catalog view. */
  defaultHidden?: boolean;
  /** Whether this extension is still in preview. */
  preview?: boolean;
  /** Normalized extension manifest backing this catalog entry. */
  extensionManifest?: RedrobWorkExtensionManifest;
};

function extensionManifestToDirectoryInfo(manifest: RedrobWorkExtensionManifest): McpDirectoryInfo {
  const mcpResource = extensionResource(manifest, "mcp");
  return {
    id: manifest.id,
    name: manifest.name,
    serverName: mcpResource?.mcpServerName ?? manifest.id,
    description: manifest.description,
    type: mcpResource?.command ? "local" : undefined,
    command: mcpResource?.command,
    oauth: false,
    kind: "extension",
    iconSlug: manifest.icon?.simpleIconSlug,
    iconSrc: manifest.icon?.src,
    composerPrompt: extensionContribution(manifest, "composer-prompt")?.prompt ?? manifest.composer?.prompt,
    defaultEnabled: manifest.defaultEnabled,
    defaultHidden: manifest.defaultHidden,
    preview: manifest.preview,
    extensionManifest: manifest,
  };
}

export function isBuiltInRedrobWorkExtension(entry: Pick<McpDirectoryInfo, "kind" | "extensionManifest">): boolean {
  return entry.kind === "extension" && isTrustedBuiltInExtension(entry.extensionManifest);
}

/** Derive a safe MCP server name from a display name or explicit serverName. */
export function getMcpServerName(entry: McpDirectoryInfo): string {
  if (entry.serverName) return entry.serverName;
  return entry.name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "mcp";
}

export const MCP_QUICK_CONNECT: McpDirectoryInfo[] = [
  {
    get name() { return t("mcp.quick_connect_notion_title"); },
    serverName: "notion",
    get description() { return t("mcp.quick_connect_notion_desc"); },
    url: "https://mcp.notion.com/mcp",
    type: "remote",
    oauth: true,
    kind: "mcp",
    iconSlug: "notion",
    iconSrc: "/ext-notion.svg",
  },
  {
    get name() { return t("mcp.quick_connect_linear_title"); },
    serverName: "linear",
    get description() { return t("mcp.quick_connect_linear_desc"); },
    url: "https://mcp.linear.app/mcp",
    type: "remote",
    oauth: true,
    kind: "mcp",
    iconSlug: "linear",
    iconSrc: "/ext-linear.svg",
  },
  {
    get name() { return t("mcp.quick_connect_sentry_title"); },
    serverName: "sentry",
    get description() { return t("mcp.quick_connect_sentry_desc"); },
    url: "https://mcp.sentry.dev/mcp",
    type: "remote",
    oauth: true,
    kind: "mcp",
    iconSlug: "sentry",
    iconSrc: "/ext-sentry.svg",
  },
  {
    get name() { return t("mcp.quick_connect_stripe_title"); },
    serverName: "stripe",
    get description() { return t("mcp.quick_connect_stripe_desc"); },
    url: "https://mcp.stripe.com",
    type: "remote",
    oauth: true,
    kind: "mcp",
    iconSlug: "stripe",
    iconSrc: "/ext-stripe.svg",
  },
  {
    get name() { return t("mcp.quick_connect_context7_title"); },
    serverName: "context7",
    get description() { return t("mcp.quick_connect_context7_desc"); },
    url: "https://mcp.context7.com/mcp",
    type: "remote",
    oauth: false,
    kind: "mcp",
    iconSlug: "semanticscholar",
    iconSrc: "/ext-context7.svg",
  },
  {
    get name() { return t("mcp.quick_connect_redrob_ui_title"); },
    serverName: "redrob-ui",
    get description() { return t("mcp.quick_connect_redrob_ui_desc"); },
    type: "local",
    // Dev builds replace this with the local checkout path before writing config.
    command: ["npx", "-y", "redrob-ui-mcp"],
    oauth: false,
    kind: "ui-control",
    iconSrc: "/redrob-mark.svg",
    // Internal UI-control surface for agents driving the desktop app. Hidden
    // from the default catalog; "Show hidden" reveals it.
    defaultHidden: true,
  },
  ...BUILT_IN_REDROB_EXTENSION_MANIFESTS.map(extensionManifestToDirectoryInfo),
];

export const REDROB_EXTENSION_CATALOG = MCP_QUICK_CONNECT.filter((entry) => entry.kind === "extension");

export function resolveRedrobWorkExtensionCatalogPlatform(
  platform: "web" | "desktop",
  os?: "macos" | "windows" | "linux",
): RedrobWorkExtensionPlatform {
  if (platform === "web") return "web";
  if (os === "macos") return "darwin";
  if (os === "windows") return "windows";
  return "linux";
}

export function filterRedrobWorkExtensionCatalogForPlatform<TEntry extends Pick<McpDirectoryInfo, "extensionManifest">>(
  entries: TEntry[],
  platform: RedrobWorkExtensionPlatform,
): TEntry[] {
  return entries.filter((entry) => {
    const platforms = entry.extensionManifest?.platform;
    return !platforms || platforms.includes(platform);
  });
}
