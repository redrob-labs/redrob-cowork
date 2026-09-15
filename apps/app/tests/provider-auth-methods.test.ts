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
  // Four shapes, one per branch of the exposure rule: OpenAI declares a single
  // secret and offers OAuth, Redrob is the engine-owned provider, OpenCode needs
  // no secret at all, and Bedrock declares three environment variables because
  // one field cannot configure it -- which is exactly the case the connect modal
  // has no form for.
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
    {
      id: "opencode",
      name: "OpenCode",
      env: [],
      source: "env",
      models: {},
    },
    {
      id: "amazon-bedrock",
      name: "Amazon Bedrock",
      env: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
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
    redrobServer: {
      getSnapshot: () => ({
        redrobServerStatus: "disconnected",
        redrobServerClient: null,
        redrobServerCapabilities: null,
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

describe("provider auth methods follow what this app can complete", () => {
  test("desktop local workers offer Redrob, OpenAI and OpenCode, and drop Bedrock", async () => {
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
    // A single declared secret is a form this app has, so OpenAI is offered --
    // with the browser sign-in flow a desktop worker can actually complete, and
    // the headless device flow filtered out.
    expect(methods.openai?.some((method) => method.type === "api")).toBe(true);
    expect(methods.openai?.some((method) => method.label === "Sign in with ChatGPT")).toBe(true);
    expect(methods.openai?.some((method) => method.label === "Headless device flow")).toBe(false);
    // Bedrock needs three values and the modal collects one, so offering it
    // would advertise a connection the user cannot finish.
    expect(methods["amazon-bedrock"]).toBeUndefined();
  });

  test("desktop remote workers get the headless OpenAI flow instead", async () => {
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
    expect(methods.openai?.some((method) => method.label === "Headless device flow")).toBe(true);
    expect(methods.openai?.some((method) => method.label === "Sign in with ChatGPT")).toBe(false);
    expect(methods["amazon-bedrock"]).toBeUndefined();
  });

  test("browser workers keep the API keys and lose every OpenAI OAuth flow", async () => {
    installWindow({ origin: "https://self-hosted.example" });
    installProviderAuthFetch();
    const store = createTestStore("local");

    await store.openProviderAuthModal();

    const methods = store.getSnapshot().providerAuthMethods;
    expect(methods[REDROB_PROVIDER_ID]).toEqual([
      { type: "api", label: "API key" },
    ]);
    // Off-desktop neither ChatGPT sign-in flow can complete, so only the key is
    // left -- but the provider itself stays offered.
    expect(methods.openai).toEqual([{ type: "api", label: "API key" }]);
    expect(methods["amazon-bedrock"]).toBeUndefined();
  });
});
