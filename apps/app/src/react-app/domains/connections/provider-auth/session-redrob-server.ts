// Session-route adapter for the provider-auth store's `redrobServer` slice.
//
// The settings route feeds the store the full redrob-server store, whose
// snapshot carries the server's real capabilities (including `providerSync`)
// and host-token auth. The session route used to fabricate a snapshot with
// hard-coded `{ config }` capabilities and no auth at all, so on the app's
// default surface `serverHandlesProviderSync()` was permanently false:
// PUT /den-session never fired after sign-in, the local server never learned
// the Den session, and server-side cloud provider sync never started (#3671).
//
// This adapter reports the truth for the endpoint it wraps:
// - local endpoints (the desktop's own Redrob Work server) advertise
//   `providerSync: true` — every Redrob Work server does
//   (apps/server/src/types.ts `Capabilities.providerSync: true`) — and carry
//   the live host token so the store can PUT /den-session and
//   POST /cloud-provider-sync/run;
// - remote workspaces keep the previous conservative shape (config only): a
//   desktop must not push its Den session to a shared remote worker.
import {
  createRedrobServerClient,
  isLoopbackRedrobServerUrl,
  readRedrobServerSettings,
  type RedrobServerClient,
} from "@/app/lib/redrob-server";
import type { ResolvedWorkspaceEndpoint } from "@/app/lib/workspace-endpoint";
import type { ProviderAuthRedrobServer } from "./store";

type SessionRedrobServerSnapshot = ReturnType<ProviderAuthRedrobServer["getSnapshot"]>;

export type CreateSessionRedrobServerInput = {
  endpoint: () => ResolvedWorkspaceEndpoint | null;
  /** Live host token from the desktop runtime (redrobServerInfo). */
  hostToken?: () => string;
};

function resolveHostToken(endpoint: ResolvedWorkspaceEndpoint, live: string): string {
  if (live) return live;
  // Fallback mirrors redrob-server-store's getAuth(): persisted settings may
  // hold the host token (ensureDesktopLocalRedrobConnection writes it), but
  // only trust it for loopback servers — host tokens never travel off-machine.
  if (!isLoopbackRedrobServerUrl(endpoint.baseUrl)) return "";
  return readRedrobServerSettings().hostToken?.trim() ?? "";
}

export function createSessionRedrobServer(
  input: CreateSessionRedrobServerInput,
): ProviderAuthRedrobServer {
  let clientCacheKey = "";
  let clientCacheValue: RedrobServerClient | null = null;

  const hostAwareClient = (endpoint: ResolvedWorkspaceEndpoint, hostToken: string): RedrobServerClient => {
    if (!hostToken) return endpoint.client;
    const key = `${endpoint.baseUrl}\u001f${endpoint.token}\u001f${hostToken}`;
    if (key !== clientCacheKey || !clientCacheValue) {
      clientCacheKey = key;
      clientCacheValue = createRedrobServerClient({
        baseUrl: endpoint.baseUrl,
        token: endpoint.token || undefined,
        hostToken,
      });
    }
    return clientCacheValue;
  };

  return {
    getSnapshot: (): SessionRedrobServerSnapshot => {
      const endpoint = input.endpoint();
      if (!endpoint) {
        return {
          redrobServerStatus: "disconnected",
          redrobServerClient: null,
          redrobServerCapabilities: null,
        };
      }
      if (endpoint.isRemote) {
        return {
          redrobServerStatus: "connected",
          redrobServerClient: endpoint.client,
          redrobServerCapabilities: { config: { read: true, write: true } },
        };
      }
      const hostToken = resolveHostToken(endpoint, input.hostToken?.().trim() ?? "");
      return {
        redrobServerStatus: "connected",
        redrobServerClient: hostAwareClient(endpoint, hostToken),
        redrobServerAuth: {
          token: endpoint.token || undefined,
          hostToken: hostToken || undefined,
        },
        redrobServerCapabilities: {
          config: { read: true, write: true },
          providerSync: true,
        },
      };
    },
  };
}
