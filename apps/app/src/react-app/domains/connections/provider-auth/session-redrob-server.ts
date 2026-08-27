// Session-route adapter for the provider-auth store's `redrobServer` slice.
//
// The settings route feeds the store the full redrob-server store; the session
// route only has a resolved workspace endpoint, so this adapter presents that
// endpoint in the same shape.
//
// It used to also carry the local server's host token and advertise a
// `providerSync` capability, because the store pushed the control-plane session
// to the local server and asked it to sync organization-managed providers. That
// path is gone, so the adapter reports config capabilities only.
import type { ResolvedWorkspaceEndpoint } from "@/app/lib/workspace-endpoint";
import type { ProviderAuthRedrobServer } from "./store";

type SessionRedrobServerSnapshot = ReturnType<ProviderAuthRedrobServer["getSnapshot"]>;

export type CreateSessionRedrobServerInput = {
  endpoint: () => ResolvedWorkspaceEndpoint | null;
};

export function createSessionRedrobServer(
  input: CreateSessionRedrobServerInput,
): ProviderAuthRedrobServer {
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
      return {
        redrobServerStatus: "connected",
        redrobServerClient: endpoint.client,
        redrobServerCapabilities: { config: { read: true, write: true } },
      };
    },
  };
}
