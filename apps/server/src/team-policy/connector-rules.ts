/*
 * Which connectors (MCP servers) a team policy allows. Dependency-free on purpose: redrob-server
 * imports it to refuse adding or enabling a connector, and the engine plugin
 * (opencode-plugins/redrob-team-connectors.ts) bundles it to disable a connector at config load,
 * whichever config file declared it. One rule, two enforcement points.
 *
 * The rule:
 * - A connector that starts a program on this computer (`type: "local"`, or any entry with a
 *   `command`) is allowed only when the policy sets `allowLocalPrograms` AND lists it by name as
 *   `local`.
 * - A remote connector is allowed when the policy lists it by name as `remote`. When the listing
 *   has a `url`, the connector's URL must match it (scheme, host, port and path; query and fragment
 *   ignored, trailing slash ignored). A Cowork-managed connector is matched on the server URL it
 *   signs in to, not on the local gateway URL the engine sees.
 * - Everything else is blocked. An empty allowlist blocks every connector.
 */

export type ConnectorRule = { name: string; type: "remote" | "local"; url?: string };
export type ConnectorPolicy = { allow: readonly ConnectorRule[]; allowLocalPrograms: boolean };

export type ConnectorVerdict =
  | { allowed: true }
  | { allowed: false; reason: "local_programs_blocked" | "not_listed" | "url_mismatch" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether an MCP config entry starts a program here. Anything with a command does, whatever its type says. */
export function startsProgram(entry: unknown): boolean {
  if (!isRecord(entry)) return false;
  return entry.type === "local" || entry.command !== undefined;
}

export function normalizeConnectorUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${url.host.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

export function connectorVerdict(
  policy: ConnectorPolicy,
  name: string,
  entry: unknown,
  options: { managedServerUrl?: string | null } = {},
): ConnectorVerdict {
  const local = startsProgram(entry);
  if (local && !policy.allowLocalPrograms) return { allowed: false, reason: "local_programs_blocked" };
  const rules = policy.allow.filter((rule) => rule.name === name && rule.type === (local ? "local" : "remote"));
  if (rules.length === 0) return { allowed: false, reason: "not_listed" };
  if (local) return { allowed: true };

  const actual = normalizeConnectorUrl(options.managedServerUrl ?? (isRecord(entry) ? entry.url : undefined));
  for (const rule of rules) {
    if (rule.url === undefined) return { allowed: true };
    if (actual && normalizeConnectorUrl(rule.url) === actual) return { allowed: true };
  }
  return { allowed: false, reason: "url_mismatch" };
}

/** The names in an MCP map the policy blocks, with why. */
export function blockedConnectors(
  policy: ConnectorPolicy,
  mcp: Record<string, unknown>,
  managedServerUrls: Record<string, string> = {},
): Array<{ name: string; reason: Exclude<ConnectorVerdict, { allowed: true }>["reason"] }> {
  const blocked: Array<{ name: string; reason: Exclude<ConnectorVerdict, { allowed: true }>["reason"] }> = [];
  for (const [name, entry] of Object.entries(mcp)) {
    const verdict = connectorVerdict(policy, name, entry, { managedServerUrl: managedServerUrls[name] ?? null });
    if (!verdict.allowed) blocked.push({ name, reason: verdict.reason });
  }
  return blocked;
}

/** The file the server writes next to the engine's runtime config, and the plugin reads. */
export const TEAM_CONNECTORS_FILE = "team-connectors.json";

export type TeamConnectorsFile = {
  v: 1;
  workspaces: Array<{
    /** Absolute, resolved workspace directory. */
    directory: string;
    accountId: string;
    version: number;
    policy: ConnectorPolicy;
    /** Cowork-managed connectors: name -> the server URL they sign in to. */
    managed: Record<string, string>;
  }>;
};

export function parseTeamConnectorsFile(value: unknown): TeamConnectorsFile | null {
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.workspaces)) return null;
  const workspaces: TeamConnectorsFile["workspaces"] = [];
  for (const item of value.workspaces) {
    if (!isRecord(item) || typeof item.directory !== "string" || !isRecord(item.policy)) return null;
    const allow = Array.isArray(item.policy.allow) ? item.policy.allow : null;
    if (!allow) return null;
    const rules: ConnectorRule[] = [];
    for (const rule of allow) {
      if (!isRecord(rule) || typeof rule.name !== "string" || (rule.type !== "remote" && rule.type !== "local")) return null;
      rules.push({ name: rule.name, type: rule.type, ...(typeof rule.url === "string" ? { url: rule.url } : {}) });
    }
    const managed: Record<string, string> = {};
    if (isRecord(item.managed)) {
      for (const [name, url] of Object.entries(item.managed)) if (typeof url === "string") managed[name] = url;
    }
    workspaces.push({
      directory: item.directory,
      accountId: typeof item.accountId === "string" ? item.accountId : "",
      version: typeof item.version === "number" ? item.version : 0,
      policy: { allow: rules, allowLocalPrograms: item.policy.allowLocalPrograms === true },
      managed,
    });
  }
  return { v: 1, workspaces };
}
