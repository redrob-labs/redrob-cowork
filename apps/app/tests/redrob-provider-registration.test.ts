import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createOpenworkServerClient } from "../src/app/lib/openwork-server";
import { createClient } from "../src/app/lib/opencode";
import type { ResolvedWorkspaceEndpoint } from "../src/app/lib/workspace-endpoint";
import type { ProviderListItem, WorkspaceDisplay } from "../src/app/types";
import { createSessionOpenworkServer } from "../src/react-app/domains/connections/provider-auth/session-openwork-server";
import { createProviderAuthStore } from "../src/react-app/domains/connections/provider-auth/store";
import {
  REDROB_BASE_URL,
  REDROB_MODEL_ID,
  REDROB_PROVIDER_ID,
  buildRedrobProviderConfig,
} from "../src/react-app/domains/settings/redrob-provider";

/**
 * Regression test for the review's blocking issue: `buildRedrobProviderConfig()`
 * had no production caller, so nothing seeded the `redrob` provider into the
 * engine config. With the Redrob-only allowlist stripping every other
 * provider, a fresh user could open an empty connect modal.
 *
 * This drives the real store's `openProviderAuthModal()` through a local
 * OpenWork server endpoint and asserts it PATCHes the workspace config with
 * exactly `buildRedrobProviderConfig()` (base URL + `redrob-ai` model + the
 * indicAssist/detectLanguage extras). It exercises the real builder, so the
 * test fails if the wiring is removed.
 */

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const originalConsoleInfo = console.info;
const originalDeployment = process.env.VITE_OPENWORK_DEPLOYMENT;

const LOCAL_SERVER_ORIGIN = "http://127.0.0.1:7899";

type RecordedRequest = {
  url: string;
  method: string;
  body: string | null;
};

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function installWindow(): Storage {
  const localStorage = memoryStorage();
  const listeners = new Map<string, Set<EventListener>>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: (type: string, listener: EventListener) => {
        const registered = listeners.get(type) ?? new Set<EventListener>();
        registered.add(listener);
        listeners.set(type, registered);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent: (event: Event) => {
        for (const listener of listeners.get(event.type) ?? []) listener(event);
        return true;
      },
      localStorage,
      location: { origin: "https://self-hosted.example" },
      __OPENWORK_GATEWAY__: undefined,
    },
  });
  return localStorage;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (input instanceof URL) return input.toString();
  if (typeof input === "string") return input;
  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (input instanceof Request) return input.method;
  return "GET";
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetchMock(requests: RecordedRequest[]) {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(getRequestUrl(input));
      const method = getRequestMethod(input, init);
      requests.push({
        url: url.toString(),
        method,
        body: typeof init?.body === "string" ? init.body : null,
      });

      if (url.pathname === "/workspace/ws_1/config" && method === "PATCH") {
        return jsonResponse({ updatedAt: 1 });
      }
      if (url.pathname === "/workspace/ws_1/config" && method === "GET") {
        return jsonResponse({ opencode: {}, openwork: {} });
      }
      if (url.pathname === "/workspace/ws_1/engine/reload") {
        return jsonResponse({ ok: true, reloadedAt: 1 });
      }
      if (url.pathname === "/global/health") {
        return jsonResponse({ healthy: true, version: "1.17.11" });
      }
      // Engine provider/auth reads (opencode client).
      if (url.pathname.endsWith("/provider")) {
        return jsonResponse({ all: [], connected: [], default: {} });
      }
      if (url.pathname.endsWith("/config")) {
        return jsonResponse({ disabled_providers: [] });
      }
      if (url.pathname.includes("/provider/") || url.pathname.endsWith("/auth")) {
        return jsonResponse({});
      }
      return jsonResponse({});
    },
  });
}

function makeEndpoint(): ResolvedWorkspaceEndpoint {
  const client = createOpenworkServerClient({ baseUrl: LOCAL_SERVER_ORIGIN, token: "client-token" });
  const mountedBaseUrl = `${LOCAL_SERVER_ORIGIN}/workspace/ws_1`;
  return {
    baseUrl: LOCAL_SERVER_ORIGIN,
    token: "client-token",
    workspaceId: "ws_1",
    isRemote: false,
    client,
    mountedBaseUrl,
    opencodeBaseUrl: `${mountedBaseUrl}/opencode`,
  };
}

function createStore(providers: ProviderListItem[]) {
  const opencodeClient = createClient("https://engine.example", "/tmp/workspace_test", {
    token: "engine-token",
    mode: "openwork",
  });
  const workspace = {
    id: "workspace_test",
    name: "Test workspace",
    path: "/tmp/workspace_test",
    preset: "default",
    workspaceType: "local",
  } satisfies WorkspaceDisplay;
  let providerList = providers;
  let disabledProviders: string[] = [];

  return createProviderAuthStore({
    client: () => opencodeClient,
    providers: () => providerList,
    providerDefaults: () => ({}),
    providerConnectedIds: () => [],
    disabledProviders: () => disabledProviders,
    checkDesktopAppRestriction: () => false,
    selectedWorkspaceDisplay: () => workspace,
    providerBaseUrl: () => "https://engine.example",
    selectedWorkspaceRoot: () => "/tmp/workspace_test",
    runtimeWorkspaceId: () => "ws_1",
    openworkServer: createSessionOpenworkServer({
      endpoint: () => makeEndpoint(),
      hostToken: () => "host-token-live",
    }),
    setProviders: (value) => {
      providerList = value;
    },
    setProviderDefaults: () => undefined,
    setProviderConnectedIds: () => undefined,
    setDisabledProviders: (value) => {
      disabledProviders = value;
    },
    markOpencodeConfigReloadRequired: () => undefined,
  });
}

describe("Redrob provider registration", () => {
  beforeEach(() => {
    process.env.VITE_OPENWORK_DEPLOYMENT = "web";
    console.info = () => undefined;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });
    console.info = originalConsoleInfo;
    if (originalDeployment === undefined) delete process.env.VITE_OPENWORK_DEPLOYMENT;
    else process.env.VITE_OPENWORK_DEPLOYMENT = originalDeployment;
  });

  test("opening the connect modal seeds buildRedrobProviderConfig() into the engine config", async () => {
    installWindow();
    const requests: RecordedRequest[] = [];
    installFetchMock(requests);
    const store = createStore([]);

    await store.openProviderAuthModal().catch(() => undefined);

    const configPatches = requests.filter(
      (request) => request.method === "PATCH" && new URL(request.url).pathname === "/workspace/ws_1/config",
    );
    expect(configPatches).toHaveLength(1);

    const payload = JSON.parse(configPatches[0]?.body ?? "{}") as {
      opencode?: { provider?: Record<string, unknown> };
    };
    const seeded = payload.opencode?.provider?.[REDROB_PROVIDER_ID];
    // The seeded entry must equal the real builder output (base URL, model, extras).
    expect(seeded).toEqual(buildRedrobProviderConfig());
    const seededConfig = seeded as ReturnType<typeof buildRedrobProviderConfig>;
    expect(seededConfig.options?.baseURL).toBe(REDROB_BASE_URL);
    expect(seededConfig.models?.[REDROB_MODEL_ID]?.options?.indicAssist).toBe(true);
    expect(seededConfig.models?.[REDROB_MODEL_ID]?.options?.detectLanguage).toBe(true);

    store.dispose();
  });

  test("does not re-seed when Redrob is already registered in the engine list", async () => {
    installWindow();
    const requests: RecordedRequest[] = [];
    installFetchMock(requests);
    const store = createStore([
      {
        id: REDROB_PROVIDER_ID,
        name: "Redrob",
        env: ["REDROB_API_KEY"],
        source: "env",
        models: {},
      },
    ]);

    await store.openProviderAuthModal().catch(() => undefined);

    const configPatches = requests.filter(
      (request) => request.method === "PATCH" && new URL(request.url).pathname === "/workspace/ws_1/config",
    );
    expect(configPatches).toHaveLength(0);

    store.dispose();
  });
});
