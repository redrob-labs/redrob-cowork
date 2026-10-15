// Pure core of the app-wide workspace connection refresh: desktop bootstrap,
// local Redrob connection resolution, and the merged workspace record list.
// Extracted from useWorkspaceRouteState's refreshRouteState so the
// always-mounted WorkspaceConnectionProvider and its tests share one copy.
// It performs no React state writes; the provider applies the outcome.
import type { RedrobServerInfo, WorkspaceList } from "@/app/lib/desktop";
import type { RedrobServerClient } from "@/app/lib/redrob-server";

import { planRouteConnectionGap } from "./route-refresh-control";
import {
  mapDesktopWorkspace,
  refreshRouteWorkspaceListState,
  type RouteWorkspace,
  type RouteWorkspaceListState,
} from "./route-workspaces";

/** The subset of resolveRedrobConnection() the refresh reads. */
export type WorkspaceConnectionResolution = {
  /** Normalized local Redrob server base URL; empty while none is usable. */
  normalizedBaseUrl: string;
  /** Bearer token for that server (owner or client token). */
  resolvedToken: string;
  /** Host token, sent only where the server asks for it. */
  resolvedHostToken: string;
  /** Live desktop host info, when the desktop runtime reported it. */
  hostInfo: RedrobServerInfo | null;
};

/** The local server handle the sanctioned endpoint resolver is built from. */
export type LocalServerConnection = {
  /** Local Redrob server base URL. */
  baseUrl: string;
  /** Bearer token for that server. */
  token: string;
};

/** Injected effects, so the refresh runs headless in tests. */
export type WorkspaceConnectionRefreshInput = {
  /** True inside the desktop shell, where the local server owns its URL. */
  desktopRuntime: boolean;
  /** Desktop workspace bootstrap, already bounded by a timeout. */
  bootstrapDesktop: () => Promise<WorkspaceList>;
  /** Local Redrob connection resolution, already bounded by a timeout. */
  resolveConnection: () => Promise<WorkspaceConnectionResolution>;
  /** Builds the Redrob client for the resolved local server. */
  createServerClient: (input: { baseUrl: string; token: string; hostToken?: string }) => RedrobServerClient;
  /** Server workspace list call, already bounded by a timeout. */
  listWorkspaces: (client: RedrobServerClient) => Promise<unknown>;
  /** Reads the workspace records currently held, at the moment they are needed. */
  readPreviousWorkspaces: () => RouteWorkspace[];
  /** Reads the user's workspace order, at the moment it is needed. */
  readOrderIds: () => string[];
  /** False once a newer refresh began; stale attempts stop early. */
  isCurrent: () => boolean;
  /** Called when the desktop bootstrap throws; the previous records are kept. */
  onBootstrapError?: (error: unknown) => void;
  /** Called synchronously once a usable local connection resolves, before any list request. */
  onConnectionResolved?: (connection: LocalServerConnection & { hostInfo: RedrobServerInfo | null }) => void;
  /** Startup backoff for the workspace list; defaults to the route's schedule. */
  retryDelaysMs?: readonly number[];
  /** Sleep used between list retries; injectable for tests. */
  wait?: (delayMs: number) => Promise<void>;
};

/** What one refresh attempt found; the provider turns it into state. */
export type WorkspaceConnectionRefreshOutcome =
  | {
      /** A newer attempt superseded this one; nothing may be written. */
      kind: "stale";
    }
  | {
      /** Desktop restart or boot gap: retain display state, quarantine the connection. */
      kind: "gap";
      /** The desktop bootstrap list, when it loaded. */
      desktopList: WorkspaceList | null;
      /** Desktop records mapped for the route. */
      desktopWorkspaces: RouteWorkspace[];
    }
  | {
      /** Web with no usable server: a real disconnected state. */
      kind: "disconnected";
      /** Host info reported alongside the empty resolution. */
      hostInfo: RedrobServerInfo | null;
      /** The desktop bootstrap list, when it loaded. */
      desktopList: WorkspaceList | null;
      /** Desktop records mapped for the route. */
      desktopWorkspaces: RouteWorkspace[];
    }
  | {
      /** A live local connection and the merged record list. */
      kind: "connected";
      /** Redrob client for the local server. */
      client: RedrobServerClient;
      /** Local server base URL. */
      baseUrl: string;
      /** Local server token. */
      token: string;
      /** The desktop bootstrap list, when it loaded. */
      desktopList: WorkspaceList | null;
      /** Merged and ordered records plus the server's active id and any list error. */
      listState: RouteWorkspaceListState;
    }
  | {
      /** The refresh threw; desktop records are offered as a fallback. */
      kind: "error";
      /** What was thrown. */
      error: unknown;
      /** The desktop bootstrap list, when it loaded. */
      desktopList: WorkspaceList | null;
      /** Desktop records mapped for the route, or the previous records. */
      desktopWorkspaces: RouteWorkspace[];
    };

/** Inputs to the workspace choice made after a successful refresh. */
export type WorkspaceChoiceContext = {
  /** The merged, ordered workspace records. */
  workspaces: RouteWorkspace[];
  /** The persisted last-active workspace id, if any. */
  persistedActiveId: string | null;
  /** The desktop's selected workspace id, if any. */
  desktopSelectedId: string;
  /** The server's active workspace id, if any. */
  serverActiveId: string;
};

/** Refresh steps used when the server is still waking up (matches the route's schedule). */
export const WORKSPACE_LIST_RETRY_DELAYS_MS: readonly number[] = [250, 750, 1_500];

/**
 * Runs one connection refresh: desktop bootstrap, local connection, and the
 * merged workspace list (mergeRouteWorkspaces via refreshRouteWorkspaceListState,
 * which keeps desktop remote rem_ records from being clobbered).
 */
export async function runWorkspaceConnectionRefresh(
  input: WorkspaceConnectionRefreshInput,
): Promise<WorkspaceConnectionRefreshOutcome> {
  let desktopList: WorkspaceList | null = null;
  let desktopWorkspaces = input.readPreviousWorkspaces();
  try {
    if (input.desktopRuntime) {
      try {
        desktopList = await input.bootstrapDesktop();
        desktopWorkspaces = (desktopList.workspaces ?? []).map(mapDesktopWorkspace);
      } catch (error) {
        input.onBootstrapError?.(error);
        desktopWorkspaces = input.readPreviousWorkspaces();
      }
    }
    if (!input.isCurrent()) return { kind: "stale" };

    const { normalizedBaseUrl, resolvedToken, resolvedHostToken, hostInfo } = await input.resolveConnection();
    if (!input.isCurrent()) return { kind: "stale" };
    if (!normalizedBaseUrl || !resolvedToken) {
      const gapPlan = planRouteConnectionGap({ desktopRuntime: input.desktopRuntime });
      if (gapPlan.retainExistingState) return { kind: "gap", desktopList, desktopWorkspaces };
      return { kind: "disconnected", hostInfo, desktopList, desktopWorkspaces };
    }

    // Install the handle before any workspace-scoped request can read the resolver.
    input.onConnectionResolved?.({ baseUrl: normalizedBaseUrl, token: resolvedToken, hostInfo });

    const client = input.createServerClient({
      baseUrl: normalizedBaseUrl,
      token: resolvedToken,
      hostToken: resolvedHostToken || undefined,
    });
    const listState = await refreshRouteWorkspaceListState({
      load: () => input.listWorkspaces(client),
      desktopWorkspaces,
      previousWorkspaces: input.readPreviousWorkspaces(),
      orderIds: input.readOrderIds(),
      retryDelaysMs: input.retryDelaysMs ?? WORKSPACE_LIST_RETRY_DELAYS_MS,
      wait: input.wait,
    });
    if (!input.isCurrent()) return { kind: "stale" };
    return {
      kind: "connected",
      client,
      baseUrl: normalizedBaseUrl,
      token: resolvedToken,
      desktopList,
      listState,
    };
  } catch (error) {
    if (!input.isCurrent()) return { kind: "stale" };
    return { kind: "error", error, desktopList, desktopWorkspaces };
  }
}

/**
 * The workspace a refresh selects when no chat route is mounted: the
 * persisted last-active one, then the desktop's, then the server's, then the first.
 */
export function chooseDefaultWorkspaceId(context: WorkspaceChoiceContext): string {
  const { workspaces, persistedActiveId } = context;
  return (
    (persistedActiveId && workspaces.some((workspace) => workspace.id === persistedActiveId) ? persistedActiveId : "") ||
    context.desktopSelectedId ||
    context.serverActiveId ||
    workspaces[0]?.id ||
    ""
  );
}

/**
 * The record for an active id, mirroring the route's rule: an unknown id
 * selects nothing, an empty id falls back to the first workspace.
 */
export function selectActiveWorkspace(workspaces: RouteWorkspace[], activeWorkspaceId: string): RouteWorkspace | null {
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? (activeWorkspaceId ? null : workspaces[0] ?? null);
}
