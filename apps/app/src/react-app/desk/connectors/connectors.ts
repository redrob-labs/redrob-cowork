import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { MCP_QUICK_CONNECT, getMcpServerName, type McpDirectoryInfo } from "../../../app/constants";
import type { RedrobMcpItem, RedrobServerClient } from "../../../app/lib/redrob-server";
import type { Client } from "../../../app/types";
import { t } from "../../../i18n";
import type { Connector, ConnectorServer, ConnectorState } from "../services/types";
import type { ToastTone } from "../store/frame-store";

/** A configured server as redrob-server lists it. */
export type DeskMcpEntry = Pick<RedrobMcpItem, "name" | "config" | "source" | "disabledByTools" | "managedOAuth">;

/** The engine's live state for one server: connected, failed, needs_auth, disabled, ... */
export type DeskMcpStatus = { status: string };
export type DeskMcpStatusMap = Record<string, DeskMcpStatus>;

// The config is a free-form record from the server; read only what Desk needs.
const configSchema = z.object({
  type: z.enum(["remote", "local"]).optional(),
  url: z.string().optional(),
  enabled: z.boolean().optional(),
});

const statusMapSchema = z.record(z.string(), z.object({ status: z.string() }));

/** Our own icon for the kind of app; no maker logos. */
const KNOWN_ICONS: Record<string, string> = {
  notion: "note",
  linear: "kanban",
  sentry: "code",
  stripe: "receipt",
  context7: "book",
};

/**
 * The connectors Redrob offers by name: the quick-connect catalog's apps. The UI control
 * server, the built-in extensions and anything hidden from the catalog are not among them.
 */
function knownCatalogEntry(name: string): McpDirectoryInfo | undefined {
  return MCP_QUICK_CONNECT.find((entry) => entry.kind === "mcp" && !entry.defaultHidden && getMcpServerName(entry) === name);
}

/**
 * Known when Redrob offers it (catalog) or signs in to it itself (managed). Everything
 * else was added by hand, with a URL or a command: one of the tools your team built.
 */
export function isCustomMcp(entry: Pick<DeskMcpEntry, "name" | "managedOAuth">): boolean {
  return !entry.managedOAuth && !knownCatalogEntry(entry.name);
}

/** `my_crm-server` reads "My crm server"; a word that names the plumbing is dropped. */
export function prettifyServerName(name: string): string {
  const words = name
    .split(/[\s_\-.]+/)
    .filter((word) => word && !/^(mcp|server)$/i.test(word));
  const text = words.join(" ") || name;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the card says about a server, from its config, its sign-in and the engine's status. */
export function connectorState(entry: DeskMcpEntry, status: DeskMcpStatus | undefined): ConnectorState {
  const config = configSchema.safeParse(entry.config);
  if (entry.disabledByTools || (config.success && config.data.enabled === false)) return "off";
  const managed = entry.managedOAuth;
  if (managed) {
    if (!managed.enabled) return "off";
    if (managed.status === "connected") return status?.status === "failed" ? "failed" : "connected";
    return "needs-sign-in";
  }
  switch (status?.status) {
    case "connected":
      return "connected";
    case "disabled":
      return "off";
    case "needs_auth":
    case "needs_client_registration":
    case "reconnect_required":
      return "needs-sign-in";
    default:
      return "failed";
  }
}

/** One configured server as a Desk connector. */
export function connectorFromMcp(entry: DeskMcpEntry, status: DeskMcpStatus | undefined): Connector {
  const config = configSchema.safeParse(entry.config);
  const known = knownCatalogEntry(entry.name);
  const custom = isCustomMcp(entry);
  const type = config.success && config.data.type === "local" ? "local" : "remote";
  const url = entry.managedOAuth?.serverUrl ?? (config.success ? config.data.url : undefined);
  return {
    id: entry.name,
    name: known?.name ?? prettifyServerName(entry.name),
    maker: "",
    category: "",
    icon: KNOWN_ICONS[entry.name] ?? "plug",
    does: known?.description ?? (custom ? t("desk.connectors_custom_does") : ""),
    state: connectorState(entry, status),
    custom,
    server: { name: entry.name, managed: Boolean(entry.managedOAuth), type, ...(url ? { url } : {}) },
  };
}

/** Connected first, then by name. */
export function connectorsFromMcp(entries: readonly DeskMcpEntry[], statuses: DeskMcpStatusMap): Connector[] {
  return entries
    .map((entry) => connectorFromMcp(entry, statuses[entry.name]))
    .sort((a, b) => Number(b.state === "connected") - Number(a.state === "connected") || a.name.localeCompare(b.name));
}

/** The tools your team built show only in Developer mode. */
export function visibleConnectors(connectors: readonly Connector[], developerMode: boolean): Connector[] {
  return developerMode ? [...connectors] : connectors.filter((connector) => !connector.custom);
}

/** The menu's count: connected, among what the screen shows. */
export function connectedCount(connectors: readonly Connector[], developerMode: boolean): number {
  return visibleConnectors(connectors, developerMode).filter((connector) => connector.state === "connected").length;
}

export type McpStatusClient = { mcp: Pick<Client["mcp"], "status"> };

/** Reads the engine's live status for the open folder; null without an engine client. */
export function mcpStatusReader(
  opencode: McpStatusClient | null,
  directory: string | null,
): (() => Promise<DeskMcpStatusMap>) | null {
  if (!opencode) return null;
  return async () => {
    const result = await opencode.mcp.status(directory ? { directory } : {});
    const parsed = statusMapSchema.safeParse(result.data);
    return parsed.success ? parsed.data : {};
  };
}

export const CONNECTORS_QUERY_KEY = "desk-connectors";

/** After a connector changes: the screen's list and the menu's count (any developer mode). */
export async function invalidateConnectors(queryClient: Pick<QueryClient, "invalidateQueries">, scope: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [CONNECTORS_QUERY_KEY, scope] }),
    queryClient.invalidateQueries({ queryKey: ["desk-nav", scope, "connected"] }),
  ]);
}

/** The entry the existing sign-in dialog takes for a configured server. */
export function signInEntry(server: ConnectorServer): McpDirectoryInfo {
  return {
    name: server.name,
    serverName: server.name,
    description: "",
    type: server.type,
    oauth: true,
    ...(server.url ? { url: server.url } : {}),
  };
}

export type ConnectorActionDeps = {
  client: Pick<RedrobServerClient, "connectManagedMcp" | "setMcpEnabled"> | null;
  workspaceId: string | null;
  /** Opens the sign-in page in the browser. */
  openLink: (url: string) => void;
  /** Opens the sign-in dialog the settings use, for a server the engine signs in to. */
  openSignIn: (entry: McpDirectoryInfo) => void;
  refresh: () => Promise<void> | void;
  showToast: (title: string, text?: string, tone?: ToastTone) => void;
};

function connectorFailed(deps: ConnectorActionDeps) {
  deps.showToast(t("desk.connectors_failed"), t("desk.settings_try_again"), "danger");
}

/**
 * Sign in: a server Redrob signs in to opens its sign-in page; any other opens the
 * engine's sign-in dialog, the same flow as in the settings.
 */
export async function signInConnector(
  deps: ConnectorActionDeps,
  connector: Connector,
): Promise<"page" | "connected" | "dialog" | "none"> {
  const server = connector.server;
  if (!server) return "none";
  if (!server.managed) {
    deps.openSignIn(signInEntry(server));
    return "dialog";
  }
  if (!deps.client || !deps.workspaceId) return "none";
  try {
    const result = await deps.client.connectManagedMcp(deps.workspaceId, server.name);
    if (result.status === "needs_auth") {
      deps.openLink(result.authorizeUrl);
      return "page";
    }
  } catch {
    connectorFailed(deps);
    return "none";
  }
  await deps.refresh();
  deps.showToast(t("desk.connectors_connected_toast", { name: connector.name }));
  return "connected";
}

/** Turn on or off, through the same switch the settings use. */
export async function setConnectorEnabled(
  deps: ConnectorActionDeps,
  connector: Connector,
  enabled: boolean,
): Promise<boolean> {
  const server = connector.server;
  if (!server || !deps.client || !deps.workspaceId) return false;
  try {
    await deps.client.setMcpEnabled(deps.workspaceId, server.name, enabled);
  } catch {
    connectorFailed(deps);
    return false;
  }
  await deps.refresh();
  deps.showToast(
    enabled
      ? t("desk.connectors_on_toast", { name: connector.name })
      : t("desk.connectors_off_toast", { name: connector.name }),
  );
  return true;
}

/** The line under the name: how the connector stands, when it is not connected. */
export function connectorStateLabel(state: ConnectorState): string {
  switch (state) {
    case "connected":
      return t("desk.connectors_state_connected");
    case "needs-sign-in":
      return t("desk.connectors_state_sign_in");
    case "off":
      return t("desk.connectors_state_off");
    case "failed":
      return t("desk.connectors_state_failed");
  }
}
