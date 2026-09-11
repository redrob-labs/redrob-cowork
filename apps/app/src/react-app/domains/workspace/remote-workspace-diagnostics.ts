import type { WorkspaceConnectionState } from "../../../app/types";
import type { WorkspaceInfo } from "../../../app/lib/desktop";
import {
  createRedrobServerClient,
  normalizeRedrobServerUrl,
  parseRedrobWorkspaceIdFromUrl,
  type RedrobServerClient,
} from "../../../app/lib/redrob-server";
import { redactTokenLikeText } from "../../../app/utils";
import { t } from "../../../i18n";

export type RemoteWorkspaceConnectionTarget = {
  kind: "redrob";
  baseUrl: string;
  endpointLabel: string;
  token: string;
  workspaceId: string | null;
};

type TargetResult =
  | { ok: true; target: RemoteWorkspaceConnectionTarget }
  | { ok: false; state: WorkspaceConnectionState };

export type RemoteWorkspaceConnectionResult = {
  ok: boolean;
  state: WorkspaceConnectionState;
  target?: RemoteWorkspaceConnectionTarget;
};

type TestOptions = {
  now?: () => number;
  createClient?: (target: RemoteWorkspaceConnectionTarget) => Pick<
    RedrobServerClient,
    "health" | "capabilities" | "status" | "listWorkspaces"
  > | Promise<Pick<RedrobServerClient, "health" | "capabilities" | "status" | "listWorkspaces">>;
};

function trim(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function fail(message: string, checkedAt = Date.now()): RemoteWorkspaceConnectionResult {
  return {
    ok: false,
    state: {
      status: "error",
      message,
      checkedAt,
    },
  };
}

function endpointLabel(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.host}${path && path !== "/" ? path : ""}`;
  } catch {
    return baseUrl;
  }
}

function stripRedrobWorkspaceMount(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const workspaceIndex = segments.indexOf("workspace");
    const legacyIndex = segments.indexOf("w");
    const mountIndex = workspaceIndex >= 0 ? workspaceIndex : legacyIndex;
    if (mountIndex >= 0 && segments[mountIndex + 1]) {
      const prefix = segments.slice(0, mountIndex).join("/");
      url.pathname = prefix ? `/${prefix}` : "/";
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    // Fall through to the already-normalized value below.
  }
  return baseUrl.replace(/\/+$/, "");
}

function isValidHttpEndpoint(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.host);
  } catch {
    return false;
  }
}

function describeUnknownError(error: unknown) {
  return redactRemoteDiagnosticText(error instanceof Error ? error.message : String(error || t("app.unknown_error")));
}

function isServerErrorStatus(error: unknown, status: number | number[]) {
  const expected = Array.isArray(status) ? status : [status];
  const actual =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : NaN;
  return expected.includes(actual);
}

function rejectedTokenMessage(target: RemoteWorkspaceConnectionTarget) {
  return remoteSupportMessage(t("workspace.remote_token_rejected", { endpoint: target.endpointLabel }));
}

function remoteSupportMessage(message: string) {
  return `${message} ${t("workspace.remote_upgrade_host_support")}`;
}

export function redactRemoteDiagnosticText(value: string): string {
  return redactTokenLikeText(value);
}

export function getRemoteWorkspaceConnectionKey(workspace: WorkspaceInfo): string {
  return [
    workspace.id,
    workspace.workspaceType,
    workspace.remoteType ?? "",
    trim(workspace.baseUrl),
    trim(workspace.redrobHostUrl),
    trim(workspace.redrobWorkspaceId),
    trim(workspace.redrobToken),
    trim(workspace.redrobClientToken),
    trim(workspace.redrobHostToken),
  ].join("\u001f");
}

function displayWorkspaceName(workspace: unknown) {
  if (!workspace || typeof workspace !== "object") return "";
  const value = workspace as {
    displayName?: string | null;
    redrobWorkspaceName?: string | null;
    name?: string | null;
    id?: string | null;
  };
  return (
    trim(value.displayName) ||
    trim(value.redrobWorkspaceName) ||
    trim(value.name) ||
    trim(value.id)
  );
}

function defaultCreateClient(target: RemoteWorkspaceConnectionTarget) {
  return createRedrobServerClient({
    baseUrl: target.baseUrl,
    token: target.token || undefined,
  });
}

export function resolveRemoteWorkspaceConnectionTarget(workspace: WorkspaceInfo): TargetResult {
  if (workspace.workspaceType !== "remote") {
    return {
      ok: false,
      state: {
        status: "error",
        message: t("workspace.remote_test_only"),
        checkedAt: Date.now(),
      },
    };
  }

  if (workspace.remoteType && workspace.remoteType !== "redrob") {
    return {
      ok: false,
      state: {
        status: "error",
        message: t("workspace.remote_diagnostics_only"),
        checkedAt: Date.now(),
      },
    };
  }

  const rawHostUrl = trim(workspace.redrobHostUrl) || trim(workspace.baseUrl);
  if (!rawHostUrl) {
    return {
      ok: false,
      state: {
        status: "error",
        message: remoteSupportMessage(t("workspace.remote_worker_url_missing")),
        checkedAt: Date.now(),
      },
    };
  }

  const normalizedHostUrl = normalizeRedrobServerUrl(rawHostUrl);
  if (!normalizedHostUrl || !isValidHttpEndpoint(normalizedHostUrl)) {
    return {
      ok: false,
      state: {
        status: "error",
        message: remoteSupportMessage(t("workspace.remote_worker_url_invalid")),
        checkedAt: Date.now(),
      },
    };
  }

  const workspaceId =
    trim(workspace.redrobWorkspaceId) ||
    parseRedrobWorkspaceIdFromUrl(normalizedHostUrl) ||
    parseRedrobWorkspaceIdFromUrl(trim(workspace.baseUrl)) ||
    null;
  const hostBaseUrl = stripRedrobWorkspaceMount(normalizedHostUrl);
  const token =
    trim(workspace.redrobToken) ||
    trim(workspace.redrobClientToken) ||
    trim(workspace.redrobHostToken);

  return {
    ok: true,
    target: {
      kind: "redrob",
      baseUrl: hostBaseUrl,
      endpointLabel: endpointLabel(hostBaseUrl),
      token,
      workspaceId,
    },
  };
}

export async function testRemoteWorkspaceConnection(
  workspace: WorkspaceInfo,
  options: TestOptions = {},
): Promise<RemoteWorkspaceConnectionResult> {
  const checkedAt = options.now?.() ?? Date.now();
  const targetResult = resolveRemoteWorkspaceConnectionTarget(workspace);
  if (!targetResult.ok) {
    return {
      ok: false,
      state: {
        ...targetResult.state,
        checkedAt,
      },
    };
  }

  const { target } = targetResult;
  const client = await (options.createClient?.(target) ?? defaultCreateClient(target));

  try {
    const health = await client.health();
    if (!health?.ok) {
      return fail(
        remoteSupportMessage(t("workspace.remote_health_unhealthy", { endpoint: target.endpointLabel })),
        checkedAt,
      );
    }
  } catch (error) {
    return fail(
      remoteSupportMessage(t("workspace.remote_health_failed", { endpoint: target.endpointLabel, message: describeUnknownError(error) })),
      checkedAt,
    );
  }

  if (!target.token) {
    return fail(
      remoteSupportMessage(t("workspace.remote_token_missing", { endpoint: target.endpointLabel })),
      checkedAt,
    );
  }

  try {
    await client.capabilities();
  } catch (error) {
    if (isServerErrorStatus(error, [401, 403])) {
      return fail(rejectedTokenMessage(target), checkedAt);
    }
    return fail(
      remoteSupportMessage(t("workspace.remote_capabilities_failed", { endpoint: target.endpointLabel, message: describeUnknownError(error) })),
      checkedAt,
    );
  }

  if (target.workspaceId) {
    try {
      const list = await client.listWorkspaces();
      const workspace = list.items.find((item) => item.id === target.workspaceId) ?? null;
      if (!workspace) {
        return fail(
          remoteSupportMessage(t("workspace.remote_workspace_not_found", { workspaceId: target.workspaceId, endpoint: target.endpointLabel })),
          checkedAt,
        );
      }
      const name = displayWorkspaceName(workspace) || target.workspaceId;
      return {
        ok: true,
        target,
        state: {
          status: "connected",
          message: t("workspace.remote_connected", { name }),
          checkedAt,
        },
      };
    } catch (error) {
      if (isServerErrorStatus(error, 403)) {
        return fail(
          remoteSupportMessage(t("workspace.remote_workspace_not_authorized", { workspaceId: target.workspaceId, endpoint: target.endpointLabel })),
          checkedAt,
        );
      }
      return fail(
        remoteSupportMessage(t("workspace.remote_workspace_list_failed", { endpoint: target.endpointLabel, message: describeUnknownError(error) })),
        checkedAt,
      );
    }
  }

  try {
    const list = await client.listWorkspaces();
    const active =
      list.items.find((item) => item.id === list.activeId) ??
      list.items[0] ??
      null;
    const name = displayWorkspaceName(active) || target.endpointLabel;
    return {
      ok: true,
      target,
      state: {
        status: "connected",
        message: t("workspace.remote_connected", { name }),
        checkedAt,
      },
    };
  } catch (error) {
    if (isServerErrorStatus(error, [401, 403])) {
      return fail(rejectedTokenMessage(target), checkedAt);
    }
    return fail(
      remoteSupportMessage(t("workspace.remote_workspace_list_failed", { endpoint: target.endpointLabel, message: describeUnknownError(error) })),
      checkedAt,
    );
  }
}

export async function diagnoseRemoteWorkspaceTaskLoadFailure(
  workspace: WorkspaceInfo,
  taskLoadError: string,
  options: TestOptions = {},
): Promise<WorkspaceConnectionState> {
  const checkedAt = options.now?.() ?? Date.now();
  const fallback = redactRemoteDiagnosticText(trim(taskLoadError) || t("workspace.remote_worker_connection_failed"));

  try {
    const diagnostic = await testRemoteWorkspaceConnection(workspace, options);
    if (diagnostic.ok) {
      return {
        status: "error",
        message: t("workspace.remote_tasks_load_failed", { message: fallback }),
        checkedAt: diagnostic.state.checkedAt ?? checkedAt,
      };
    }

    return {
      status: "error",
      message: diagnostic.state.message?.trim() || fallback,
      checkedAt: diagnostic.state.checkedAt ?? checkedAt,
    };
  } catch (error) {
    return {
      status: "error",
      message: fallback || describeUnknownError(error),
      checkedAt,
    };
  }
}
