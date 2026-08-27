import { useSyncExternalStore } from "react";

import { t } from "../../../i18n";
import type { StartupPreference, WorkspaceDisplay } from "../../../app/types";
import { isDesktopRuntime } from "../../../app/utils";
import {
  redrobServerInfo,
  redrobServerRestart,
  type RedrobServerInfo,
} from "../../../app/lib/desktop";
import {
  getRedrobGatewayOrigin,
  readRedrobGatewayDenToken,
} from "../../../app/lib/gateway-runtime";
import {
  clearRedrobServerSettings,
  createRedrobServerClient,
  isLoopbackRedrobServerUrl,
  normalizeRedrobServerUrl,
  readRedrobServerSettings,
  writeRedrobServerSettings,
  type RedrobAuditEntry,
  type RedrobServerCapabilities,
  type RedrobServerClient,
  type RedrobServerDiagnostics,
  type RedrobServerError,
  type RedrobServerSettings,
  type RedrobServerStatus,
} from "../../../app/lib/redrob-server";

type SetStateAction<T> = T | ((current: T) => T);

type RemoteWorkspaceInput = {
  redrobHostUrl: string;
  redrobToken?: string | null;
  directory?: string | null;
  displayName?: string | null;
};

export type RedrobServerStoreSnapshot = {
  redrobServerSettings: RedrobServerSettings;
  shareRemoteAccessBusy: boolean;
  shareRemoteAccessError: string | null;
  redrobServerUrl: string;
  redrobServerBaseUrl: string;
  redrobServerAuth: { token?: string; hostToken?: string };
  redrobServerClient: RedrobServerClient | null;
  redrobServerStatus: RedrobServerStatus;
  redrobServerCapabilities: RedrobServerCapabilities | null;
  redrobServerReady: boolean;
  redrobServerWorkspaceReady: boolean;
  resolvedRedrobCapabilities: RedrobServerCapabilities | null;
  redrobServerCanWriteSkills: boolean;
  redrobServerCanWritePlugins: boolean;
  redrobServerHostInfo: RedrobServerInfo | null;
  redrobServerDiagnostics: RedrobServerDiagnostics | null;
  redrobReconnectBusy: boolean;
  redrobAuditEntries: RedrobAuditEntry[];
  redrobAuditStatus: "idle" | "loading" | "error";
  redrobAuditError: string | null;
  devtoolsWorkspaceId: string | null;
};

export type RedrobServerStore = ReturnType<typeof createRedrobServerStore>;

type CreateRedrobServerStoreOptions = {
  startupPreference: () => StartupPreference | null;
  documentVisible: () => boolean;
  developerMode: () => boolean;
  runtimeWorkspaceId: () => string | null;
  activeClient: () => unknown | null;
  selectedWorkspaceDisplay: () => WorkspaceDisplay;
  restartLocalServer: () => Promise<boolean>;
  createRemoteWorkspaceFlow: (input: RemoteWorkspaceInput) => Promise<boolean>;
};

type MutableState = {
  redrobServerSettings: RedrobServerSettings;
  shareRemoteAccessBusy: boolean;
  shareRemoteAccessError: string | null;
  redrobServerUrl: string;
  redrobServerStatus: RedrobServerStatus;
  redrobServerCapabilities: RedrobServerCapabilities | null;
  redrobServerCheckedAt: number | null;
  redrobServerHostInfo: RedrobServerInfo | null;
  redrobServerHostInfoReady: boolean;
  redrobServerDiagnostics: RedrobServerDiagnostics | null;
  redrobReconnectBusy: boolean;
  redrobAuditEntries: RedrobAuditEntry[];
  redrobAuditStatus: "idle" | "loading" | "error";
  redrobAuditError: string | null;
  devtoolsWorkspaceId: string | null;
};

const applyStateAction = <T,>(current: T, next: SetStateAction<T>) =>
  typeof next === "function" ? (next as (value: T) => T)(current) : next;

export function createRedrobServerStore(options: CreateRedrobServerStoreOptions) {
  const bootStartedAt = Date.now();
  const listeners = new Set<() => void>();
  const intervals = new Map<string, number>();

  let clientCacheKey = "";
  let clientCacheValue: RedrobServerClient | null = null;
  let started = false;
  let disposed = false;
  let healthTimeoutId: number | null = null;
  let healthBusy = false;
  let healthDelayMs = 10_000;
  let consecutiveHealthFailures = 0;
  let visibilityChangeHandler: (() => void) | null = null;
  let snapshot: RedrobServerStoreSnapshot;

  let state: MutableState = {
    redrobServerSettings: readRedrobServerSettings(),
    shareRemoteAccessBusy: false,
    shareRemoteAccessError: null,
    redrobServerUrl: "",
    redrobServerStatus: "disconnected",
    redrobServerCapabilities: null,
    redrobServerCheckedAt: null,
    redrobServerHostInfo: null,
    redrobServerHostInfoReady: !isDesktopRuntime(),
    redrobServerDiagnostics: null,
    redrobReconnectBusy: false,
    redrobAuditEntries: [],
    redrobAuditStatus: "idle",
    redrobAuditError: null,
    devtoolsWorkspaceId: null,
  };

  const emitChange = () => {
    for (const listener of listeners) listener();
  };

  const getBaseUrl = () => {
    const gatewayOrigin = getRedrobGatewayOrigin();
    if (gatewayOrigin) return normalizeRedrobServerUrl(gatewayOrigin) ?? "";

    const pref = options.startupPreference();
    const hostInfo = state.redrobServerHostInfo;
    const settingsUrl = normalizeRedrobServerUrl(state.redrobServerSettings.urlOverride ?? "") ?? "";

    if (pref === "local") return hostInfo?.baseUrl ?? "";
    if (pref === "server" && settingsUrl && isLoopbackRedrobServerUrl(settingsUrl) && hostInfo?.baseUrl) {
      return hostInfo.baseUrl;
    }
    if (pref === "server") return settingsUrl;
    return hostInfo?.baseUrl ?? settingsUrl;
  };

  const getAuth = () => {
    const gatewayOrigin = getRedrobGatewayOrigin();
    if (gatewayOrigin) {
      const token = readRedrobGatewayDenToken().trim();
      return { token: token || undefined, hostToken: undefined };
    }

    const pref = options.startupPreference();
    const hostInfo = state.redrobServerHostInfo;
    const settingsUrl = normalizeRedrobServerUrl(state.redrobServerSettings.urlOverride ?? "") ?? "";
    const settingsToken = state.redrobServerSettings.token?.trim() ?? "";
    const settingsHostToken = state.redrobServerSettings.hostToken?.trim() ?? "";
    const clientToken = hostInfo?.clientToken?.trim() ?? "";
    const hostToken = hostInfo?.hostToken?.trim() ?? "";

    if (pref === "local") {
      return { token: clientToken || undefined, hostToken: hostToken || undefined };
    }
    if (pref === "server" && settingsUrl && isLoopbackRedrobServerUrl(settingsUrl) && hostInfo?.baseUrl) {
      return {
        token: clientToken || settingsToken || undefined,
        hostToken: hostToken || settingsHostToken || undefined,
      };
    }
    if (pref === "server") {
      return {
        token: settingsToken || undefined,
        hostToken: settingsUrl && isLoopbackRedrobServerUrl(settingsUrl) ? settingsHostToken || undefined : undefined,
      };
    }
    if (hostInfo?.baseUrl) {
      return { token: clientToken || undefined, hostToken: hostToken || undefined };
    }
    return {
      token: settingsToken || undefined,
      hostToken: settingsUrl && isLoopbackRedrobServerUrl(settingsUrl) ? settingsHostToken || undefined : undefined,
    };
  };

  const getClient = () => {
    const baseUrl = getBaseUrl().trim();
    if (!baseUrl) {
      clientCacheKey = "";
      clientCacheValue = null;
      return null;
    }

    const auth = getAuth();
    const key = `${baseUrl}::${auth.token ?? ""}::${auth.hostToken ?? ""}`;
    if (key !== clientCacheKey) {
      clientCacheKey = key;
      clientCacheValue = createRedrobServerClient({
        baseUrl,
        token: auth.token,
        hostToken: auth.hostToken,
      });
    }
    return clientCacheValue;
  };

  const refreshSnapshot = () => {
    const redrobServerBaseUrl = getBaseUrl().trim();
    const redrobServerAuth = getAuth();
    const redrobServerClient = getClient();
    const redrobServerReady = state.redrobServerStatus === "connected";
    const redrobServerWorkspaceReady = Boolean(options.runtimeWorkspaceId());
    const resolvedRedrobCapabilities = state.redrobServerCapabilities;

    const pref = options.startupPreference();
    const info = state.redrobServerHostInfo;
    const hostUrl = info?.connectUrl ?? info?.lanUrl ?? info?.mdnsUrl ?? info?.baseUrl ?? "";
    const settingsUrl = normalizeRedrobServerUrl(state.redrobServerSettings.urlOverride ?? "") ?? "";

    let redrobServerUrl = hostUrl || settingsUrl;
    if (pref === "local") redrobServerUrl = hostUrl;
    if (pref === "server") redrobServerUrl = settingsUrl;
    state.redrobServerUrl = redrobServerUrl;

    snapshot = {
      redrobServerSettings: state.redrobServerSettings,
      shareRemoteAccessBusy: state.shareRemoteAccessBusy,
      shareRemoteAccessError: state.shareRemoteAccessError,
      redrobServerUrl,
      redrobServerBaseUrl,
      redrobServerAuth,
      redrobServerClient,
      redrobServerStatus: state.redrobServerStatus,
      redrobServerCapabilities: state.redrobServerCapabilities,
      redrobServerReady,
      redrobServerWorkspaceReady,
      resolvedRedrobCapabilities,
      redrobServerCanWriteSkills:
        redrobServerReady &&
        (resolvedRedrobCapabilities?.skills?.write ?? false),
      redrobServerCanWritePlugins:
        redrobServerReady &&
        (resolvedRedrobCapabilities?.plugins?.write ?? false),
      redrobServerHostInfo: state.redrobServerHostInfo,
      redrobServerDiagnostics: state.redrobServerDiagnostics,
      redrobReconnectBusy: state.redrobReconnectBusy,
      redrobAuditEntries: state.redrobAuditEntries,
      redrobAuditStatus: state.redrobAuditStatus,
      redrobAuditError: state.redrobAuditError,
      devtoolsWorkspaceId: state.devtoolsWorkspaceId,
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

  const setRedrobServerSettings = (next: SetStateAction<RedrobServerSettings>) => {
    const resolved = applyStateAction(state.redrobServerSettings, next);
    mutateState((current) => ({ ...current, redrobServerSettings: resolved }));
    queueHealthCheck(0);
  };

  const updateRedrobServerSettings = (next: RedrobServerSettings) => {
    const stored = writeRedrobServerSettings(next);
    mutateState((current) => ({ ...current, redrobServerSettings: stored }));
    queueHealthCheck(0);
  };

  const resetRedrobServerSettings = () => {
    clearRedrobServerSettings();
    mutateState((current) => ({ ...current, redrobServerSettings: {} }));
    queueHealthCheck(0);
  };

  const shouldWaitForLocalHostInfo = () =>
    isDesktopRuntime() &&
    options.startupPreference() !== "server" &&
    !state.redrobServerHostInfoReady;

  const shouldRetryStartupCheck = (status: RedrobServerStatus) =>
    status !== "connected" &&
    isDesktopRuntime() &&
    options.startupPreference() !== "server" &&
    Date.now() - bootStartedAt < 5_000;

  const checkRedrobServer = async (url: string, token?: string, hostToken?: string) => {
    const client = createRedrobServerClient({ baseUrl: url, token, hostToken });
    try {
      await client.health();
    } catch (error) {
      const resolved = error as RedrobServerError | Error;
      if ("status" in resolved && (resolved.status === 401 || resolved.status === 403)) {
        return { status: "limited" as RedrobServerStatus, capabilities: null };
      }
      return { status: "disconnected" as RedrobServerStatus, capabilities: null };
    }

    if (!token) {
      return { status: "limited" as RedrobServerStatus, capabilities: null };
    }

    try {
      const capabilities = await client.capabilities();
      return { status: "connected" as RedrobServerStatus, capabilities };
    } catch (error) {
      const resolved = error as RedrobServerError | Error;
      if ("status" in resolved && (resolved.status === 401 || resolved.status === 403)) {
        return { status: "limited" as RedrobServerStatus, capabilities: null };
      }
      return { status: "disconnected" as RedrobServerStatus, capabilities: null };
    }
  };

  const clearHealthTimeout = () => {
    if (healthTimeoutId !== null) {
      window.clearTimeout(healthTimeoutId);
      healthTimeoutId = null;
    }
  };

  const queueHealthCheck = (delayMs: number) => {
    if (disposed || typeof window === "undefined") return;
    clearHealthTimeout();
    healthTimeoutId = window.setTimeout(() => {
      healthTimeoutId = null;
      void runHealthCheck();
    }, Math.max(0, delayMs));
  };

  const runHealthCheck = async () => {
    if (disposed || typeof window === "undefined") return;
    if (!options.documentVisible()) {
      queueHealthCheck(healthDelayMs);
      return;
    }
    if (shouldWaitForLocalHostInfo()) {
      queueHealthCheck(250);
      return;
    }
    if (healthBusy) return;

    const url = getBaseUrl().trim();
    const auth = getAuth();
    if (!url) {
      consecutiveHealthFailures = 0;
      mutateState((current) => ({
        ...current,
        redrobServerStatus: "disconnected",
        redrobServerCapabilities: null,
        redrobServerCheckedAt: Date.now(),
      }));
      return;
    }

    healthBusy = true;
    try {
      let result = await checkRedrobServer(url, auth.token, auth.hostToken);

      if (shouldRetryStartupCheck(result.status)) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
        if (disposed) return;

        try {
          const info = await redrobServerInfo() as RedrobServerInfo;
          if (disposed) return;

          mutateState((current) => ({
            ...current,
            redrobServerHostInfo: info,
            redrobServerHostInfoReady: true,
          }));

          const retryUrl = info.baseUrl?.trim() ?? "";
          const retryToken = info.clientToken?.trim() || undefined;
          const retryHostToken = info.hostToken?.trim() || undefined;
          if (retryUrl) {
            result = await checkRedrobServer(retryUrl, retryToken, retryHostToken);
          }
        } catch {
          // Preserve the original check result when the retry probe fails.
        }
      }

      if (disposed) return;
      const previousStatus = state.redrobServerStatus;
      const previousCapabilities = state.redrobServerCapabilities;
      const healthy = result.status === "connected" || result.status === "limited";
      if (healthy) {
        consecutiveHealthFailures = 0;
        healthDelayMs = 10_000;
      } else {
        consecutiveHealthFailures += 1;
        healthDelayMs = Math.min(healthDelayMs * 2, 60_000);
      }

      const preservePrevious =
        !healthy &&
        consecutiveHealthFailures < 3 &&
        (previousStatus === "connected" || previousStatus === "limited");

      mutateState((current) => ({
        ...current,
        redrobServerStatus: preservePrevious ? previousStatus : result.status,
        redrobServerCapabilities: preservePrevious ? previousCapabilities : result.capabilities,
        redrobServerCheckedAt: Date.now(),
      }));
    } catch {
      healthDelayMs = Math.min(healthDelayMs * 2, 60_000);
      mutateState((current) => ({
        ...current,
        redrobServerCheckedAt: Date.now(),
      }));
    } finally {
      healthBusy = false;
      if (!disposed) queueHealthCheck(healthDelayMs);
    }
  };

  const syncFromOptions = () => {
    refreshSnapshot();
    emitChange();

    if (!isDesktopRuntime()) return;
    const port = state.redrobServerHostInfo?.port;
    if (!port) return;
    if (state.redrobServerSettings.portOverride === port) return;

    updateRedrobServerSettings({
      ...state.redrobServerSettings,
      portOverride: port,
    });
  };

  const startInterval = (key: string, fn: () => void, ms: number) => {
    if (typeof window === "undefined") return;
    if (intervals.has(key)) return;
    intervals.set(key, window.setInterval(fn, ms));
  };

  const stopInterval = (key: string) => {
    const id = intervals.get(key);
    if (id === undefined) return;
    window.clearInterval(id);
    intervals.delete(key);
  };

  const start = () => {
    if (typeof window === "undefined") return;
    if (started) return;
    // Allow restart after a prior dispose() (React 18 StrictMode double-mounts
    // each effect in dev: mount → dispose → re-mount). If we early-return when
    // `disposed` is true, the real mount never arms polling and the UI stays
    // on stale/empty state forever.
    disposed = false;
    started = true;

    syncFromOptions();
    queueHealthCheck(0);
    visibilityChangeHandler = () => {
      if (!options.documentVisible()) return;
      consecutiveHealthFailures = 0;
      queueHealthCheck(0);
    };
    window.addEventListener("visibilitychange", visibilityChangeHandler);

    const refreshHostInfo = () => {
      if (!isDesktopRuntime()) return;
      if (!options.documentVisible()) return;
      void (async () => {
        try {
          const info = await redrobServerInfo() as RedrobServerInfo;
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            redrobServerHostInfo: info,
            redrobServerHostInfoReady: true,
          }));
        } catch {
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            redrobServerHostInfo: null,
            redrobServerHostInfoReady: true,
          }));
        }
      })();
    };
    refreshHostInfo();
    startInterval("hostInfo", refreshHostInfo, 10_000);

    const refreshDiagnostics = () => {
      if (!options.documentVisible()) return;
      if (!options.developerMode()) {
        setStateField("redrobServerDiagnostics", null);
        return;
      }

      const client = getClient();
      if (!client || state.redrobServerStatus === "disconnected") {
        setStateField("redrobServerDiagnostics", null);
        return;
      }

      void (async () => {
        try {
          const status = await client.status();
          if (!disposed) setStateField("redrobServerDiagnostics", status);
        } catch {
          if (!disposed) setStateField("redrobServerDiagnostics", null);
        }
      })();
    };
    refreshDiagnostics();
    startInterval("diagnostics", refreshDiagnostics, 10_000);

    const refreshDevtoolsWorkspace = () => {
      if (!options.documentVisible()) return;
      if (!options.developerMode()) {
        setStateField("devtoolsWorkspaceId", null);
        return;
      }

      const client = getClient();
      if (!client) {
        setStateField("devtoolsWorkspaceId", null);
        return;
      }

      void (async () => {
        try {
          const response = await client.listWorkspaces();
          if (disposed) return;
          const items = Array.isArray(response.items) ? response.items : [];
          const activeMatch = response.activeId
            ? items.find((item) => item.id === response.activeId)
            : null;
          setStateField("devtoolsWorkspaceId", activeMatch?.id ?? items[0]?.id ?? null);
        } catch {
          if (!disposed) setStateField("devtoolsWorkspaceId", null);
        }
      })();
    };
    refreshDevtoolsWorkspace();
    startInterval("devtoolsWorkspace", refreshDevtoolsWorkspace, 20_000);

    const refreshAudit = () => {
      if (!options.documentVisible()) return;
      if (!options.developerMode()) {
        mutateState((current) => ({
          ...current,
          redrobAuditEntries: [],
          redrobAuditStatus: "idle",
          redrobAuditError: null,
        }));
        return;
      }

      const client = getClient();
      const workspaceId = state.devtoolsWorkspaceId;
      if (!client || !workspaceId) {
        mutateState((current) => ({
          ...current,
          redrobAuditEntries: [],
          redrobAuditStatus: "idle",
          redrobAuditError: null,
        }));
        return;
      }

      mutateState((current) => ({
        ...current,
        redrobAuditStatus: "loading",
        redrobAuditError: null,
      }));

      void (async () => {
        try {
          const result = await client.listAudit(workspaceId, 50);
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            redrobAuditEntries: Array.isArray(result.items) ? result.items : [],
            redrobAuditStatus: "idle",
          }));
        } catch (error) {
          if (disposed) return;
          mutateState((current) => ({
            ...current,
            redrobAuditEntries: [],
            redrobAuditStatus: "error",
            redrobAuditError:
              error instanceof Error
                ? error.message
                : t("app.error_audit_load"),
          }));
        }
      })();
    };
    refreshAudit();
    startInterval("audit", refreshAudit, 15_000);
  };

  const dispose = () => {
    disposed = true;
    started = false;
    clearHealthTimeout();
    if (visibilityChangeHandler && typeof window !== "undefined") {
      window.removeEventListener("visibilitychange", visibilityChangeHandler);
      visibilityChangeHandler = null;
    }
    for (const key of [...intervals.keys()]) stopInterval(key);
  };

  const testRedrobServerConnection = async (next: RedrobServerSettings) => {
    const derived = normalizeRedrobServerUrl(next.urlOverride ?? "");
    if (!derived) {
      mutateState((current) => ({
        ...current,
        redrobServerStatus: "disconnected",
        redrobServerCapabilities: null,
        redrobServerCheckedAt: Date.now(),
      }));
      return false;
    }

    const result = await checkRedrobServer(derived, next.token);
    consecutiveHealthFailures = result.status === "disconnected" ? consecutiveHealthFailures + 1 : 0;
    mutateState((current) => ({
      ...current,
      redrobServerStatus: result.status,
      redrobServerCapabilities: result.capabilities,
      redrobServerCheckedAt: Date.now(),
    }));

    const ok = result.status === "connected" || result.status === "limited";
    if (ok && !isDesktopRuntime()) {
      const active = options.selectedWorkspaceDisplay();
      const shouldAttach =
        !options.activeClient() ||
        active.workspaceType !== "remote" ||
        active.remoteType !== "redrob";
      if (shouldAttach) {
        await options
          .createRemoteWorkspaceFlow({
            redrobHostUrl: derived,
            redrobToken: next.token ?? null,
          })
          .catch(() => undefined);
      }
    }
    return ok;
  };

  const reconnectRedrobServer = async () => {
    if (state.redrobReconnectBusy) return false;
    setStateField("redrobReconnectBusy", true);

    try {
      let hostInfo = state.redrobServerHostInfo;
      if (isDesktopRuntime()) {
        try {
          hostInfo = await redrobServerInfo() as RedrobServerInfo;
          mutateState((current) => ({ ...current, redrobServerHostInfo: hostInfo }));
        } catch {
          hostInfo = null;
          setStateField("redrobServerHostInfo", null);
        }
      }

      if (hostInfo?.clientToken?.trim() && options.startupPreference() !== "server") {
        const liveToken = hostInfo.clientToken.trim();
        const liveHostToken = hostInfo.hostToken?.trim() ?? "";
        const settings = state.redrobServerSettings;
        if (
          (settings.token?.trim() ?? "") !== liveToken ||
          (settings.hostToken?.trim() ?? "") !== liveHostToken
        ) {
          updateRedrobServerSettings({
            ...settings,
            token: liveToken,
            hostToken: liveHostToken || undefined,
          });
        }
      }

      const url = getBaseUrl().trim();
      const auth = getAuth();
      if (!url) {
        mutateState((current) => ({
          ...current,
          redrobServerStatus: "disconnected",
          redrobServerCapabilities: null,
          redrobServerCheckedAt: Date.now(),
        }));
        return false;
      }

      const result = await checkRedrobServer(url, auth.token, auth.hostToken);
      mutateState((current) => ({
        ...current,
        redrobServerStatus: result.status,
        redrobServerCapabilities: result.capabilities,
        redrobServerCheckedAt: Date.now(),
      }));
      return result.status === "connected" || result.status === "limited";
    } finally {
      setStateField("redrobReconnectBusy", false);
    }
  };

  async function ensureLocalRedrobServerClient(): Promise<RedrobServerClient | null> {
    let hostInfo = state.redrobServerHostInfo;
    if (hostInfo?.baseUrl?.trim() && hostInfo.clientToken?.trim()) {
      const existing = createRedrobServerClient({
        baseUrl: hostInfo.baseUrl.trim(),
        token: hostInfo.clientToken.trim(),
        hostToken: hostInfo.hostToken?.trim() || undefined,
      });
      try {
        await existing.health();
        if (options.startupPreference() !== "server") {
          await reconnectRedrobServer();
        }
        return existing;
      } catch {
        // Fall through to a local restart.
      }
    }

    if (!isDesktopRuntime()) return null;

    try {
      hostInfo = await redrobServerRestart({
        remoteAccessEnabled: state.redrobServerSettings.remoteAccessEnabled === true,
      }) as RedrobServerInfo;
      mutateState((current) => ({ ...current, redrobServerHostInfo: hostInfo }));
    } catch {
      return null;
    }

    const baseUrl = hostInfo?.baseUrl?.trim() ?? "";
    const token = hostInfo?.clientToken?.trim() ?? "";
    const hostToken = hostInfo?.hostToken?.trim() ?? "";
    if (!baseUrl || !token) return null;

    if (options.startupPreference() !== "server") {
      await reconnectRedrobServer();
    }

    return createRedrobServerClient({
      baseUrl,
      token,
      hostToken: hostToken || undefined,
    });
  }

  const saveShareRemoteAccess = async (enabled: boolean) => {
    if (state.shareRemoteAccessBusy) return;
    const previous = state.redrobServerSettings;
    const next: RedrobServerSettings = {
      ...previous,
      remoteAccessEnabled: enabled,
    };

    mutateState((current) => ({
      ...current,
      shareRemoteAccessBusy: true,
      shareRemoteAccessError: null,
    }));
    updateRedrobServerSettings(next);

    try {
      if (isDesktopRuntime() && options.selectedWorkspaceDisplay().workspaceType === "local") {
        const restarted = await options.restartLocalServer();
        if (!restarted) {
          throw new Error(t("app.error_restart_local_worker"));
        }
        await reconnectRedrobServer();
      }
    } catch (error) {
      updateRedrobServerSettings(previous);
      mutateState((current) => ({
        ...current,
        shareRemoteAccessError:
          error instanceof Error
            ? error.message
            : t("app.error_remote_access"),
      }));
      return;
    } finally {
      setStateField("shareRemoteAccessBusy", false);
    }
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
    setRedrobServerSettings,
    updateRedrobServerSettings,
    resetRedrobServerSettings,
    saveShareRemoteAccess,
    checkRedrobServer,
    testRedrobServerConnection,
    reconnectRedrobServer,
    ensureLocalRedrobServerClient,
  };
}

export function useRedrobServerStoreSnapshot(store: RedrobServerStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
