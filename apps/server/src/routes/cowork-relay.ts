import { ApiError } from "../errors.js";
import { isEndpointId } from "../cowork-invites.js";
import { teamPolicyConsoleBaseUrl } from "../team-policy/sync.js";
import { externalFetch } from "../server-fetch.js";
import { isRecord } from "../workspace-kv-store.js";
import { addRoute, type Route } from "./registry.js";

type JsonResponse = (data: unknown, status?: number) => Response;
type ReadJsonBody = (request: Request) => Promise<Record<string, unknown>>;

export type RelayGrant = { endpointId: string; expiresAt: string; relays: string[] };

export interface RegisterCoworkRelayRoutesOptions {
  routes: Route[];
  jsonResponse: JsonResponse;
  readJsonBody: ReadJsonBody;
  /** The Redrob Key, read from the engine when needed. Null when the device is not connected. */
  readKey: () => Promise<string | null>;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  consoleBaseUrl?: () => string;
}

function readGrant(value: unknown, endpointId: string): RelayGrant | null {
  if (!isRecord(value)) return null;
  const { endpointId: id, expiresAt, relays } = value;
  if (id !== endpointId || typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)) || !Array.isArray(relays)) return null;
  // Only https relays, whatever the console says: the app dials these with its device identity.
  const urls = relays.filter((url): url is string => typeof url === "string" && /^https:\/\/[^\s/]+\/?$/.test(url));
  return { endpointId, expiresAt, relays: urls };
}

/**
 * `POST /cowork/relay-grant`: asks the console to let this device's co-working endpoint use
 * Redrob's relays for a while, with the device's Redrob Key. Host-only, and the key never leaves
 * this server: the desktop bridge only learns the grant.
 */
export function registerCoworkRelayRoutes(options: RegisterCoworkRelayRoutesOptions): void {
  const { routes, jsonResponse, readJsonBody, readKey } = options;
  const fetchImpl = options.fetchImpl ?? externalFetch;
  const baseUrl = options.consoleBaseUrl ?? (() => teamPolicyConsoleBaseUrl());

  addRoute(routes, "POST", "/cowork/relay-grant", "host", async (ctx) => {
    const body = await readJsonBody(ctx.request);
    const endpointId = typeof body.endpointId === "string" ? body.endpointId.trim().toLowerCase() : "";
    if (!isEndpointId(endpointId)) throw new ApiError(400, "invalid_payload", "endpointId must be 64 hex characters");
    const key = await readKey();
    if (!key) throw new ApiError(409, "redrob_key_missing", "Connect a Redrob Key to co-work over the internet");
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl()}/relay/grants`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ endpointId }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ApiError(502, "relay_grant_unreachable", "Could not reach the Redrob console");
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(409, "redrob_key_rejected", "The console did not accept this device's Redrob Key");
    }
    if (!response.ok) throw new ApiError(502, "relay_grant_failed", `The console answered ${response.status}`);
    const grant = readGrant(await response.json().catch(() => null), endpointId);
    if (!grant) throw new ApiError(502, "relay_grant_failed", "The console's answer was not a relay grant");
    return jsonResponse(grant);
  });
}
