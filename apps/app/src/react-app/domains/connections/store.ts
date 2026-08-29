import { useSyncExternalStore } from "react";

import { applyEdits, modify, parse, printParseErrorCode } from "jsonc-parser";

import { t } from "../../../i18n";
import {
  getMcpServerName,
  MCP_QUICK_CONNECT,
  type McpDirectoryInfo,
} from "../../../app/constants";
import { extensionResource } from "../../../app/extensions";
import { createClient, unwrap } from "../../../app/lib/opencode";
import { finishPerf, perfNow, recordPerfLog } from "../../../app/lib/perf-log";
import {
  assertDesktopWebUrl,
  openDesktopUrl,
  readOpencodeConfig,
  writeOpencodeConfig,
  type OpencodeConfigFile,
} from "../../../app/lib/desktop";
import { toSessionTransportDirectory } from "../../../app/lib/session-scope";
import {
  parseMcpServersFromContent,
  removeMcpFromConfig,
  validateMcpServerName,
} from "../../../app/mcp";
import {
  buildRedrobWorkspaceBaseUrl,
  type RedrobServerClient,
} from "../../../app/lib/redrob-server";
import type {
  Client,
  McpServerEntry,
  McpStatusMap,
  ReloadReason,
  ReloadTrigger,
} from "../../../app/types";
import { isDesktopRuntime, normalizeDirectoryPath, safeStringify } from "../../../app/utils";

import type { RedrobServerStore } from "./redrob-server-store";
import { attemptSilentMcpReauth } from "./mcp-silent-reauth";

type SetStateAction<T> = T | ((current: T) => T);

// Re-mint when less than a day of token validity remains. Must be well
// below the minted token TTL (7 days, DEN_FIRST_PARTY_MCP_TOKEN_TTL_MS in
// den-api): when the two were equal, the marker was stale the instant it
// was written and every sync tick re-wrote the MCP config.
const LOCAL_REDROB_SERVER_RECOVERY_TIMEOUT_MS = 30_000;

async function withLocalRedrobServerRecoveryTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(t("mcp.connect_failed"))), timeoutMs);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export type ConnectionsStoreSnapshot = {
  mcpServers: McpServerEntry[];
  mcpStatus: string | null;
  mcpLastUpdatedAt: number | null;
  mcpStatuses: McpStatusMap;
  mcpConnectingName: string | null;
  selectedMcp: string | null;
  mcpAuthModalOpen: boolean;
  mcpAuthEntry: McpDirectoryInfo | null;
  mcpAuthNeedsReload: boolean;
  /** False when the server reports managed OAuth secure storage is unavailable. */
  managedOAuthAvailable: boolean;
};

type MutableState = ConnectionsStoreSnapshot;

export type ConnectionsStore = ReturnType<typeof createConnectionsStore>;

export type McpConnectResult =
  | { ok: true }
  | { ok: false; error: string };

export function createConnectionsStore(options: {
  client: () => Client | null;
  setClient: (value: Client | null) => void;
  projectDir: () => string;
  selectedWorkspaceId: () => string;
  selectedWorkspaceRoot: () => string;
  workspaceType: () => "local" | "remote";
  redrobServer: RedrobServerStore;
  runtimeWorkspaceId: () => string | null;
  ensureRuntimeWorkspaceId?: () => Promise<string | null | undefined>;
  localRedrobServerRecoveryTimeoutMs?: number;
  setProjectDir?: (value: string) => void;
  developerMode: () => boolean;
  markReloadRequired?: (reason: ReloadReason, trigger?: ReloadTrigger) => void;
}) {
  const listeners = new Set<() => void>();

  let started = false;
  let disposed = false;
  let lastWorkspaceContextKey = "";
  let lastProjectDir = "";
  let snapshot: ConnectionsStoreSnapshot;

  let state: MutableState = {
    mcpServers: [],
    mcpStatus: null,
    mcpLastUpdatedAt: null,
    mcpStatuses: {},
    mcpConnectingName: null,
    selectedMcp: null,
    mcpAuthModalOpen: false,
    mcpAuthEntry: null,
    mcpAuthNeedsReload: false,
    managedOAuthAvailable: true,
  };

  const emitChange = () => {
    for (const listener of listeners) listener();
  };

  const refreshSnapshot = () => {
    snapshot = {
      mcpServers: state.mcpServers,
      mcpStatus: state.mcpStatus,
      mcpLastUpdatedAt: state.mcpLastUpdatedAt,
      mcpStatuses: state.mcpStatuses,
      mcpConnectingName: state.mcpConnectingName,
      selectedMcp: state.selectedMcp,
      mcpAuthModalOpen: state.mcpAuthModalOpen,
      mcpAuthEntry: state.mcpAuthEntry,
      mcpAuthNeedsReload: state.mcpAuthNeedsReload,
      managedOAuthAvailable: state.managedOAuthAvailable,
    };
  };

  const mutateState = (updater: (current: MutableState) => MutableState) => {
    state = updater(state);
    refreshSnapshot();
    emitChange();
  };

  const setStateField = <K extends keyof MutableState>(key: K, value: MutableState[K]) => {
    if (Object.is(state[key], value)) return;
    mutateState((current) => ({ ...current, [key]: value }));
  };

  const applyStateAction = <T,>(current: T, next: SetStateAction<T>) =>
    typeof next === "function" ? (next as (value: T) => T)(current) : next;

  const getWorkspaceContextKey = () => {
    const workspaceId = options.selectedWorkspaceId().trim();
    const root = normalizeDirectoryPath(options.selectedWorkspaceRoot().trim());
    const runtimeWorkspaceId = (options.runtimeWorkspaceId() ?? "").trim();
    const workspaceType = options.workspaceType();
    return `${workspaceType}:${workspaceId}:${root}:${runtimeWorkspaceId}`;
  };

  const getRedrobSnapshot = () => options.redrobServer.getSnapshot();

  const resolveRedrobWorkspaceId = async () => {
    const current = options.runtimeWorkspaceId()?.trim();
    if (current) return current;
    const redrobSnapshot = getRedrobSnapshot();
    if (redrobSnapshot.redrobServerStatus !== "connected" || !redrobSnapshot.redrobServerClient) {
      return null;
    }
    const ensured = (await options.ensureRuntimeWorkspaceId?.())?.trim();
    if (ensured) return ensured;
    return options.workspaceType() === "local" ? options.selectedWorkspaceId().trim() || null : null;
  };

  const resolveConfigRedrobTarget = async (mode: "read" | "write") => {
    const redrobSnapshot = getRedrobSnapshot();
    const redrobClient = redrobSnapshot.redrobServerClient;
    const redrobWorkspaceId = await resolveRedrobWorkspaceId();
    const hasRedrobTarget =
      redrobSnapshot.redrobServerStatus === "connected" &&
      Boolean(redrobClient && redrobWorkspaceId);
    const canUseRedrobServer =
      hasRedrobTarget &&
      redrobSnapshot.redrobServerCapabilities?.config?.[mode] !== false;
    return {
      redrobClient,
      redrobWorkspaceId,
      hasRedrobTarget,
      canUseRedrobServer,
    };
  };

  const resolveMcpRedrobTarget = async (mode: "read" | "write") => {
    let redrobSnapshot = getRedrobSnapshot();
    let redrobClient = redrobSnapshot.redrobServerClient;
    let redrobWorkspaceId = await resolveRedrobWorkspaceId();
    if ((!redrobClient || !redrobWorkspaceId || redrobSnapshot.redrobServerStatus !== "connected")
      && isDesktopRuntime()
      && options.workspaceType() === "local") {
      redrobClient = await withLocalRedrobServerRecoveryTimeout(
        options.redrobServer.ensureLocalRedrobServerClient(),
        options.localRedrobServerRecoveryTimeoutMs ?? LOCAL_REDROB_SERVER_RECOVERY_TIMEOUT_MS,
      );
      redrobSnapshot = getRedrobSnapshot();
      redrobWorkspaceId = options.runtimeWorkspaceId()?.trim()
        || (await options.ensureRuntimeWorkspaceId?.())?.trim()
        || options.selectedWorkspaceId().trim()
        || null;
    }
    const hasRedrobTarget =
      Boolean(redrobClient && redrobWorkspaceId);
    const canUseRedrobServer =
      hasRedrobTarget &&
      redrobSnapshot.redrobServerCapabilities?.mcp?.[mode] !== false;
    return {
      redrobClient,
      redrobWorkspaceId,
      hasRedrobTarget,
      canUseRedrobServer,
    };
  };

  const filterConfiguredStatuses = (status: McpStatusMap, entries: McpServerEntry[]) => {
    const configured = new Set(entries.map((entry) => entry.name));
    return Object.fromEntries(
      Object.entries(status).filter(([name]) => configured.has(name)),
    ) as McpStatusMap;
  };

  const readMcpConfigFile = async (scope: "project" | "global"): Promise<OpencodeConfigFile | null> => {
    const projectDir = options.projectDir().trim();
    const { redrobClient, redrobWorkspaceId, hasRedrobTarget, canUseRedrobServer } =
      await resolveConfigRedrobTarget("read");

    if (canUseRedrobServer && redrobClient && redrobWorkspaceId) {
      return redrobClient.readOpencodeConfigFile(redrobWorkspaceId, scope);
    }

    if (hasRedrobTarget) {
      return null;
    }

    if (options.workspaceType() !== "local" || !isDesktopRuntime()) {
      return null;
    }

    return readOpencodeConfig(scope, projectDir) as Promise<OpencodeConfigFile>;
  };

  const ensureActiveClient = async () => {
    let activeClient = options.client();
    if (activeClient) {
      return activeClient;
    }

    const redrobSnapshot = getRedrobSnapshot();
    const redrobBaseUrl = redrobSnapshot.redrobServerBaseUrl.trim();
    const token = redrobSnapshot.redrobServerAuth.token?.trim();
    if (!redrobBaseUrl || !token) {
      return null;
    }

    const mountedBaseUrl =
      buildRedrobWorkspaceBaseUrl(redrobBaseUrl, await resolveRedrobWorkspaceId()) ?? redrobBaseUrl;
    activeClient = createClient(`${mountedBaseUrl.replace(/\/+$/, "")}/opencode`, undefined, {
      token,
      mode: "redrob",
    });
    options.setClient(activeClient);
    return activeClient;
  };

  const resolveWritableRedrobTarget = async () => {
    return resolveMcpRedrobTarget("write");
  };

  const resolveProjectDir = async (activeClient: Client | null, currentProjectDir: string) => {
    let resolvedProjectDir = currentProjectDir;
    if (!resolvedProjectDir && activeClient) {
      try {
        const pathInfo = unwrap(await activeClient.path.get());
        const discoveredRaw = toSessionTransportDirectory(pathInfo.directory ?? "");
        const discovered = discoveredRaw.replace(/^\/private\/tmp(?=\/|$)/, "/tmp");
        if (discovered) {
          resolvedProjectDir = discovered;
          options.setProjectDir?.(discovered);
        }
      } catch {
        // ignore
      }
    }

    return resolvedProjectDir;
  };

  const listMcpFromRedrobServer = async (projectDir: string) => {
    const redrobSnapshot = getRedrobSnapshot();
    const { redrobClient, redrobWorkspaceId, hasRedrobTarget, canUseRedrobServer } =
      await resolveMcpRedrobTarget("read");
    const canTryRedrobServer = canUseRedrobServer;

    recordPerfLog(options.developerMode(), "mcp.refresh", "server-path-check", {
      workspaceType: options.workspaceType(),
      projectDir: projectDir || null,
      redrobStatus: redrobSnapshot.redrobServerStatus,
      hasRedrobClient: Boolean(redrobClient),
      redrobWorkspaceId: redrobWorkspaceId ?? null,
      canReadMcp: redrobSnapshot.redrobServerCapabilities?.mcp?.read ?? null,
      canTryRedrobServer,
    });

    if (hasRedrobTarget && !canTryRedrobServer) {
      throw new Error(t("mcp.status_cannot_read_config"));
    }

    if (!canTryRedrobServer || !redrobClient || !redrobWorkspaceId) return null;

    const response = await redrobClient.listMcp(redrobWorkspaceId);
    const next = response.items.map((entry) => ({
      name: entry.name,
      config: entry.config as McpServerEntry["config"],
      source: entry.source,
      managedOAuth: entry.managedOAuth,
    }));
    const engineSync = response.engineSync ?? null;

    let nextStatuses: McpStatusMap = {};
    const activeClient = options.client();
    if (activeClient && projectDir) {
      try {
        const status = unwrap(await activeClient.mcp.status({ directory: projectDir }));
        nextStatuses = filterConfiguredStatuses(status as McpStatusMap, next);
      } catch {
        nextStatuses = {};
      }
    }

    for (const entry of next) {
      const managed = entry.managedOAuth;
      if (!managed) continue;
      if (!managed.enabled) {
        nextStatuses[entry.name] = { status: "disabled" };
      } else if (managed.status === "reconnect_required") {
        nextStatuses[entry.name] = { status: "reconnect_required" };
      } else if (managed.status === "needs_auth" || managed.status === "connecting") {
        nextStatuses[entry.name] = { status: "needs_auth" };
      } else if (!nextStatuses[entry.name]) {
        nextStatuses[entry.name] = { status: "connected" };
      }
    }

    recordPerfLog(options.developerMode(), "mcp.refresh", "server-path-result", {
      count: next.length,
      names: next.map((entry) => entry.name),
      sources: next.map((entry) => entry.source ?? "unknown"),
      engineSyncStatus: engineSync?.status ?? null,
    });

    return {
      next,
      nextStatuses,
      engineSync,
      managedOAuthAvailable: response.managedOAuthState?.available ?? true,
    };
  };

  const resolveDesktopCommand = async (commandName: "getComputerUseMcpCommand" | "getRedrobUiMcpCommand", fallbackOnError = true) => {
    try {
      const command = await window.__REDROB_ELECTRON__?.invokeDesktop?.(commandName);
      if (Array.isArray(command) && command.every((part) => typeof part === "string") && command.length > 0) {
        return command;
      }
    } catch (error) {
      if (!fallbackOnError) {
        throw error instanceof Error
          ? error
          : new Error(t("mcp.status_computer_use_unavailable"));
      }
      // Fall through to the published package command in the manifest/catalog.
    }
    return null;
  };

  const resolveLocalMcpCommand = async (entry: McpDirectoryInfo) => {
    const mcpResource = extensionResource(entry.extensionManifest, "mcp");
    if (mcpResource?.localCommandRef === "redrob.computerUseMcp") {
      const command = await resolveDesktopCommand("getComputerUseMcpCommand", false);
      return command ?? entry.command;
    }
    if (mcpResource?.localCommandRef === "redrob.uiMcp" || entry.serverName === "redrob-ui") {
      const command = await resolveDesktopCommand("getRedrobUiMcpCommand");
      return command ?? entry.command;
    }
    return entry.command;
  };

  const resolveLocalMcpEnvironment = async (entry: McpDirectoryInfo) => {
    if (entry.serverName !== "redrob-ui") return undefined;
    try {
      const environment = await window.__REDROB_ELECTRON__?.invokeDesktop?.("getRedrobUiMcpEnvironment");
      if (environment && typeof environment === "object" && !Array.isArray(environment)) {
        return Object.fromEntries(
          Object.entries(environment).filter((entry): entry is [string, string] =>
            typeof entry[0] === "string" && typeof entry[1] === "string"
          ),
        );
      }
    } catch {
      // Discovery fallback in redrob-ui-mcp still handles normal launches.
    }
    return undefined;
  };

  /**
   * Quiet self-heal for remote OAuth MCPs stuck in "Sign in needed": the
   * engine only refreshes tokens reactively (once per transport), so an
   * expired access token strands the entry until the user clicks Sign in.
   * `mcp.connect` retries the stored refresh-token grant on a fresh
   * transport — silently, never opening a browser or modal. Mirrors
   * syncCloudControlMcp, but for user-added connectors.
   */
  async function healUnhealthyMcpEntries(servers: McpServerEntry[], statuses: McpStatusMap) {
    if (disposed || snapshot.mcpAuthModalOpen || snapshot.mcpConnectingName) return;
    const activeClient = options.client();
    const projectDir = options.projectDir().trim();
    if (!activeClient || !projectDir) return;
    const attempted = await attemptSilentMcpReauth({
      client: activeClient,
      directory: projectDir,
      servers,
      statuses,
    }).catch(() => false);
    if (!attempted || disposed) return;
    try {
      const status = unwrap(await activeClient.mcp.status({ directory: projectDir }));
      setStateField(
        "mcpStatuses",
        filterConfiguredStatuses(status as McpStatusMap, snapshot.mcpServers),
      );
    } catch {
      // Post-heal status refresh is best-effort; the next refresh picks it up.
    }
  }

  async function refreshMcpServers() {
    if (disposed) return;

    const projectDir = options.projectDir().trim();
    const isRemoteWorkspace = options.workspaceType() === "remote";

    try {
      setStateField("mcpStatus", null);
      const serverResult = await listMcpFromRedrobServer(projectDir);
      if (serverResult) {
        // Surface engine registration failures instead of leaving users
        // staring at an MCP that silently shows as disconnected.
        const failedNames = serverResult.engineSync?.status === "failed"
          ? serverResult.engineSync.failures.map((failure) => failure.name).join(", ")
          : "";
        mutateState((current) => ({
          ...current,
          mcpServers: serverResult.next,
          mcpLastUpdatedAt: Date.now(),
          mcpStatuses: serverResult.nextStatuses,
          managedOAuthAvailable: serverResult.managedOAuthAvailable,
          mcpStatus: failedNames
            ? t("mcp.status_partial_registration", { names: failedNames })
            : serverResult.next.length ? null : t("mcp.status_none_configured"),
        }));
        void healUnhealthyMcpEntries(serverResult.next, serverResult.nextStatuses);
        return;
      }
    } catch (error) {
      recordPerfLog(options.developerMode(), "mcp.refresh", "server-path-error", {
        message: error instanceof Error ? error.message : String(error),
      });
      const serverTarget = await resolveMcpRedrobTarget("read").catch(() => null);
      if (isRemoteWorkspace || serverTarget?.hasRedrobTarget) {
        mutateState((current) => ({
          ...current,
          mcpServers: [],
          mcpStatuses: {},
          mcpStatus: error instanceof Error ? error.message : t("mcp.status_load_failed"),
        }));
        return;
      }
    }

    if (isRemoteWorkspace) {
      mutateState((current) => ({
        ...current,
        mcpStatus: t("mcp.status_config_read_only_offline"),
        mcpServers: [],
        mcpStatuses: {},
      }));
      return;
    }

    if (!isDesktopRuntime()) {
      mutateState((current) => ({
        ...current,
        mcpStatus: t("mcp.status_local_workspaces_only"),
        mcpServers: [],
        mcpStatuses: {},
      }));
      return;
    }

    if (!projectDir) {
      mutateState((current) => ({
        ...current,
        mcpStatus: t("mcp.status_pick_workspace"),
        mcpServers: [],
        mcpStatuses: {},
      }));
      return;
    }

    try {
      setStateField("mcpStatus", null);
      recordPerfLog(options.developerMode(), "mcp.refresh", "desktop-project-fallback", {
        projectDir,
      });
      const [globalConfig, projectConfig] = await Promise.all([
        readOpencodeConfig("global", projectDir) as Promise<OpencodeConfigFile>,
        readOpencodeConfig("project", projectDir) as Promise<OpencodeConfigFile>,
      ]);
      const globalServers = globalConfig.exists && globalConfig.content
        ? parseMcpServersFromContent(globalConfig.content).map((entry) => ({
          ...entry,
          source: "config.global" as const,
        }))
        : [];
      const projectServers = projectConfig.exists && projectConfig.content
        ? parseMcpServersFromContent(projectConfig.content)
        : [];
      const projectNames = new Set(projectServers.map((entry) => entry.name));
      const fileServers = [
        ...globalServers.filter((entry) => !projectNames.has(entry.name)),
        ...projectServers,
      ];
      // Runtime-DB MCPs (source "config.remote") only exist on the Redrob Work
      // server. Keep the last-known entries instead of silently dropping them
      // while the server is briefly unreachable (startup race) — otherwise
      // enabled MCPs like redrob-ui render as "off".
      const fileNames = new Set(fileServers.map((entry) => entry.name));
      const runtimeServers = state.mcpServers.filter(
        (entry) => entry.source === "config.remote" && !fileNames.has(entry.name),
      );
      const next = [...fileServers, ...runtimeServers];

      recordPerfLog(options.developerMode(), "mcp.refresh", "desktop-project-fallback-result", {
        globalConfigPath: globalConfig.path,
        projectConfigPath: projectConfig.path,
        count: next.length,
        names: next.map((entry) => entry.name),
        sources: next.map((entry) => entry.source ?? "unknown"),
      });

      if (!globalConfig.exists && !projectConfig.exists && runtimeServers.length === 0) {
        mutateState((current) => ({
          ...current,
          mcpServers: [],
          mcpStatuses: {},
          mcpStatus: t("mcp.status_no_config_file"),
        }));
        return;
      }

      let nextStatuses = state.mcpStatuses;
      const activeClient = options.client();
      if (activeClient) {
        try {
          const status = unwrap(await activeClient.mcp.status({ directory: projectDir }));
          nextStatuses = filterConfiguredStatuses(status as McpStatusMap, next);
        } catch {
          nextStatuses = {};
        }
      }

      mutateState((current) => ({
        ...current,
        mcpServers: next,
        mcpLastUpdatedAt: Date.now(),
        mcpStatuses: nextStatuses,
        mcpStatus: next.length ? null : t("mcp.status_none_configured"),
      }));
      void healUnhealthyMcpEntries(next, nextStatuses);
    } catch (error) {
      mutateState((current) => ({
        ...current,
        mcpServers: [],
        mcpStatuses: {},
        mcpStatus: error instanceof Error ? error.message : t("mcp.status_load_failed"),
      }));
    }
  }

  async function connectMcp(entry: McpDirectoryInfo): Promise<McpConnectResult> {
    const startedAt = perfNow();
    const redrobSnapshot = getRedrobSnapshot();
    const isRemoteWorkspace =
      options.workspaceType() === "remote" ||
      (!isDesktopRuntime() && redrobSnapshot.redrobServerStatus === "connected");
    const projectDir = options.projectDir().trim();
    const entryType = entry.type ?? "remote";

    recordPerfLog(options.developerMode(), "mcp.connect", "start", {
      name: entry.name,
      type: entryType,
      workspaceType: isRemoteWorkspace ? "remote" : "local",
      projectDir: projectDir || null,
    });

    const { redrobClient, redrobWorkspaceId, hasRedrobTarget, canUseRedrobServer } =
      await resolveWritableRedrobTarget();

    if (isRemoteWorkspace && !canUseRedrobServer) {
      const error = t("mcp.status_config_read_only_offline");
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "redrob-server-unavailable",
      });
      return { ok: false, error };
    }

    if (hasRedrobTarget && !canUseRedrobServer) {
      const error = t("mcp.status_config_read_only");
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "redrob-server-read-only",
      });
      return { ok: false, error };
    }

    if (!canUseRedrobServer && !isDesktopRuntime()) {
      const error = t("mcp.desktop_required");
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "desktop-required",
      });
      return { ok: false, error };
    }

    if (!isRemoteWorkspace && !projectDir && !canUseRedrobServer) {
      const error = t("mcp.pick_workspace_first");
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "missing-workspace",
      });
      return { ok: false, error };
    }

    const activeClient = canUseRedrobServer ? options.client() ?? await ensureActiveClient().catch(() => null) : await ensureActiveClient();
    if (!activeClient && !canUseRedrobServer) {
      const error = t("mcp.connect_server_first");
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "no-active-client",
      });
      return { ok: false, error };
    }

    const resolvedProjectDir = activeClient ? await resolveProjectDir(activeClient, projectDir) : projectDir;
    if (!resolvedProjectDir && !canUseRedrobServer) {
      const error = t("mcp.pick_workspace_first");
      setStateField("mcpStatus", error);
      finishPerf(options.developerMode(), "mcp.connect", "blocked", startedAt, {
        reason: "missing-workspace-after-discovery",
      });
      return { ok: false, error };
    }

    const slug = entry.id ?? getMcpServerName(entry);
    const action = snapshot.mcpServers.some((server) => server.name === slug) ? "updated" : "added";

    try {
      mutateState((current) => ({ ...current, mcpStatus: null, mcpConnectingName: entry.name }));

      if (entry.managedOAuth) {
        if (isRemoteWorkspace || !isDesktopRuntime()) {
          throw new Error(t("mcp.status_managed_oauth_local_only"));
        }
        if (entryType !== "remote" || !entry.url) {
          throw new Error(t("mcp.status_managed_oauth_needs_url"));
        }
        if (!canUseRedrobServer || !redrobClient || !redrobWorkspaceId) {
          throw new Error(t("mcp.status_managed_signin_needs_local_server"));
        }
        const result = await redrobClient.addManagedMcp(redrobWorkspaceId, {
          name: slug,
          url: entry.url,
          oauth: {
            applicationType: "native",
            requestedScopes: entry.oauthConfig?.scope?.split(/\s+/).filter(Boolean),
            clientId: entry.oauthConfig?.clientId,
            clientSecret: entry.oauthConfig?.clientSecret,
          },
        });
        const connected = await waitForManagedMcpAuthorization(
          redrobClient,
          redrobWorkspaceId,
          slug,
          result,
        );
        options.markReloadRequired?.("mcp", { type: "mcp", name: slug, action });
        await refreshMcpServers();
        if (connected) setStateField("mcpStatus", t("mcp.connected"));
        finishPerf(options.developerMode(), "mcp.connect", connected ? "done" : "blocked", startedAt, {
          name: entry.name,
          type: entryType,
          slug,
        });
        return connected
          ? { ok: true }
          : {
              ok: false,
              error: state.mcpStatus ?? t("mcp.status_signin_pending"),
            };
      }

      // Resolve dynamic URLs for built-in MCPs
      let resolvedUrl = entry.url;
      let resolvedHeaders: Record<string, string> | undefined;
      if (!resolvedUrl && entry.serverName === "redrob-ui") {
        try {
          const bridgeInfo = await window.__REDROB_ELECTRON__?.invokeDesktop?.("getUiControlBridgeInfo");
          if (bridgeInfo?.baseUrl) {
            resolvedUrl = `${bridgeInfo.baseUrl}/mcp`;
            if (bridgeInfo.token) {
              resolvedHeaders = { Authorization: `Bearer ${bridgeInfo.token}` };
            }
          }
        } catch {
          // Bridge not available
        }
      }

      const mcpEntryConfig: Record<string, unknown> = {
        type: entryType,
        enabled: true,
      };

      if (entryType === "remote") {
        if (!resolvedUrl) {
          throw new Error(t("mcp.status_missing_url"));
        }
        mcpEntryConfig["url"] = resolvedUrl;
        if (resolvedHeaders) {
          mcpEntryConfig["headers"] = resolvedHeaders;
          // Header-authed entries must not trigger OAuth auto-detection;
          // otherwise opencode reports "needs_auth" despite valid headers.
          mcpEntryConfig["oauth"] = false;
        }
        if (!resolvedHeaders) {
          if (entry.oauthConfig) {
            mcpEntryConfig["oauth"] = entry.oauthConfig;
          } else if (entry.oauth) {
            mcpEntryConfig["oauth"] = {};
          }
        }
      }

      if (entryType === "local") {
        if (!entry.command?.length) {
          throw new Error(t("mcp.status_missing_command"));
        }
        mcpEntryConfig["command"] = await resolveLocalMcpCommand(entry);
        const environment = await resolveLocalMcpEnvironment(entry);
        if (environment) {
          mcpEntryConfig["environment"] = environment;
        }
      }

      if (canUseRedrobServer && redrobClient && redrobWorkspaceId) {
        await redrobClient.addMcp(redrobWorkspaceId, {
          name: slug,
          config: mcpEntryConfig,
        });
      } else {
        if (!activeClient || !resolvedProjectDir) {
          throw new Error(t("mcp.connect_server_first"));
        }
        const configFile = await readOpencodeConfig("project", resolvedProjectDir) as OpencodeConfigFile;

        const raw = configFile.exists && configFile.content?.trim()
          ? configFile.content
          : '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';

        const parseErrors: Array<{ error: number; offset: number; length: number }> = [];
        parse(raw, parseErrors, { allowTrailingComma: true });
        if (parseErrors.length > 0) {
          const details = parseErrors
            .map((entry) => printParseErrorCode(entry.error))
            .join(", ");
          throw new Error(t("mcp.status_config_parse_failed", { details }));
        }

        let updated = raw;
        const formattingOptions = { insertSpaces: true, tabSize: 2, eol: "\n" };
        updated = applyEdits(
          updated,
          modify(updated, ["$schema"], "https://opencode.ai/config.json", { formattingOptions }),
        );
        updated = applyEdits(
          updated,
          modify(updated, ["mcp", slug], mcpEntryConfig, { formattingOptions }),
        );

        const writeResult = await writeOpencodeConfig(
          "project",
          resolvedProjectDir,
          updated.endsWith("\n") ? updated : `${updated}\n`,
        ) as { ok: boolean; stderr?: string; stdout?: string };
        if (!writeResult.ok) {
          throw new Error(writeResult.stderr || writeResult.stdout || t("mcp.status_write_config_failed"));
        }
      }

      if (canUseRedrobServer && redrobClient && redrobWorkspaceId) {
        // The Redrob Work server is the source of truth for workspace-scoped MCP
        // config in the React port. Avoid also calling the OpenCode SDK's MCP
        // hot-add endpoint here: when the SDK client is rooted at the aggregate
        // `/opencode` route it can resolve to an internal `local_*` workspace
        // id that the Redrob Work server does not expose, producing a confusing
        // `workspace_not_found` after the config write already succeeded.
        setStateField("mcpStatuses", filterConfiguredStatuses(snapshot.mcpStatuses, snapshot.mcpServers));
      } else {
        if (!activeClient || !resolvedProjectDir) {
          throw new Error(t("mcp.connect_server_first"));
        }
        const mcpAddConfig =
          entryType === "remote"
            ? {
                type: "remote" as const,
                url: resolvedUrl ?? entry.url!,
                enabled: true,
                ...(resolvedHeaders ? { headers: resolvedHeaders, oauth: false as const } : {}),
                ...(!resolvedHeaders && entry.oauthConfig ? { oauth: entry.oauthConfig } : {}),
                ...(!resolvedHeaders && !entry.oauthConfig && entry.oauth ? { oauth: {} } : {}),
              }
            : {
                type: "local" as const,
                command: (mcpEntryConfig["command"] as string[]) ?? entry.command!,
                enabled: true,
              };

        const status = unwrap(
          await activeClient.mcp.add({
            directory: resolvedProjectDir,
            name: slug,
            config: mcpAddConfig,
          }),
        );

        setStateField("mcpStatuses", status as McpStatusMap);
      }
      options.markReloadRequired?.("mcp", { type: "mcp", name: slug, action });
      await refreshMcpServers();

      // OAuth is auto-detected: open the sign-in modal when the directory
      // entry declares OAuth up front, or when the engine reports the fresh
      // remote entry as needing auth. Custom apps no longer ask the user to
      // know whether their server uses OAuth.
      let needsAuth = Boolean(entry.oauth) && !resolvedHeaders;
      if (!needsAuth && entryType === "remote" && !resolvedHeaders) {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const detected = snapshot.mcpStatuses[slug]?.status;
          if (detected === "needs_auth" || detected === "needs_client_registration") {
            needsAuth = true;
            break;
          }
          if (detected === "connected" || detected === "failed" || detected === "disabled") break;
          await new Promise((resolve) => setTimeout(resolve, 500));
          await refreshMcpServers();
        }
      }

      if (needsAuth) {
        mutateState((current) => ({
          ...current,
          mcpAuthEntry: entry,
          mcpAuthNeedsReload: true,
          mcpAuthModalOpen: true,
        }));
      } else {
        setStateField("mcpStatus", t("mcp.connected"));
      }

      await refreshMcpServers();
      finishPerf(options.developerMode(), "mcp.connect", "done", startedAt, {
        name: entry.name,
        type: entryType,
        slug,
      });
      return { ok: true };
    } catch (error) {
      console.error("[mcp.connect] failed", entry.name, error);
      const message = error instanceof Error ? error.message : t("mcp.connect_failed");
      setStateField("mcpStatus", message);
      finishPerf(options.developerMode(), "mcp.connect", "error", startedAt, {
        name: entry.name,
        type: entryType,
        error: error instanceof Error ? error.message : safeStringify(error),
      });
      return { ok: false, error: message };
    } finally {
      setStateField("mcpConnectingName", null);
    }
  }

  async function waitForManagedMcpAuthorization(
    redrobClient: RedrobServerClient,
    workspaceId: string,
    name: string,
    result: { status: "connected" } | { status: "needs_auth"; authorizeUrl: string },
  ): Promise<boolean> {
    if (result.status === "connected") return true;
    await openDesktopUrl(assertDesktopWebUrl(result.authorizeUrl));
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const connection = await redrobClient.getManagedMcp(workspaceId, name);
      if (connection.status === "connected") return true;
      if (connection.status === "reconnect_required") {
        throw new Error(connection.lastError || t("mcp.status_signin_restart_required"));
      }
    }
    setStateField("mcpStatus", t("mcp.status_signin_pending"));
    return false;
  }

  async function authorizeMcp(entry: McpServerEntry) {
    if (entry.managedOAuth) {
      try {
        const { redrobClient, redrobWorkspaceId, canUseRedrobServer } = await resolveWritableRedrobTarget();
        if (!canUseRedrobServer || !redrobClient || !redrobWorkspaceId) {
          throw new Error(t("mcp.status_managed_signin_needs_local_server"));
        }
        mutateState((current) => ({ ...current, mcpStatus: null, mcpConnectingName: entry.name }));
        const result = await redrobClient.connectManagedMcp(redrobWorkspaceId, entry.name);
        const connected = await waitForManagedMcpAuthorization(redrobClient, redrobWorkspaceId, entry.name, result);
        await refreshMcpServers();
        if (connected) setStateField("mcpStatus", t("mcp.connected"));
      } catch (error) {
        setStateField("mcpStatus", error instanceof Error ? error.message : t("mcp.connect_failed"));
      } finally {
        setStateField("mcpConnectingName", null);
      }
      return;
    }
    if (entry.config.type !== "remote" || entry.config.oauth === false) {
      setStateField("mcpStatus", t("mcp.login_unavailable"));
      return;
    }

    const matchingQuickConnect = MCP_QUICK_CONNECT.find((candidate) => {
      const candidateSlug = candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return candidateSlug === entry.name || candidate.name === entry.name;
    });

    mutateState((current) => ({
      ...current,
      mcpAuthEntry:
        matchingQuickConnect ?? {
          name: entry.name,
          description: "",
          type: "remote",
          url: entry.config.url,
          oauth: true,
        },
      mcpAuthNeedsReload: false,
      mcpAuthModalOpen: true,
    }));
  }

  async function logoutMcpAuth(name: string) {
    const redrobSnapshot = getRedrobSnapshot();
    const isRemoteWorkspace =
      options.workspaceType() === "remote" ||
      (!isDesktopRuntime() && redrobSnapshot.redrobServerStatus === "connected");
    const projectDir = options.projectDir().trim();

    const { redrobClient, redrobWorkspaceId, hasRedrobTarget, canUseRedrobServer } =
      await resolveWritableRedrobTarget();

    if (isRemoteWorkspace && !canUseRedrobServer) {
      setStateField("mcpStatus", t("mcp.status_auth_read_only_offline"));
      return;
    }

    if (hasRedrobTarget && !canUseRedrobServer) {
      setStateField("mcpStatus", t("mcp.status_auth_read_only"));
      return;
    }

    if (!canUseRedrobServer && !isDesktopRuntime()) {
      setStateField("mcpStatus", t("mcp.desktop_required"));
      return;
    }

    const activeClient = canUseRedrobServer ? options.client() : await ensureActiveClient();
    if (!activeClient && !canUseRedrobServer) {
      setStateField("mcpStatus", t("mcp.connect_server_first"));
      return;
    }

    const resolvedProjectDir = activeClient ? await resolveProjectDir(activeClient, projectDir) : projectDir;
    if (!resolvedProjectDir && !canUseRedrobServer) {
      setStateField("mcpStatus", t("mcp.pick_workspace_first"));
      return;
    }

    const safeName = validateMcpServerName(name);
    setStateField("mcpStatus", null);

    try {
      if (canUseRedrobServer && redrobClient && redrobWorkspaceId) {
        await redrobClient.logoutMcpAuth(redrobWorkspaceId, safeName);
      } else {
        if (!activeClient || !resolvedProjectDir) {
          throw new Error(t("mcp.connect_server_first"));
        }
        try {
          await activeClient.mcp.disconnect({ directory: resolvedProjectDir, name: safeName });
        } catch {
          // ignore
        }
        await activeClient.mcp.auth.remove({ directory: resolvedProjectDir, name: safeName });
      }

      try {
        if (activeClient && resolvedProjectDir) {
          const status = unwrap(await activeClient.mcp.status({ directory: resolvedProjectDir }));
          setStateField("mcpStatuses", status as McpStatusMap);
        }
      } catch {
        // ignore
      }

      await refreshMcpServers();
      setStateField("mcpStatus", t("mcp.logout_success").replace("{server}", safeName));
    } catch (error) {
      setStateField(
        "mcpStatus",
        error instanceof Error ? error.message : t("mcp.logout_failed"),
      );
    }
  }

  async function removeMcp(name: string) {
    try {
      setStateField("mcpStatus", null);

      const { redrobClient, redrobWorkspaceId, hasRedrobTarget, canUseRedrobServer } =
        await resolveWritableRedrobTarget();

      if (canUseRedrobServer && redrobClient && redrobWorkspaceId) {
        await redrobClient.removeMcp(redrobWorkspaceId, name);
      } else {
        if (hasRedrobTarget) {
          setStateField("mcpStatus", t("mcp.status_config_read_only"));
          return;
        }
        const projectDir = options.projectDir().trim();
        if (!projectDir) {
          setStateField("mcpStatus", t("mcp.pick_workspace_first"));
          return;
        }
        await removeMcpFromConfig(projectDir, name);
      }

      options.markReloadRequired?.("mcp", { type: "mcp", name, action: "removed" });
      await refreshMcpServers();
      if (snapshot.selectedMcp === name) {
        setStateField("selectedMcp", null);
      }
      setStateField("mcpStatus", null);
    } catch (error) {
      setStateField(
        "mcpStatus",
        error instanceof Error ? error.message : t("mcp.remove_failed"),
      );
    }
  }

  function notifyMcpReloading() {
    setStateField("mcpStatus", t("mcp.reloading_status"));
  }

  // OpenCode reconnects MCP servers asynchronously after /instance/dispose,
  // so an immediate mcp.status query returns stale "disconnected". Poll on
  // a backoff until every enabled MCP reaches a terminal status, with the
  // banner up the whole time so users see continuous feedback.
  async function pollMcpServersAfterReload(): Promise<void> {
    if (disposed) return;
    notifyMcpReloading();
    await refreshMcpServers();

    const settled = (statuses: McpStatusMap, servers: McpServerEntry[]) => {
      const expected = servers.filter((s) => s.config.enabled !== false);
      if (expected.length === 0) return true;
      return expected.every((server) => {
        const status = statuses[server.name]?.status;
        return status === "connected" || status === "needs_auth" || status === "failed";
      });
    };

    const delays = [400, 800, 1500, 2500, 4000];
    for (const delay of delays) {
      if (disposed) return;
      if (settled(snapshot.mcpStatuses, snapshot.mcpServers)) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      await refreshMcpServers();
    }

    if (disposed) return;
    // Only clear the reloading banner if it's still ours. refreshMcpServers
    // may have already replaced it with a real message (e.g. "No MCP servers").
    if (snapshot.mcpStatus === t("mcp.reloading_status")) {
      setStateField("mcpStatus", null);
    }
  }

  // Server-only path. Local fallback would rewrite opencode.jsonc whole and
  // clobber inline comments — settings-route.tsx already gates the prop so
  // this never gets called when the server is unavailable. Reload UX comes
  // from the existing reload-required popup; no extra banner here.
  async function setMcpEnabled(name: string, enabled: boolean) {
    try {
      const { redrobClient, redrobWorkspaceId, canUseRedrobServer } =
        await resolveWritableRedrobTarget();

      if (!canUseRedrobServer || !redrobClient || !redrobWorkspaceId) {
        setStateField("mcpStatus", t("mcp.toggle_requires_server"));
        return;
      }

      await redrobClient.setMcpEnabled(redrobWorkspaceId, name, enabled);
      options.markReloadRequired?.("mcp", { type: "mcp", name, action: "updated" });
      await refreshMcpServers();
    } catch (error) {
      setStateField(
        "mcpStatus",
        error instanceof Error ? error.message : t("mcp.toggle_failed"),
      );
    }
  }

  function closeMcpAuthModal() {
    mutateState((current) => ({
      ...current,
      mcpAuthModalOpen: false,
      mcpAuthEntry: null,
      mcpAuthNeedsReload: false,
    }));
  }

  async function completeMcpAuthModal() {
    closeMcpAuthModal();
    await refreshMcpServers();
  }

  const syncFromOptions = () => {
    const workspaceContextKey = getWorkspaceContextKey();
    const projectDir = options.projectDir().trim();
    const changed =
      workspaceContextKey !== lastWorkspaceContextKey || projectDir !== lastProjectDir;

    lastWorkspaceContextKey = workspaceContextKey;
    lastProjectDir = projectDir;

    if (!started || disposed || !changed) {
      return;
    }

    if (!isDesktopRuntime() && getRedrobSnapshot().redrobServerStatus !== "connected") {
      return;
    }

    void refreshMcpServers();
  };

  const start = () => {
    if (started) return;
    // StrictMode double-mount re-arms after dispose.
    disposed = false;
    started = true;
    syncFromOptions();
  };

  const dispose = () => {
    disposed = true;
    started = false;
  };

  refreshSnapshot();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getSnapshot = () => snapshot;

  return {
    subscribe,
    getSnapshot,
    start,
    dispose,
    syncFromOptions,
    get mcpServers() {
      return snapshot.mcpServers;
    },
    get mcpStatus() {
      return snapshot.mcpStatus;
    },
    get mcpLastUpdatedAt() {
      return snapshot.mcpLastUpdatedAt;
    },
    get mcpStatuses() {
      return snapshot.mcpStatuses;
    },
    get mcpConnectingName() {
      return snapshot.mcpConnectingName;
    },
    get selectedMcp() {
      return snapshot.selectedMcp;
    },
    setSelectedMcp(value: SetStateAction<string | null>) {
      const resolved = applyStateAction(state.selectedMcp, value);
      setStateField("selectedMcp", resolved);
    },
    quickConnect: MCP_QUICK_CONNECT,
    readMcpConfigFile,
    refreshMcpServers,
    connectMcp,
    authorizeMcp,
    logoutMcpAuth,
    removeMcp,
    setMcpEnabled,
    notifyMcpReloading,
    pollMcpServersAfterReload,
    get mcpAuthModalOpen() {
      return snapshot.mcpAuthModalOpen;
    },
    get mcpAuthEntry() {
      return snapshot.mcpAuthEntry;
    },
    get mcpAuthNeedsReload() {
      return snapshot.mcpAuthNeedsReload;
    },
    closeMcpAuthModal,
    completeMcpAuthModal,
  };
}

export function useConnectionsStoreSnapshot(store: ConnectionsStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
