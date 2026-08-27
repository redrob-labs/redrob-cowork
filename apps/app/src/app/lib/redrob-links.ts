import { normalizeRedrobServerUrl } from "./redrob-server";

export type RemoteWorkspaceDefaults = {
  redrobHostUrl?: string | null;
  redrobToken?: string | null;
  directory?: string | null;
  displayName?: string | null;
  autoConnect?: boolean;
};

function isSupportedDeepLinkProtocol(protocol: string): boolean {
  const normalized = protocol.toLowerCase();
  return normalized === "redrob:"
    || normalized === "redrob-dev:"
    || normalized === "https:"
    || normalized === "http:";
}

export function parseRemoteConnectDeepLink(rawUrl: string): RemoteWorkspaceDefaults | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const protocol = url.protocol.toLowerCase();
  if (!isSupportedDeepLinkProtocol(protocol)) {
    return null;
  }

  const routeHost = url.hostname.toLowerCase();
  const routePath = url.pathname.replace(/^\/+/, "").toLowerCase();
  const routeSegments = routePath.split("/").filter(Boolean);
  const routeTail = routeSegments[routeSegments.length - 1] ?? "";
  if (routeHost !== "connect-remote" && routePath !== "connect-remote" && routeTail !== "connect-remote") {
    return null;
  }

  const hostUrlRaw = url.searchParams.get("redrobHostUrl") ?? url.searchParams.get("redrobUrl") ?? "";
  const tokenRaw = url.searchParams.get("redrobToken") ?? url.searchParams.get("accessToken") ?? "";
  const normalizedHostUrl = normalizeRedrobServerUrl(hostUrlRaw);
  const token = tokenRaw.trim();
  if (!normalizedHostUrl || !token) {
    return null;
  }

  const workerName = url.searchParams.get("workerName")?.trim() ?? "";
  const workerId = url.searchParams.get("workerId")?.trim() ?? "";
  const displayName = workerName || (workerId ? `Worker ${workerId.slice(0, 8)}` : "");
  const autoConnectRaw =
    url.searchParams.get("autoConnect") ??
    url.searchParams.get("bypassModal") ??
    url.searchParams.get("bypassAddWorkerModal") ??
    "";
  const autoConnect = ["1", "true", "yes", "on"].includes(autoConnectRaw.trim().toLowerCase());

  return {
    redrobHostUrl: normalizedHostUrl,
    redrobToken: token,
    directory: null,
    displayName: displayName || null,
    autoConnect,
  };
}

export function stripRemoteConnectQuery(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  let changed = false;
  for (const key of [
    "redrobHostUrl",
    "redrobUrl",
    "redrobToken",
    "accessToken",
    "workerId",
    "workerName",
    "autoConnect",
    "bypassModal",
    "bypassAddWorkerModal",
    "source",
  ]) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  if (!changed) {
    return null;
  }

  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

function normalizeDebugDeepLinkInput(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  const directMatch = trimmed.match(/(?:redrob-dev|redrob|https?):\/\/[^\s"'<>]+/i);
  if (directMatch) return directMatch[0];

  return trimmed;
}

export function parseDebugDeepLinkInput(rawValue: string):
  | { kind: "remote"; link: RemoteWorkspaceDefaults }
  | null {
  const normalized = normalizeDebugDeepLinkInput(rawValue);
  if (!normalized) return null;

  const remoteConnectLink = parseRemoteConnectDeepLink(normalized);
  if (remoteConnectLink) {
    return { kind: "remote", link: remoteConnectLink };
  }

  return null;
}
