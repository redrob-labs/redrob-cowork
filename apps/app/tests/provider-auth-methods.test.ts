import { afterEach, describe, expect, test } from "bun:test";

import { createClient } from "../src/app/lib/opencode";
import type { ProviderListItem, WorkspaceDisplay } from "../src/app/types";
import { createProviderAuthStore } from "../src/react-app/domains/connections/provider-auth/store";
import {
  REDROB_API_KEY_ENV,
  REDROB_PROVIDER_ID,
  REDROB_PROVIDER_NAME,
} from "../src/react-app/domains/settings/redrob-provider";

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const opencodeClient = createClient("https://engine.example", "/tmp/workspace_test");

function installWindow(options: {
  origin: string;
  electronInfo?: {
    baseUrl: string;
    ownerToken: string;
  };
}) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
      location: { origin: options.origin },
      __REDROB_ELECTRON__: options.electronInfo
        ? {
            invokeDesktop: async () => ({
              running: true,
              baseUrl: options.electronInfo?.baseUrl,
              ownerToken: options.electronInfo?.ownerToken,
            }),
          }
        : undefined,
    },
  });
}

// The engine advertises OAuth for OpenAI and Redrob's API-key method. The
// Redrob-only allowlist must strip OpenAI entirely and leave Redrob with an
// API-key entry so a fresh user can paste REDROB_API_KEY.
function installProviderAuthFetch() {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () =>
      new Response(
        JSON.stringify({
          openai: [
            { type: "oauth", label: "Sign in with ChatGPT" },
            { type: "oauth", label: "Headless device flow" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
}

function createTestStore(workerType: "local" | "remote") {
  // Redrob is the only allowlisted provider; OpenAI is present in the engine
  // list to prove the allowlist drops it from the connect surface.
  const providers: ProviderListItem[] = [
    {
      id: "openai",
      name: "OpenAI",
      env: ["OPENAI_API_KEY"],
      source: "env",
      models: {},
    },
    {
      id: REDROB_PROVIDER_ID,
      name: REDROB_PROVIDER_NAME,
      env: [REDROB_API_KEY_ENV],
      source: "env",
      models: {},
    },
  ];
  const workspace = {
    id: "workspace_test",
    name: "Test workspace",
    path: "/tmp/workspace_test",
    preset: "default",
    workspaceType: workerType,
  } satisfies WorkspaceDisplay;

  return createProviderAuthStore({
    client: () => opencodeClient,
    providers: () => providers,
    providerDefaults: () => ({}),
    providerConnectedIds: () => [],
    disabledProviders: () => [],
    checkDesktopAppRestriction: () => false,
    selectedWorkspaceDisplay: () => workspace,
    providerBaseUrl: () => "https://engine.example",
    selectedWorkspaceRoot: () => workspace.path,
    runtimeWorkspaceId: () => workspace.id,
    openworkServer: {
      getSnapshot: () => ({
        openworkServerStatus: "disconnected",
        openworkServerClient: null,
        openworkServerCapabilities: null,
      }),
    },
    setProviders: () => undefined,
    setProviderDefaults: () => undefined,
    setProviderConnectedIds: () => undefined,
    setDisabledProviders: () => undefined,
    markOpencodeConfigReloadRequired: () => undefined,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });
});

describe("Redrob-only provider auth methods", () => {
  test("desktop local workers offer only the Redrob API key and drop OpenAI", async () => {
    installWindow({
      origin: "http://localhost:3000",
      electronInfo: { baseUrl: "http://localhost:8787", ownerToken: "owner-token" },
    });
    installProviderAuthFetch();
    const store = createTestStore("local");

    await store.openProviderAuthModal();

    const methods = store.getSnapshot().providerAuthMethods;
    expect(methods[REDROB_PROVIDER_ID]).toEqual([
      { type: "api", label: "API key" },
    ]);
    expect(methods.openai).toBeUndefined();
    expect(Object.keys(methods)).toEqual([REDROB_PROVIDER_ID]);
  });

  test("desktop remote workers still expose only the Redrob API key", async () => {
    installWindow({
      origin: "http://localhost:3000",
      electronInfo: { baseUrl: "http://localhost:8787", ownerToken: "owner-token" },
    });
    installProviderAuthFetch();
    const store = createTestStore("remote");

    await store.openProviderAuthModal();

    const methods = store.getSnapshot().providerAuthMethods;
    expect(methods[REDROB_PROVIDER_ID]).toEqual([
      { type: "api", label: "API key" },
    ]);
    expect(methods.openai).toBeUndefined();
  });

  test("browser workers offer the Redrob API key without OAuth", async () => {
    installWindow({ origin: "https://self-hosted.example" });
    installProviderAuthFetch();
    const store = createTestStore("local");

    await store.openProviderAuthModal();

    const methods = store.getSnapshot().providerAuthMethods;
    expect(methods[REDROB_PROVIDER_ID]).toEqual([
      { type: "api", label: "API key" },
    ]);
    expect(methods.openai).toBeUndefined();
  });
});
