// The session route's data + navigation core: workspace session loading
// (background session fetch), URL-derived selection, redirects (fallback
// workspace, welcome), desktop local-server reconnect, remote connection
// checks, and the route inspector slice. The connection/workspace core (local
// Redrob connection, merged workspace records, active workspace, endpoint
// resolution, refresh lifecycle) lives in the always-mounted
// WorkspaceConnectionProvider; this hook consumes it and joins its refreshes
// as the route participant. The route keeps composition, handlers, and JSX.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type { Session } from "@redrob-labs/sdk/v2/client";

import {
  publishInspectorOpencodeClient,
  publishInspectorSlice,
} from "@/app/lib/app-inspector";
import {
  workspaceSetRuntimeActive,
  workspaceSetSelected,
  type RedrobServerInfo,
} from "@/app/lib/desktop";
import { createClient } from "@/app/lib/opencode";
import { isDesktopRuntime } from "@/app/lib/runtime-env";
import type { WorkspaceConnectionState } from "@/app/types";
import { normalizeDirectoryPath } from "@/app/utils";
import { t } from "@/i18n";
import { useWorkspaceServerClient } from "@/react-app/infra/workspace-server-client";
import {
  diagnoseRemoteWorkspaceTaskLoadFailure,
  getRemoteWorkspaceConnectionKey,
  testRemoteWorkspaceConnection,
} from "@/react-app/domains/workspace/remote-workspace-diagnostics";
import { useLocal } from "@/react-app/kernel/local-provider";
import { useBootState } from "./boot-state";
import {
  ensureDesktopLocalRedrobConnection,
  shouldAttemptDesktopLocalReconnect,
} from "./desktop-local-redrob";
import {
  createLatestWorkspaceCommitter,
  planRouteWorkspaceLoads,
  withRouteRefreshTimeout,
} from "./route-refresh-control";
import {
  classifyRouteSessionReadError,
  describeRouteError,
  isTransientStartupError,
  type RouteSession,
  type RouteWorkspace,
} from "./route-workspaces";
import {
  readActiveWorkspaceId,
  writeActiveWorkspaceId,
} from "./session-memory";
import {
  useWorkspaceConnection,
  type WorkspaceConnectionRefreshOptions,
  type WorkspaceRefreshParticipant,
} from "./workspace-connection-provider";
import { chooseDefaultWorkspaceId } from "./workspace-connection-refresh";
import {
  legacySessionRoute,
  mergeWorkspaceRouteSession,
  preserveWorkspaceRouteSession,
  removeWorkspaceRouteSession,
  sessionIdForLegacyWorkspaceInference,
  workspaceExtensionsRoute,
  workspaceSessionRoute,
} from "./workspace-routes";

export type UseWorkspaceRouteStateInput = {
  developerMode: boolean;
  /** Invoked when the redrob-server settings-changed event fires (the route bumps its settings version). */
  onServerSettingsChanged: () => void;
  /** Receives the local redrob-server host info discovered during refresh. */
  onHostInfo: (info: RedrobServerInfo | null) => void;
};

type ModernRouteSessionResolution =
  | { key: string; status: "loading" }
  | { key: string; status: "not-found" | "error"; message: string };

/** Dwell after a workspace activation before trusting the server's active id. */
const ROUTE_WORKSPACE_ACTIVATION_SETTLE_MS = 750;

export function useWorkspaceRouteState(input: UseWorkspaceRouteStateInput) {
  const { developerMode, onServerSettingsChanged, onHostInfo } = input;
  const navigate = useNavigate();
  const location = useLocation();
  const local = useLocal();
  const params = useParams<{ workspaceId?: string; sessionId?: string }>();
  const routeWorkspaceId = params.workspaceId?.trim() || "";
  const selectedSessionId = params.sessionId?.trim() || null;
  const extensionsRouteActive = /^\/(?:workspace\/[^/]+\/)?extensions(?:\/|$)/.test(location.pathname);
  const extensionsRoutePath = extensionsRouteActive
    ? location.pathname
      .replace(/^\/workspace\/[^/]+\/extensions\/?/, "")
      .replace(/^\/extensions\/?/, "")
      .replace(/^\/+|\/+$/g, "")
    : "";
  const workspaceInferenceSessionId = sessionIdForLegacyWorkspaceInference(routeWorkspaceId, selectedSessionId);
  const legacyWorkspaceInferenceKey = routeWorkspaceId ? "" : workspaceInferenceSessionId;
  const routeWorkspaceIdRef = useRef(routeWorkspaceId);
  routeWorkspaceIdRef.current = routeWorkspaceId;
  const workspaceInferenceSessionIdRef = useRef(workspaceInferenceSessionId);
  workspaceInferenceSessionIdRef.current = workspaceInferenceSessionId;
  const navigateToWorkspaceSession = useCallback((workspaceId: string, sessionId?: string | null, options?: { replace?: boolean }) => {
    const id = workspaceId.trim();
    if (!id) {
      navigate(legacySessionRoute(sessionId), options);
      return;
    }
    navigate(workspaceSessionRoute(id, sessionId), options);
  }, [navigate]);
  const normalizeWorkspaceRoute = useCallback((workspaceId: string, sessionId?: string | null, options?: { replace?: boolean }) => {
    if (extensionsRouteActive) {
      navigate(workspaceExtensionsRoute(workspaceId, extensionsRoutePath), options);
      return;
    }
    navigateToWorkspaceSession(workspaceId, sessionId, options);
  }, [extensionsRouteActive, extensionsRoutePath, navigate, navigateToWorkspaceSession]);

  const {
    markRouteReady: markBootRouteReady,
    phase: bootPhase,
    routeReady: bootRouteReady,
  } = useBootState();
  const [loading, setLoading] = useState(true);
  // The connection/workspace core is app-wide; the route reads it here under
  // the names its callers already use.
  const workspaceConnection = useWorkspaceConnection();
  const {
    client,
    baseUrl,
    token,
    connectionPending,
    workspaces,
    setWorkspaces,
    workspacesRef,
    workspaceOrderIds,
    setWorkspaceOrderIds,
    workspaceOrderIdsRef,
    activeWorkspaceId: legacySelectedWorkspaceId,
    setActiveWorkspaceId: setLegacySelectedWorkspaceId,
    serverActiveWorkspaceIdRef,
    endpointForWorkspace,
    refresh: refreshWorkspaceConnection,
    registerRefreshParticipant,
  } = workspaceConnection;
  const [sessionsByWorkspaceId, setSessionsByWorkspaceId] = useState<Record<string, RouteSession[]>>({});
  const [errorsByWorkspaceId, setErrorsByWorkspaceId] = useState<Record<string, string | null>>({});
  const [workspaceConnectionOverrides, setWorkspaceConnectionOverrides] = useState<Record<string, WorkspaceConnectionState>>({});
  const [routeError, setRouteError] = useState<string | null>(null);
  const [modernRouteSessionResolution, setModernRouteSessionResolution] = useState<ModernRouteSessionResolution | null>(null);
  const [routeRefreshVersion, setRouteRefreshVersion] = useState(0);
  const selectedWorkspaceId = routeWorkspaceId || legacySelectedWorkspaceId;
  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? (selectedWorkspaceId ? null : workspaces[0] ?? null),
    [selectedWorkspaceId, workspaces],
  );
  const remoteWorkspaceCheckRunRef = useRef<Record<string, string>>({});
  const remoteWorkspaceCheckRunCounterRef = useRef(0);
  const sessionsByWorkspaceIdRef = useRef<Record<string, RouteSession[]>>({});
  const pendingCreatedSessionIdsRef = useRef<Record<string, Record<string, number>>>({});
  const hydratedRouteSessionIdsRef = useRef<Record<string, string>>({});
  const startupRetryTimerRef = useRef<number | null>(null);
  const [retryingWorkspaceIds, setRetryingWorkspaceIds] = useState<string[]>([]);
  const reconnectAttemptedWorkspaceIdRef = useRef("");
  const backgroundSessionLoadInFlight = useRef<Map<string, number>>(new Map());
  const loadedWorkspaceIdsRef = useRef(new Set<string>());
  const workspaceSelectionCommitTimerRef = useRef<number | null>(null);
  const rememberPendingCreatedSession = useCallback((workspaceId: string, sessionId: string) => {
    const id = sessionId.trim();
    if (!workspaceId || !id) return;
    pendingCreatedSessionIdsRef.current[workspaceId] = {
      ...(pendingCreatedSessionIdsRef.current[workspaceId] ?? {}),
      [id]: Date.now(),
    };
  }, []);
  const mergeFetchedSessionsWithPending = useCallback((workspaceId: string, fetched: RouteSession[], current: RouteSession[]) => {
    const pending = pendingCreatedSessionIdsRef.current[workspaceId];
    let merged = fetched;
    if (pending) {
      const now = Date.now();
      const fetchedIds = new Set(fetched.flatMap((session) => session?.id ? [String(session.id)] : []));
      const pendingIds = Object.keys(pending);

      for (const id of pendingIds) {
        if (fetchedIds.has(id)) {
          delete pending[id];
        }
      }

      const preserved = current.filter((session) => {
        const id = String(session?.id ?? "");
        if (!id || fetchedIds.has(id)) return false;
        const createdAt = pending[id];
        if (typeof createdAt !== "number") return false;
        if (now - createdAt > 30_000) {
          delete pending[id];
          return false;
        }
        return true;
      });

      if (Object.keys(pending).length === 0) {
        delete pendingCreatedSessionIdsRef.current[workspaceId];
      }

      if (preserved.length > 0) merged = [...preserved, ...fetched];
    }

    const hydratedSessionId = hydratedRouteSessionIdsRef.current[workspaceId];
    if (hydratedSessionId && fetched.some((session) => session.id === hydratedSessionId)) {
      delete hydratedRouteSessionIdsRef.current[workspaceId];
      return merged;
    }
    return preserveWorkspaceRouteSession(
      merged,
      current,
      hydratedSessionId,
    );
  }, []);
  const loadWorkspaceSessionsInBackground = useCallback(
    async (workspaces: RouteWorkspace[]) => {
      const MAX_ATTEMPTS = 6;
      const backoffMs = (attempt: number) => Math.min(500 * Math.pow(2, attempt), 4_000);

      const fetchOnce = async (workspace: RouteWorkspace, attempt: number): Promise<void> => {
        const isRemoteRedrobWorkspace = workspace.workspaceType === "remote" && workspace.remoteType !== "opencode";
        const endpoint = endpointForWorkspace(workspace);
        if (!endpoint) {
          if (workspace.workspaceType === "remote") {
            const message = t("workspace.remote_worker_url_missing");
            setErrorsByWorkspaceId((current) => ({ ...current, [workspace.id]: message }));
            setWorkspaceConnectionOverrides((current) => ({
              ...current,
              [workspace.id]: {
                status: "error",
                message,
                checkedAt: Date.now(),
              },
            }));
            setRetryingWorkspaceIds((current) =>
              current.includes(workspace.id) ? current.filter((id) => id !== workspace.id) : current,
            );
          }
          return;
        }
        const startedAt = backgroundSessionLoadInFlight.current.get(workspace.id) ?? 0;
        if (startedAt && Date.now() - startedAt < 5_000) return;
        const requestStartedAt = Date.now();
        backgroundSessionLoadInFlight.current.set(workspace.id, requestStartedAt);
        if (isRemoteRedrobWorkspace) {
          setWorkspaceConnectionOverrides((current) => ({
            ...current,
            [workspace.id]: {
              status: "connecting",
              message: t("workspace_list.loading_remote_tasks"),
              checkedAt: null,
            },
          }));
        }
        try {
          const response = await endpoint.client.listSessions(endpoint.workspaceId, { limit: 200 });
          const fetchedItems = response.items ?? [];
          const workspaceRoot = normalizeDirectoryPath(workspace.path ?? "");
          const items = workspaceRoot && !isRemoteRedrobWorkspace
            ? fetchedItems.filter((session) =>
                normalizeDirectoryPath(session?.directory ?? "") === workspaceRoot,
              )
            : fetchedItems;
          setSessionsByWorkspaceId((current) => {
            const nextItems = mergeFetchedSessionsWithPending(workspace.id, items, current[workspace.id] ?? []);
            const next = { ...current, [workspace.id]: nextItems };
            sessionsByWorkspaceIdRef.current = next;
            return next;
          });
          loadedWorkspaceIdsRef.current.add(workspace.id);
          setErrorsByWorkspaceId((current) => ({ ...current, [workspace.id]: null }));
          setWorkspaceConnectionOverrides((current) => {
            if (isRemoteRedrobWorkspace) {
              return {
                ...current,
                [workspace.id]: {
                  status: "connected",
                  message: items.length > 0
                    ? t("workspace_list.connected_loaded_tasks", { count: items.length })
                    : t("workspace.connected_no_tasks"),
                  checkedAt: Date.now(),
                },
              };
            }
            if (current[workspace.id]?.status !== "error") return current;
            const next = { ...current };
            delete next[workspace.id];
            return next;
          });
          setRetryingWorkspaceIds((current) =>
            current.includes(workspace.id) ? current.filter((id) => id !== workspace.id) : current,
          );
          // When a workspace returns zero sessions during the initial batch
          // load, OpenCode may still be warming up its index.  Schedule a
          // single delayed retry so the sidebar doesn't stay permanently
          // empty while the managed engine finishes starting.
          if (items.length === 0 && attempt === 0) {
            window.setTimeout(() => {
              if (backgroundSessionLoadInFlight.current.get(workspace.id)) return;
              backgroundSessionLoadInFlight.current.delete(workspace.id);
              void fetchOnce(workspace, 1);
            }, 3_000);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : t("app.unknown_error");
          // The first cold call to OpenCode's /session endpoint often hits
          // the 12s server timeout while the daemon finishes warming up
          // its index. Retry silently with backoff until we get a response
          // or run out of attempts - the sidebar keeps its "loading" state
          // in the meantime instead of flashing "error" next to the
          // workspace name.
          if (attempt + 1 < MAX_ATTEMPTS && isTransientStartupError(message)) {
            if (backgroundSessionLoadInFlight.current.get(workspace.id) === requestStartedAt) {
              backgroundSessionLoadInFlight.current.delete(workspace.id);
            }
            await new Promise((r) => window.setTimeout(r, backoffMs(attempt)));
            await fetchOnce(workspace, attempt + 1);
            return;
          }
          // Final failure: keep local workspace startup quiet, but give
          // remote workers a precise endpoint/token/workspace diagnostic.
          if (workspace.workspaceType === "remote") {
            const connectionState = await diagnoseRemoteWorkspaceTaskLoadFailure(workspace, message);
            setErrorsByWorkspaceId((current) => ({
              ...current,
              [workspace.id]: connectionState.message ?? t("workspace.remote_worker_connection_failed"),
            }));
            setWorkspaceConnectionOverrides((current) => {
              return {
                ...current,
                [workspace.id]: connectionState,
              };
            });
          }
          setRetryingWorkspaceIds((current) =>
            current.includes(workspace.id) ? current.filter((id) => id !== workspace.id) : current,
          );
        } finally {
          if (backgroundSessionLoadInFlight.current.get(workspace.id) === requestStartedAt) {
            backgroundSessionLoadInFlight.current.delete(workspace.id);
          }
        }
      };

      await Promise.all(workspaces.map((workspace) => fetchOnce(workspace, 0)));
    },
    [endpointForWorkspace, mergeFetchedSessionsWithPending],
  );
  const workspaceSelectionCommitRef = useRef<(workspaceId: string) => Promise<void>>(async () => undefined);
  workspaceSelectionCommitRef.current = async (workspaceId) => {
    if (isDesktopRuntime()) {
      await workspaceSetSelected(workspaceId).catch(() => undefined);
      await workspaceSetRuntimeActive(workspaceId).catch(() => undefined);
    }
    const workspace = workspacesRef.current.find((item) => item.id === workspaceId) ?? null;
    const endpoint = endpointForWorkspace(workspace);
    if (!endpoint) return;
    if (workspace?.workspaceType === "local" && serverActiveWorkspaceIdRef.current === workspaceId) return;
    await endpoint.client.activateWorkspace(endpoint.workspaceId, { persist: true });
    if (workspace?.workspaceType === "local") serverActiveWorkspaceIdRef.current = workspaceId;
  };
  const workspaceSelectionCommitterRef = useRef<ReturnType<typeof createLatestWorkspaceCommitter> | null>(null);
  if (!workspaceSelectionCommitterRef.current) {
    workspaceSelectionCommitterRef.current = createLatestWorkspaceCommitter(
      (workspaceId) => workspaceSelectionCommitRef.current(workspaceId),
    );
  }

  // The route's part of each app-wide connection refresh. The provider owns
  // bootstrap, connection resolution and the merged records; at each point
  // where the route used to write its own state it calls back in here. Read
  // through a ref so a refresh always reaches the newest closures.
  const routeParticipantRef = useRef<WorkspaceRefreshParticipant>({});
  routeParticipantRef.current = {
    onRefreshStart: () => {
      setLoading(true);
      setRouteError(null);
    },
    onHostInfo: (info) => onHostInfo(info),
    onServerSettingsChanged: () => onServerSettingsChanged(),
    // Prefer, in order: the URL-selected workspace (if it owns the session),
    // the user's last-active workspace from localStorage, the desktop's
    // activeId, the server's activeId, then the first known workspace.
    chooseWorkspaceId: (context) => {
      const routeId = routeWorkspaceIdRef.current;
      let nextWorkspaceId =
        (routeId && context.workspaces.some((workspace) => workspace.id === routeId) ? routeId : "") ||
        chooseDefaultWorkspaceId(context);
      if (workspaceInferenceSessionIdRef.current) {
        const match = context.workspaces.find((workspace) =>
          (sessionsByWorkspaceIdRef.current[workspace.id] ?? []).some(
            (session) => session?.id === workspaceInferenceSessionIdRef.current,
          ),
        );
        if (match?.id) nextWorkspaceId = match.id;
      }
      return nextWorkspaceId;
    },
    onConnected: ({ workspaces: nextWorkspaces, workspaceId: nextWorkspaceId }) => {
      // Preserve any sessions we already have cached so switching routes
      // doesn't erase the sidebar while we refetch.
      const alreadyLoadedWorkspaceIds = new Set(loadedWorkspaceIdsRef.current);
      const cachedEntries = nextWorkspaces.map((workspace) => ({
        workspaceId: workspace.id,
        sessions: sessionsByWorkspaceIdRef.current[workspace.id] ?? [],
      }));
      const backgroundWorkspaceIds = planRouteWorkspaceLoads(
        nextWorkspaces.map((workspace) => workspace.id),
        nextWorkspaceId,
        alreadyLoadedWorkspaceIds,
      );
      const nextSessionsByWorkspaceId = Object.fromEntries(cachedEntries.map((entry) => [entry.workspaceId, entry.sessions]));
      sessionsByWorkspaceIdRef.current = nextSessionsByWorkspaceId;
      setSessionsByWorkspaceId(nextSessionsByWorkspaceId);
      setErrorsByWorkspaceId((previous) => {
        const next: Record<string, string | null> = {};
        for (const workspace of nextWorkspaces) {
          next[workspace.id] = previous[workspace.id] ?? null;
        }
        return next;
      });
      setRetryingWorkspaceIds(backgroundWorkspaceIds);
      // Session list comes from OpenCode's index and can be slow on cold
      // boot. Kick it off in the background instead of blocking the route
      // so the UI is interactive immediately; the sidebar shows a
      // loading state per-workspace until the list arrives.
      const backgroundWorkspaces = nextWorkspaces.filter((workspace) => backgroundWorkspaceIds.includes(workspace.id));
      if (backgroundWorkspaces.length > 0) {
        void loadWorkspaceSessionsInBackground(backgroundWorkspaces);
      }
    },
    onDisconnected: () => {
      sessionsByWorkspaceIdRef.current = {};
      setSessionsByWorkspaceId({});
      setErrorsByWorkspaceId({});
    },
    onRouteError: (message) => setRouteError(message),
    onSettled: ({ routeReady }) => {
      setLoading(false);
      setRouteRefreshVersion((current) => current + 1);
      // Tell the boot overlay the first route data load has completed so
      // the overlay dismisses after BOTH the desktop boot and the workspace
      // list/sessions are ready. A transient desktop connection gap does
      // not count: the overlay must outlast the restart recovery.
      if (routeReady) markBootRouteReady();
    },
  };
  // Registered in a layout effect so it is in place before the route's own
  // first refresh (a passive effect) and before the provider's mount refresh.
  useLayoutEffect(() => {
    const participant: WorkspaceRefreshParticipant = {
      onRefreshStart: () => routeParticipantRef.current.onRefreshStart?.(),
      onHostInfo: (info) => routeParticipantRef.current.onHostInfo?.(info),
      onServerSettingsChanged: () => routeParticipantRef.current.onServerSettingsChanged?.(),
      chooseWorkspaceId: (context) =>
        routeParticipantRef.current.chooseWorkspaceId?.(context) ?? chooseDefaultWorkspaceId(context),
      onConnected: (result) => routeParticipantRef.current.onConnected?.(result),
      onDisconnected: () => routeParticipantRef.current.onDisconnected?.(),
      onRouteError: (message) => routeParticipantRef.current.onRouteError?.(message),
      onSettled: (result) => routeParticipantRef.current.onSettled?.(result),
    };
    return registerRefreshParticipant(participant);
  }, [registerRefreshParticipant]);

  // Keeps the identity churn the route's callers depended on: a new legacy
  // inference key used to re-create refreshRouteState and re-run its effect.
  const refreshRouteState = useCallback(
    (options?: WorkspaceConnectionRefreshOptions) => refreshWorkspaceConnection(options),
    [legacyWorkspaceInferenceKey, refreshWorkspaceConnection],
  );

  const routeWorkspaceKnown = Boolean(
    routeWorkspaceId && workspaces.some((workspace) => workspace.id === routeWorkspaceId),
  );
  useEffect(() => {
    if (workspaceSelectionCommitTimerRef.current !== null) {
      window.clearTimeout(workspaceSelectionCommitTimerRef.current);
      workspaceSelectionCommitTimerRef.current = null;
    }
    if (!routeWorkspaceId) return;

    // The URL is the user's newest selection. Persist it synchronously so a
    // slow refresh or activation can never leave storage on an older route.
    setLegacySelectedWorkspaceId(routeWorkspaceId);
    writeActiveWorkspaceId(routeWorkspaceId);
    if (!routeWorkspaceKnown) return;

    workspaceSelectionCommitTimerRef.current = window.setTimeout(() => {
      workspaceSelectionCommitTimerRef.current = null;
      workspaceSelectionCommitterRef.current?.request(routeWorkspaceId);
    }, ROUTE_WORKSPACE_ACTIVATION_SETTLE_MS);
    const workspaceIdsToLoad = planRouteWorkspaceLoads(
      workspacesRef.current.map((workspace) => workspace.id),
      routeWorkspaceId,
      loadedWorkspaceIdsRef.current,
    );
    const workspace = workspacesRef.current.find((item) => item.id === workspaceIdsToLoad[0]);
    if (workspace) {
      setRetryingWorkspaceIds((current) => Array.from(new Set([...current, workspace.id])));
      void loadWorkspaceSessionsInBackground([workspace]);
    }
    return () => {
      if (workspaceSelectionCommitTimerRef.current === null) return;
      window.clearTimeout(workspaceSelectionCommitTimerRef.current);
      workspaceSelectionCommitTimerRef.current = null;
    };
  }, [loadWorkspaceSessionsInBackground, routeWorkspaceId, routeWorkspaceKnown]);
  const handleRuntimeSessionUpdated = useCallback((update: { sessionId: string; info: Record<string, unknown> }) => {
    if (!selectedWorkspaceId) return;
    setSessionsByWorkspaceId((current) => {
      const list = current[selectedWorkspaceId] ?? [];
      const index = list.findIndex((session) => session?.id === update.sessionId);
      if (index < 0) return current;
      const nextSession = { ...list[index], ...update.info, id: update.sessionId };
      if (JSON.stringify(nextSession) === JSON.stringify(list[index])) return current;
      const nextList = [...list];
      nextList[index] = nextSession;
      const next = { ...current, [selectedWorkspaceId]: nextList };
      sessionsByWorkspaceIdRef.current = next;
      return next;
    });
  }, [selectedWorkspaceId]);
  const handleRuntimeSessionCreated = useCallback((session: Session) => {
    if (!selectedWorkspaceId) return;
    rememberPendingCreatedSession(selectedWorkspaceId, session.id);
    setSessionsByWorkspaceId((current) => {
      const list = current[selectedWorkspaceId] ?? [];
      const nextList = mergeWorkspaceRouteSession(list, session);
      if (nextList === list) return current;
      const next = { ...current, [selectedWorkspaceId]: nextList };
      sessionsByWorkspaceIdRef.current = next;
      return next;
    });
  }, [rememberPendingCreatedSession, selectedWorkspaceId]);
  const handleRuntimeSessionDeleted = useCallback((sessionId: string) => {
    if (!selectedWorkspaceId) return;
    setSessionsByWorkspaceId((current) => {
      const list = current[selectedWorkspaceId] ?? [];
      const nextList = removeWorkspaceRouteSession(list, sessionId);
      if (nextList === list) return current;
      const next = { ...current, [selectedWorkspaceId]: nextList };
      sessionsByWorkspaceIdRef.current = next;
      return next;
    });
  }, [selectedWorkspaceId]);

  useEffect(() => {
    const activeWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
    setWorkspaceConnectionOverrides((current) => {
      let changed = false;
      const next: Record<string, WorkspaceConnectionState> = {};
      for (const [workspaceId, state] of Object.entries(current)) {
        if (activeWorkspaceIds.has(workspaceId)) {
          next[workspaceId] = state;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [workspaces]);

  useEffect(() => {
    sessionsByWorkspaceIdRef.current = sessionsByWorkspaceId;
  }, [sessionsByWorkspaceId]);

  const handleRemoteWorkspaceConnectionSaved = useCallback(
    async (workspaceId: string) => {
      delete remoteWorkspaceCheckRunRef.current[workspaceId];
      setWorkspaceConnectionOverrides((current) => {
        const next = { ...current };
        delete next[workspaceId];
        return next;
      });
      setErrorsByWorkspaceId((current) => ({ ...current, [workspaceId]: null }));
      setRetryingWorkspaceIds((current) => current.filter((id) => id !== workspaceId));
      await refreshRouteState();
    },
    [refreshRouteState],
  );

  // The route's first refresh on mount (and again when the legacy inference
  // key changes). The settings-changed and visibility listeners that
  // supersede it live in WorkspaceConnectionProvider.
  useEffect(() => {
    void refreshRouteState();
    return () => {
      if (startupRetryTimerRef.current !== null) {
        window.clearTimeout(startupRetryTimerRef.current);
        startupRetryTimerRef.current = null;
      }
    };
  }, [refreshRouteState]);

  // Inspector wiring: publish the route's current state so an external
  // operator (or an AI driver using browser tools) can call
  // `window.__redrob.snapshot()` or `window.__redrob.slice("route")` and
  // see workspaces / sessions / connection info without walking the DOM.
  useEffect(() => {
    const dispose = publishInspectorSlice("route", () => ({
      loading,
      retryingWorkspaceIds,
      baseUrl,
      tokenPresent: token.length > 0,
      connected: Boolean(client),
      connectionPending,
      routeError,
      selectedSessionId,
      selectedWorkspaceId,
      persistedActiveWorkspaceId: readActiveWorkspaceId(),
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        displayNameResolved: workspace.displayNameResolved,
        workspaceType: workspace.workspaceType,
        path: workspace.path,
        sessionCount: (sessionsByWorkspaceId[workspace.id] ?? []).length,
        loading: retryingWorkspaceIds.includes(workspace.id),
        error: errorsByWorkspaceId[workspace.id] ?? null,
      })),
      sessionsByWorkspaceId: Object.fromEntries(
        Object.entries(sessionsByWorkspaceId).map(([wsId, items]) => [
          wsId,
          (items ?? []).map((session) => ({
            id: session?.id ?? null,
            title: session?.title ?? null,
            directory: session?.directory ?? null,
          })),
        ]),
      ),
    }));
    return dispose;
  }, [
    baseUrl,
    client,
    connectionPending,
    errorsByWorkspaceId,
    loading,
    retryingWorkspaceIds,
    selectedSessionId,
    selectedWorkspaceId,
    routeError,
    sessionsByWorkspaceId,
    token,
    workspaces,
  ]);

  // Once workspaces are loaded, normalize the URL onto the active workspace.
  // Deliberately no last-session restore here: a fresh app load with no
  // session in the URL lands on the empty "new task" state instead of
  // jumping back into the previously opened session.
  useEffect(() => {
    if (loading) return;
    if (routeWorkspaceId && workspaces.length > 0 && !workspaces.some((workspace) => workspace.id === routeWorkspaceId)) {
      const fallbackWorkspaceId = workspaces.some((workspace) => workspace.id === legacySelectedWorkspaceId)
        ? legacySelectedWorkspaceId
        : workspaces[0]?.id || "";
      if (fallbackWorkspaceId) {
        normalizeWorkspaceRoute(fallbackWorkspaceId, selectedSessionId, { replace: true });
      }
      return;
    }
    if (!routeWorkspaceId && selectedWorkspaceId) {
      normalizeWorkspaceRoute(selectedWorkspaceId, selectedSessionId, { replace: true });
    }
  }, [
    extensionsRouteActive,
    extensionsRoutePath,
    loading,
    legacySelectedWorkspaceId,
    normalizeWorkspaceRoute,
    routeWorkspaceId,
    selectedSessionId,
    selectedWorkspaceId,
    workspaces,
  ]);

  // Removing the LAST workspace clears the onboarding-complete flag.
  //
  // Otherwise the two pieces of state disagree: the user has no workspace and no way back to
  // onboarding, because the redirect below is suppressed by a flag from a run that no longer has
  // anything to show for it. They land on a main screen with nothing in it, and the only way out is
  // deleting files by hand -- which is how this was found.
  //
  // KEYED ON THE 1-OR-MORE -> 0 TRANSITION, not on "the list is empty". Onboarding itself runs with an
  // empty list from start to finish -- "Just look around" never creates a workspace -- and completion
  // is recorded partway through, at the attribution step. An effect that reset the flag whenever the
  // list was empty would therefore undo that mid-flow and send the user back to the first screen,
  // which is the exact bug the early write exists to fix.
  //
  // A failed refresh cannot trigger this: the error path only calls setWorkspaces when it has at least
  // one workspace to show, so it never reports an empty list. The `loading` guard keeps the check on
  // settled state as well.
  const previousWorkspaceCount = useRef(workspaces.length);
  useEffect(() => {
    const hadWorkspaces = previousWorkspaceCount.current > 0;
    previousWorkspaceCount.current = workspaces.length;
    if (loading) return;
    if (!hadWorkspaces || workspaces.length > 0) return;
    if (!local.prefs.hasCompletedOnboarding) return;
    local.setPrefs((previous) => ({ ...previous, hasCompletedOnboarding: false }));
  }, [loading, local, workspaces.length]);

  // Redirect to /welcome when no workspaces exist and the user hasn't
  // completed onboarding. There is no sign-in state to defer to any more, so
  // onboarding completion is the only thing that suppresses this.
  useEffect(() => {
    if (loading) return;
    if (workspaces.length > 0) return;
    if (local.prefs.hasCompletedOnboarding) return;
    navigate("/welcome", { replace: true });
  }, [loading, local.prefs.hasCompletedOnboarding, navigate, workspaces.length]);

  // NOTE: Blueprint seeding was removed from the route.
  // It was firing `materializeBlueprintSessions` + a session re-fetch on every
  // workspace change, which cascaded setState updates and froze the UI after
  // a few rapid switches. Empty workspaces now simply show "No tasks yet." and
  // the user creates their first session explicitly via "New task". Seeding
  // can be reintroduced later as a one-shot triggered from a button or from
  // the onboarding flow, not from the route effect loop.
  useEffect(() => {
    if (client && !connectionPending) {
      reconnectAttemptedWorkspaceIdRef.current = "";
    }
    if (
      !shouldAttemptDesktopLocalReconnect({
        desktopRuntime: isDesktopRuntime(),
        bootPhase,
        bootRouteReady,
        routeLoading: loading,
        hasClient: Boolean(client),
        connectionPending,
        workspaceType: selectedWorkspace?.workspaceType ?? null,
      })
    ) {
      return;
    }
    if (!selectedWorkspace) return;
    const workspaceId = selectedWorkspace.id?.trim() ?? "";
    if (!workspaceId || reconnectAttemptedWorkspaceIdRef.current === workspaceId) return;
    reconnectAttemptedWorkspaceIdRef.current = workspaceId;

    void ensureDesktopLocalRedrobConnection({
      route: "session",
      workspace: selectedWorkspace,
      allWorkspaces: workspaces,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : describeRouteError(error);
      setRouteError(message);
      // Recovery definitively failed. Release the boot overlay so the
      // retained route (with this error surfaced) is visible instead of the
      // overlay wedging forever.
      markBootRouteReady();
    });
  }, [bootPhase, bootRouteReady, client, connectionPending, loading, markBootRouteReady, selectedWorkspace, workspaces]);

  const selectedWorkspaceRoot = selectedWorkspace?.path?.trim() || "";
  // Single source of truth for the selected workspace's server URL/token/id.
  // For remote workspaces this is the worker that owns the workspace; for
  // local workspaces it's the user's local Redrob Cowork server.
  const selectedWorkspaceEndpoint = useWorkspaceServerClient(selectedWorkspace, { baseUrl, token });
  const selectedWorkspaceServerToken = selectedWorkspaceEndpoint?.token ?? "";
  const opencodeBaseUrl = selectedWorkspaceEndpoint?.opencodeBaseUrl ?? "";
  const selectedWorkspaceError = errorsByWorkspaceId[selectedWorkspaceId] ?? null;
  const selectedSessionKnown = Boolean(
    selectedSessionId &&
      (sessionsByWorkspaceId[selectedWorkspaceId] ?? []).some((session) => session?.id === selectedSessionId),
  );
  const modernRouteSessionLoadKey = routeWorkspaceId && selectedSessionId && selectedWorkspace && selectedWorkspaceEndpoint
    ? JSON.stringify([
        routeWorkspaceId,
        selectedSessionId,
        selectedWorkspaceEndpoint.baseUrl,
        selectedWorkspaceEndpoint.workspaceId,
        selectedWorkspaceEndpoint.token,
        routeRefreshVersion,
      ])
    : "";
  const modernRouteSessionLoadPending = Boolean(
    modernRouteSessionLoadKey &&
      !selectedSessionKnown &&
      (modernRouteSessionResolution?.key !== modernRouteSessionLoadKey || modernRouteSessionResolution.status === "loading"),
  );
  const activeModernRouteSessionResolution = modernRouteSessionResolution?.key === modernRouteSessionLoadKey
    ? modernRouteSessionResolution
    : null;
  const selectedWorkspaceIsLoading = retryingWorkspaceIds.includes(selectedWorkspaceId) || modernRouteSessionLoadPending;
  useEffect(() => {
    const stale = Object.entries(hydratedRouteSessionIdsRef.current).filter(
      ([workspaceId, sessionId]) => workspaceId !== selectedWorkspaceId || sessionId !== selectedSessionId,
    );
    if (stale.length === 0) return;
    for (const [workspaceId] of stale) delete hydratedRouteSessionIdsRef.current[workspaceId];
    setSessionsByWorkspaceId((current) => {
      let next = current;
      for (const [workspaceId, sessionId] of stale) {
        const items = current[workspaceId] ?? [];
        const filtered = removeWorkspaceRouteSession(items, sessionId);
        if (filtered === items) continue;
        if (next === current) next = { ...current };
        next[workspaceId] = filtered;
      }
      if (next !== current) sessionsByWorkspaceIdRef.current = next;
      return next;
    });
  }, [selectedSessionId, selectedWorkspaceId]);
  useEffect(() => {
    if (!modernRouteSessionLoadKey || !selectedWorkspaceEndpoint || !selectedSessionId) {
      setModernRouteSessionResolution(null);
      return;
    }
    if (selectedSessionKnown) {
      setModernRouteSessionResolution(null);
      return;
    }
    let cancelled = false;
    setModernRouteSessionResolution({ key: modernRouteSessionLoadKey, status: "loading" });

    const hydrateSelectedSession = async () => {
      const maxAttempts = 6;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (cancelled) return;
        try {
          // Bounded for the same reason the route refresh steps are: an
          // unresponsive server or a dead desktop bridge otherwise leaves this
          // await pending forever, and the session pane has nothing to render
          // but a loading state. A rejection here is retried by the loop and
          // then surfaces as a real error, which the user can act on.
          const response = await withRouteRefreshTimeout(
            selectedWorkspaceEndpoint.client.getSession(
              selectedWorkspaceEndpoint.workspaceId,
              selectedSessionId,
            ),
            t("session.session_load_operation"),
          );
          if (cancelled) return;
          if (response.item.id !== selectedSessionId) {
            setModernRouteSessionResolution({
              key: modernRouteSessionLoadKey,
              status: "error",
              message: t("session.server_returned_different_session"),
            });
            return;
          }
          setSessionsByWorkspaceId((current) => {
            const currentItems = current[selectedWorkspaceId] ?? [];
            if (currentItems.some((session) => session.id === selectedSessionId)) {
              delete hydratedRouteSessionIdsRef.current[selectedWorkspaceId];
              return current;
            }
            hydratedRouteSessionIdsRef.current[selectedWorkspaceId] = selectedSessionId;
            const nextItems = mergeWorkspaceRouteSession(currentItems, response.item);
            const next = { ...current, [selectedWorkspaceId]: nextItems };
            sessionsByWorkspaceIdRef.current = next;
            return next;
          });
          setErrorsByWorkspaceId((current) => ({ ...current, [selectedWorkspaceId]: null }));
          setModernRouteSessionResolution(null);
          return;
        } catch (error) {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : describeRouteError(error);
          const kind = classifyRouteSessionReadError(error);
          if (kind !== "retryable" || attempt + 1 >= maxAttempts) {
            setModernRouteSessionResolution({
              key: modernRouteSessionLoadKey,
              status: kind === "not-found" ? "not-found" : "error",
              message,
            });
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, Math.min(500 * Math.pow(2, attempt), 4_000)));
          if (cancelled) return;
        }
      }
    };

    void hydrateSelectedSession();

    return () => {
      cancelled = true;
    };
  }, [modernRouteSessionLoadKey, selectedSessionId, selectedSessionKnown, selectedWorkspaceId]);
  const routeNotFoundMessage = (() => {
    if (loading) return null;
    if (routeWorkspaceId && !selectedWorkspace) {
      return t("workspace.route_workspace_not_found");
    }
    if (selectedSessionId && !selectedSessionKnown && activeModernRouteSessionResolution?.status === "not-found") {
      return t("session.route_session_not_found");
    }
    if (selectedSessionId && !selectedSessionKnown && activeModernRouteSessionResolution?.status === "error") {
      return t("session.route_session_load_failed", { message: activeModernRouteSessionResolution.message });
    }
    return null;
  })();
  // Boot-level loading blocks the whole UI. Session-list retries only fill the
  // sidebar; they must not gate the composer/New task.
  const effectiveLoading = loading;

  const opencodeClient = useMemo(
    () =>
      opencodeBaseUrl && selectedWorkspaceServerToken && !selectedWorkspaceError
        ? createClient(opencodeBaseUrl, selectedWorkspaceRoot || undefined, {
            token: selectedWorkspaceServerToken,
            mode: "redrob",
          })
        : null,
    [opencodeBaseUrl, selectedWorkspaceError, selectedWorkspaceRoot, selectedWorkspaceServerToken],
  );
  useEffect(() => {
    if (!developerMode || !opencodeClient) return;
    return publishInspectorOpencodeClient(opencodeClient);
  }, [developerMode, opencodeClient]);
  const runRemoteWorkspaceConnectionCheck = useCallback(
    async (workspaceId: string, mode: "test" | "recover") => {
      const workspace = workspacesRef.current.find((item) => item.id === workspaceId);
      if (!workspace || workspace.workspaceType !== "remote") return false;
      const connectionKey = getRemoteWorkspaceConnectionKey(workspace);
      remoteWorkspaceCheckRunCounterRef.current += 1;
      const runId = String(remoteWorkspaceCheckRunCounterRef.current);
      remoteWorkspaceCheckRunRef.current[workspaceId] = runId;

      setWorkspaceConnectionOverrides((current) => ({
        ...current,
        [workspaceId]: {
          status: "connecting",
          message: t("config.testing_connection"),
          checkedAt: null,
        },
      }));

      const result = await testRemoteWorkspaceConnection(workspace);
      const currentWorkspace = workspacesRef.current.find((item) => item.id === workspaceId);
      if (
        remoteWorkspaceCheckRunRef.current[workspaceId] !== runId ||
        !currentWorkspace ||
        getRemoteWorkspaceConnectionKey(currentWorkspace) !== connectionKey
      ) {
        if (remoteWorkspaceCheckRunRef.current[workspaceId] === runId) {
          delete remoteWorkspaceCheckRunRef.current[workspaceId];
        }
        return false;
      }
      setWorkspaceConnectionOverrides((current) => ({
        ...current,
        [workspaceId]: result.state,
      }));

      if (!result.ok) {
        setErrorsByWorkspaceId((current) => ({
          ...current,
          [workspaceId]: result.state.message ?? t("workspace.remote_worker_connection_failed"),
        }));
        if (remoteWorkspaceCheckRunRef.current[workspaceId] === runId) {
          delete remoteWorkspaceCheckRunRef.current[workspaceId];
        }
        return false;
      }

      setErrorsByWorkspaceId((current) => ({ ...current, [workspaceId]: null }));
      setRetryingWorkspaceIds((current) => current.filter((id) => id !== workspaceId));
      if (mode === "recover") {
        await refreshRouteState();
      }
      if (remoteWorkspaceCheckRunRef.current[workspaceId] === runId) {
        delete remoteWorkspaceCheckRunRef.current[workspaceId];
      }
      return true;
    },
    [refreshRouteState],
  );

  return {
    navigateToWorkspaceSession,
    routeWorkspaceId,
    selectedSessionId,
    loading,
    effectiveLoading,
    client,
    baseUrl,
    token,
    workspaces,
    setWorkspaces,
    workspacesRef,
    workspaceOrderIds,
    setWorkspaceOrderIds,
    workspaceOrderIdsRef,
    sessionsByWorkspaceId,
    setSessionsByWorkspaceId,
    sessionsByWorkspaceIdRef,
    errorsByWorkspaceId,
    setErrorsByWorkspaceId,
    workspaceConnectionOverrides,
    routeError,
    setRouteError,
    legacySelectedWorkspaceId,
    setLegacySelectedWorkspaceId,
    retryingWorkspaceIds,
    setRetryingWorkspaceIds,
    startupRetryTimerRef,
    selectedWorkspaceId,
    selectedWorkspace,
    selectedWorkspaceRoot,
    selectedWorkspaceEndpoint,
    selectedWorkspaceServerToken,
    opencodeBaseUrl,
    opencodeClient,
    selectedWorkspaceIsLoading,
    selectedWorkspaceError,
    routeNotFoundMessage,
    endpointForWorkspace,
    refreshRouteState,
    loadWorkspaceSessionsInBackground,
    rememberPendingCreatedSession,
    handleRuntimeSessionCreated,
    handleRuntimeSessionUpdated,
    handleRuntimeSessionDeleted,
    handleRemoteWorkspaceConnectionSaved,
    runRemoteWorkspaceConnectionCheck,
  };
}
