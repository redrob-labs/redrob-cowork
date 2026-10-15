/** @jsxImportSource react */
// App-wide workspace connection core, mounted once around <Routes> so every
// route (chat, /skills, /scheduled, /history) reads the same live connection.
// It owns ONLY the connection/workspace core lifted out of
// useWorkspaceRouteState: the local Redrob connection lifecycle, the merged
// local+remote workspace records, the reactive active workspace, and endpoint
// resolution through the sanctioned resolver. URL normalization, redirects,
// session lists and selected-session hydration stay route-local; the chat
// route joins a refresh through registerRefreshParticipant.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";

import { recordInspectorEvent } from "@/app/lib/app-inspector";
import {
  resolveWorkspaceListSelectedId,
  workspaceBootstrap,
  type RedrobServerInfo,
  type WorkspaceList,
} from "@/app/lib/desktop";
import { createRedrobServerClient, type RedrobServerClient } from "@/app/lib/redrob-server";
import { isDesktopRuntime } from "@/app/lib/runtime-env";
import type { ResolvedWorkspaceEndpoint } from "@/app/lib/workspace-endpoint";
import { t } from "@/i18n";
import {
  createWorkspaceServerClientResolver,
  useWorkspaceServerClient,
} from "@/react-app/infra/workspace-server-client";

import { resolveRedrobConnection } from "./redrob-connection";
import {
  createRouteRefreshLifecycle,
  planRouteConnectionGap,
  withRouteRefreshTimeout,
} from "./route-refresh-control";
import { describeRouteError, orderRouteWorkspaces, type RouteWorkspace } from "./route-workspaces";
import {
  readActiveWorkspaceId,
  readWorkspaceOrderIds,
  subscribeActiveWorkspaceId,
  writeActiveWorkspaceId,
} from "./session-memory";
import {
  chooseDefaultWorkspaceId,
  runWorkspaceConnectionRefresh,
  selectActiveWorkspace,
  type WorkspaceChoiceContext,
} from "./workspace-connection-refresh";

/** Options for one refresh request. */
export type WorkspaceConnectionRefreshOptions = {
  /** Cancel an in-flight refresh instead of skipping this one. */
  supersede?: boolean;
};

/**
 * Route hooks a refresh calls at the points where the chat route used to
 * write its own state. Every member is optional; with none registered the
 * provider refreshes the connection core alone (e.g. on /skills).
 */
export type WorkspaceRefreshParticipant = {
  /** A refresh began (the route sets loading and clears its error). */
  onRefreshStart?: () => void;
  /** Host info resolved with the connection. */
  onHostInfo?: (info: RedrobServerInfo | null) => void;
  /** The settings-changed signal fired, before the superseding refresh. */
  onServerSettingsChanged?: () => void;
  /** Picks the workspace a connected refresh selects; defaults to chooseDefaultWorkspaceId. */
  chooseWorkspaceId?: (context: WorkspaceChoiceContext) => string;
  /** A connected refresh committed its records (the route seeds sessions and starts loads). */
  onConnected?: (result: { workspaces: RouteWorkspace[]; workspaceId: string }) => void;
  /** A web refresh found no server (the route clears its session lists). */
  onDisconnected?: () => void;
  /** A refresh produced a route-visible error message. */
  onRouteError?: (message: string) => void;
  /** The current refresh settled; routeReady is false during a desktop connection gap. */
  onSettled?: (result: { routeReady: boolean }) => void;
};

/** What the provider shares with the chat route and the Desk publisher. */
export type WorkspaceConnectionValue = {
  /** Redrob client for the local server; null while disconnected or in a gap. */
  client: RedrobServerClient | null;
  /** Local Redrob server base URL; empty while disconnected or in a gap. */
  baseUrl: string;
  /** Local Redrob server token; empty while disconnected or in a gap. */
  token: string;
  /** True while the desktop local server has not republished a usable URL and token. */
  connectionPending: boolean;
  /** Merged local and remote workspace records, in the user's order. */
  workspaces: RouteWorkspace[];
  /** Replaces the records (the route reorders them). */
  setWorkspaces: Dispatch<SetStateAction<RouteWorkspace[]>>;
  /** The latest records, for callbacks that must not re-bind on every change. */
  workspacesRef: MutableRefObject<RouteWorkspace[]>;
  /** The user's workspace order. */
  workspaceOrderIds: string[];
  /** Replaces the user's workspace order. */
  setWorkspaceOrderIds: Dispatch<SetStateAction<string[]>>;
  /** The latest workspace order, for refresh and reorder callbacks. */
  workspaceOrderIdsRef: MutableRefObject<string[]>;
  /** The active workspace id; reactive to writeActiveWorkspaceId from any surface. */
  activeWorkspaceId: string;
  /** Sets the active workspace id without persisting it (the route's legacy setter). */
  setActiveWorkspaceId: Dispatch<SetStateAction<string>>;
  /** The active workspace record, by the route's selection rule. */
  selectedWorkspace: RouteWorkspace | null;
  /** The active workspace's endpoint from useWorkspaceServerClient; remote records use their own worker. */
  selectedWorkspaceEndpoint: ResolvedWorkspaceEndpoint | null;
  /** The server's last reported active workspace id, for activation de-duplication. */
  serverActiveWorkspaceIdRef: MutableRefObject<string>;
  /** Resolves any record's endpoint through the sanctioned resolver; permanently stable. */
  endpointForWorkspace: (workspace: RouteWorkspace | null | undefined) => ResolvedWorkspaceEndpoint | null;
  /** Runs one connection refresh; permanently stable. */
  refresh: (options?: WorkspaceConnectionRefreshOptions) => Promise<void>;
  /** Joins the chat route to refreshes; returns the unregister function. */
  registerRefreshParticipant: (participant: WorkspaceRefreshParticipant) => () => void;
};

const WorkspaceConnectionContext = createContext<WorkspaceConnectionValue | null>(null);

/** Reads the app-wide workspace connection; throws outside WorkspaceConnectionProvider. */
export function useWorkspaceConnection(): WorkspaceConnectionValue {
  const value = useContext(WorkspaceConnectionContext);
  if (!value) throw new Error("useWorkspaceConnection must be used inside WorkspaceConnectionProvider");
  return value;
}

/** Owns the connection/workspace core for the whole app; mount once around <Routes>. */
export function WorkspaceConnectionProvider(props: { children: ReactNode }) {
  const [client, setClient] = useState<RedrobServerClient | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  // True while the desktop local server has not (re)published a usable base
  // URL/token - a restart or boot gap. Display state is retained meanwhile.
  const [connectionPending, setConnectionPending] = useState(false);
  const [workspaces, setWorkspaces] = useState<RouteWorkspace[]>([]);
  const [workspaceOrderIds, setWorkspaceOrderIds] = useState<string[]>(() => readWorkspaceOrderIds());
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => readActiveWorkspaceId() ?? "");
  const workspacesRef = useRef<RouteWorkspace[]>([]);
  const workspaceOrderIdsRef = useRef(workspaceOrderIds);
  const serverActiveWorkspaceIdRef = useRef("");
  const refreshLifecycleRef = useRef(createRouteRefreshLifecycle());
  const participantRef = useRef<WorkspaceRefreshParticipant | null>(null);

  // The resolver lives behind a ref so `endpointForWorkspace` stays permanently
  // stable; rebinding it on every baseUrl/token change once produced a
  // render-refresh-setWorkspaces loop in the route.
  const currentResolver = useMemo(() => createWorkspaceServerClientResolver({ baseUrl, token }), [baseUrl, token]);
  const resolverRef = useRef(currentResolver);
  resolverRef.current = currentResolver;
  const updateLocalServer = useCallback((next: { baseUrl: string; token: string }) => {
    resolverRef.current = createWorkspaceServerClientResolver(next);
  }, []);
  const endpointForWorkspace = useCallback(
    (workspace: RouteWorkspace | null | undefined): ResolvedWorkspaceEndpoint | null => resolverRef.current(workspace),
    [],
  );

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);
  useEffect(() => {
    workspaceOrderIdsRef.current = workspaceOrderIds;
  }, [workspaceOrderIds]);

  // Settings, onboarding and the route all persist the active workspace
  // through session-memory; this keeps every consumer on the newest choice.
  useEffect(
    () =>
      subscribeActiveWorkspaceId((id) => {
        const next = id ?? "";
        setActiveWorkspaceId((current) => (current === next ? current : next));
      }),
    [],
  );

  const refresh = useCallback(async (options?: WorkspaceConnectionRefreshOptions) => {
    // Dedupe overlapping refreshes; `supersede` makes the running one stale
    // instead of racing it (see createRouteRefreshLifecycle).
    const attempt = refreshLifecycleRef.current.begin(options);
    if (!attempt) return;
    const participant = () => participantRef.current;
    let routeReady = true;
    try {
      // Inside the try so that if a participant hook ever throws, attempt.finish() in finally
      // still releases the in-flight slot and later refreshes are not permanently skipped.
      participant()?.onRefreshStart?.();
      const outcome = await runWorkspaceConnectionRefresh({
        desktopRuntime: isDesktopRuntime(),
        bootstrapDesktop: () =>
          withRouteRefreshTimeout(workspaceBootstrap(), t("workspace.desktop_workspace_bootstrap")) as Promise<WorkspaceList>,
        resolveConnection: () =>
          withRouteRefreshTimeout(resolveRedrobConnection(), t("workspace.redrob_work_server_connection")),
        createServerClient: (input) => createRedrobServerClient(input),
        listWorkspaces: (redrobClient) =>
          withRouteRefreshTimeout(redrobClient.listWorkspaces(), t("workspace.workspace_list_operation")),
        readPreviousWorkspaces: () => workspacesRef.current,
        readOrderIds: () => workspaceOrderIdsRef.current,
        isCurrent: attempt.isCurrent,
        onBootstrapError: (error) => {
          console.error("[session-route] workspaceBootstrap failed", error);
          recordInspectorEvent("route.workspace_bootstrap.error", {
            route: "session",
            message: describeRouteError(error),
            preservedWorkspaceCount: workspacesRef.current.length,
          });
        },
        onConnectionResolved: (connection) => {
          participant()?.onHostInfo?.(connection.hostInfo);
          // Install the handle synchronously: background session loads read
          // the resolver before React commits the mirrored state.
          updateLocalServer(connection);
        },
      });

      if (outcome.kind === "stale") return;

      if (outcome.kind === "gap") {
        routeReady = planRouteConnectionGap({ desktopRuntime: isDesktopRuntime() }).markRouteReady;
        // Quarantine the live connection (the old loopback port may now belong
        // to another process) but keep records as display state.
        setConnectionPending(true);
        updateLocalServer({ baseUrl: "", token: "" });
        setClient(null);
        setBaseUrl("");
        setToken("");
        if (workspacesRef.current.length === 0 && outcome.desktopWorkspaces.length > 0) {
          const ordered = orderRouteWorkspaces(outcome.desktopWorkspaces, workspaceOrderIdsRef.current);
          setWorkspaces(ordered);
          setActiveWorkspaceId(
            (current) => current || resolveWorkspaceListSelectedId(outcome.desktopList) || ordered[0]?.id || "",
          );
        }
        return;
      }

      if (outcome.kind === "disconnected") {
        participant()?.onHostInfo?.(outcome.hostInfo);
        updateLocalServer({ baseUrl: "", token: "" });
        setClient(null);
        setBaseUrl("");
        setToken("");
        const ordered = orderRouteWorkspaces(outcome.desktopWorkspaces, workspaceOrderIdsRef.current);
        setWorkspaces(ordered);
        participant()?.onDisconnected?.();
        setActiveWorkspaceId(resolveWorkspaceListSelectedId(outcome.desktopList) || ordered[0]?.id || "");
        return;
      }

      if (outcome.kind === "error") {
        const message = describeRouteError(outcome.error);
        console.error("[session-route] refreshRouteState failed", outcome.error);
        recordInspectorEvent("route.refresh.error", {
          route: "session",
          message,
          preservedWorkspaceCount: outcome.desktopWorkspaces.length,
        });
        participant()?.onRouteError?.(message);
        if (outcome.desktopWorkspaces.length > 0) {
          const ordered = orderRouteWorkspaces(outcome.desktopWorkspaces, workspaceOrderIdsRef.current);
          setWorkspaces(ordered);
          setActiveWorkspaceId(
            (current) => current || resolveWorkspaceListSelectedId(outcome.desktopList) || ordered[0]?.id || "",
          );
        }
        return;
      }

      const { listState } = outcome;
      if (!listState.usable || listState.error) {
        const message = listState.error ? describeRouteError(listState.error) : t("workspace.workspace_list_missing_items");
        console.warn("[session-route] workspace list degraded", listState.error ?? message);
        recordInspectorEvent("route.workspace_list.degraded", {
          route: "session",
          message,
          preservedWorkspaceCount: workspacesRef.current.length,
        });
        participant()?.onRouteError?.(message);
      }
      const nextWorkspaces = listState.workspaces;
      serverActiveWorkspaceIdRef.current = listState.activeId ?? "";
      const choice: WorkspaceChoiceContext = {
        workspaces: nextWorkspaces,
        persistedActiveId: readActiveWorkspaceId(),
        desktopSelectedId: resolveWorkspaceListSelectedId(outcome.desktopList) || "",
        serverActiveId: listState.activeId ?? "",
      };
      const nextWorkspaceId = (participant()?.chooseWorkspaceId ?? chooseDefaultWorkspaceId)(choice);

      updateLocalServer({ baseUrl: outcome.baseUrl, token: outcome.token });
      setConnectionPending(false);
      setClient(outcome.client);
      setBaseUrl(outcome.baseUrl);
      setToken(outcome.token);
      setWorkspaces(nextWorkspaces);
      setActiveWorkspaceId(nextWorkspaceId);
      // Only the chat route persists its choice, as before the extraction; a
      // refresh on /welcome or /skills must not overwrite an id onboarding or
      // settings just wrote.
      if (participant()) writeActiveWorkspaceId(nextWorkspaceId || null);
      participant()?.onConnected?.({ workspaces: nextWorkspaces, workspaceId: nextWorkspaceId });
      recordInspectorEvent("route.refresh.complete", {
        workspaces: nextWorkspaces.length,
        selectedWorkspaceId: nextWorkspaceId,
        errors: {},
      });
    } catch (error) {
      // A participant hook threw while the outcome was applied; surface it the
      // way the route's own refresh catch did.
      if (!attempt.isCurrent()) return;
      const message = describeRouteError(error);
      console.error("[session-route] refreshRouteState failed", error);
      recordInspectorEvent("route.refresh.error", {
        route: "session",
        message,
        preservedWorkspaceCount: workspacesRef.current.length,
      });
      participant()?.onRouteError?.(message);
    } finally {
      attempt.finish();
      // A superseded attempt changes nothing: the newer one owns settling.
      if (attempt.isCurrent()) participant()?.onSettled?.({ routeReady });
    }
  }, [updateLocalServer]);

  const registerRefreshParticipant = useCallback((participant: WorkspaceRefreshParticipant) => {
    participantRef.current = participant;
    return () => {
      if (participantRef.current === participant) participantRef.current = null;
    };
  }, []);

  // The provider's own lifecycle: a first refresh (skipped when the chat route
  // already started one), fresh connection info, and the window becoming visible.
  useEffect(() => {
    void refresh();
    const handleSettingsChange = () => {
      participantRef.current?.onServerSettingsChanged?.();
      // Supersede any in-flight refresh, including one stuck mid-flight, so
      // its stale resolution cannot overwrite the new connection state.
      void refresh({ supersede: true });
    };
    const handleVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      void refresh({ supersede: true });
    };
    window.addEventListener("redrob-server-settings-changed", handleSettingsChange);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("redrob-server-settings-changed", handleSettingsChange);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  const selectedWorkspace = useMemo(
    () => selectActiveWorkspace(workspaces, activeWorkspaceId),
    [activeWorkspaceId, workspaces],
  );
  // Single source of truth for the active workspace's server URL/token/id:
  // the owning worker for a remote record, the local server otherwise.
  const selectedWorkspaceEndpoint = useWorkspaceServerClient(selectedWorkspace, { baseUrl, token });

  const value = useMemo<WorkspaceConnectionValue>(
    () => ({
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
      activeWorkspaceId,
      setActiveWorkspaceId,
      selectedWorkspace,
      selectedWorkspaceEndpoint,
      serverActiveWorkspaceIdRef,
      endpointForWorkspace,
      refresh,
      registerRefreshParticipant,
    }),
    [
      activeWorkspaceId,
      baseUrl,
      client,
      connectionPending,
      endpointForWorkspace,
      refresh,
      registerRefreshParticipant,
      selectedWorkspace,
      selectedWorkspaceEndpoint,
      token,
      workspaceOrderIds,
      workspaces,
    ],
  );

  return <WorkspaceConnectionContext.Provider value={value}>{props.children}</WorkspaceConnectionContext.Provider>;
}
