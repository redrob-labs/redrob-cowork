declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
};

import type { ProviderListResponse } from "@opencode-ai/sdk/v2/client";

import { filterProviderList } from "./providers";
import { DEFAULT_MODEL } from "../constants";
import {
  REDROB_MODEL_ID,
  REDROB_PROVIDER_ID,
  isProviderExposed,
  isRedrobOnlyProviderId,
} from "@/react-app/domains/settings/redrob-provider";

/**
 * A multi-provider engine response mirroring what OpenCode returns before any
 * app-layer filtering. The shapes are chosen to cover each branch of the
 * exposure rule: one secret (openai, anthropic), no secret (opencode), the
 * engine-owned provider (redrob), and multi-field configuration the connect
 * modal has no form for (amazon-bedrock, azure).
 */
const multiProviderList = (): ProviderListResponse => ({
  all: [
    { id: "openai", name: "OpenAI", env: ["OPENAI_API_KEY"], models: {} },
    { id: "anthropic", name: "Anthropic", env: ["ANTHROPIC_API_KEY"], models: {} },
    { id: "opencode", name: "OpenCode", env: [], models: {} },
    { id: REDROB_PROVIDER_ID, name: "Redrob", env: ["REDROB_API_KEY"], models: {} },
    {
      id: "amazon-bedrock",
      name: "Amazon Bedrock",
      env: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
      models: {},
    },
    { id: "azure", name: "Azure", env: ["AZURE_RESOURCE_NAME", "AZURE_API_KEY"], models: {} },
  ],
  connected: ["openai", "opencode", REDROB_PROVIDER_ID],
  default: {
    openai: "gpt-4o",
    opencode: "big-pickle",
    [REDROB_PROVIDER_ID]: REDROB_MODEL_ID,
  },
}) as unknown as ProviderListResponse;

describe("provider exposure", () => {
  test("isRedrobOnlyProviderId still identifies just the Redrob provider", () => {
    // It no longer decides what is offered -- it answers "is this Redrob", which
    // is what the price catalogue lookup needs.
    expect(isRedrobOnlyProviderId(REDROB_PROVIDER_ID)).toBe(true);
    expect(isRedrobOnlyProviderId(" Redrob ")).toBe(true);
    expect(isRedrobOnlyProviderId("openai")).toBe(false);
    expect(isRedrobOnlyProviderId("")).toBe(false);
  });

  test("a provider is exposed when this app can actually complete its credential", () => {
    // Redrob: engine-owned, always.
    expect(isProviderExposed({ id: REDROB_PROVIDER_ID, env: ["REDROB_API_KEY"] })).toBe(true);
    // One secret: the API-key field is exactly that form.
    expect(isProviderExposed({ id: "openai", env: ["OPENAI_API_KEY"] })).toBe(true);
    // No secret: a local runtime the engine finds by itself.
    expect(isProviderExposed({ id: "ollama", env: [] })).toBe(true);
    // A key PLUS an optional override is still one secret. Counting raw variables here is what
    // hid Anthropic, OpenAI and OpenRouter from the connect list while leaving single-variable
    // vendors visible: a base URL is configuration, not a second credential.
    expect(isProviderExposed({ id: "openai", env: ["OPENAI_API_KEY", "OPENAI_BASE_URL"] })).toBe(true);
    expect(
      isProviderExposed({ id: "azure", env: ["AZURE_RESOURCE_NAME", "AZURE_API_KEY"] }),
    ).toBe(true);
    // Two actual secrets still dead-end in a modal with one field.
    expect(
      isProviderExposed({
        id: "amazon-bedrock",
        env: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
      }),
    ).toBe(false);
    // ...unless OAuth carries it, which does not use the key field at all.
    expect(
      isProviderExposed({
        id: "amazon-bedrock",
        env: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
        hasOAuth: true,
      }),
    ).toBe(true);
    // ...or it is already connected, in which case something completed it and
    // hiding a working provider would be a regression.
    expect(
      isProviderExposed({
        id: "amazon-bedrock",
        env: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
        connected: true,
      }),
    ).toBe(true);
    expect(isProviderExposed({ id: "   " })).toBe(false);
  });

  test("filterProviderList offers every completable provider and drops the rest", () => {
    const filtered = filterProviderList(multiProviderList(), []);
    // Azure joins the list: a resource name is configuration, so it needs one secret.
    // Bedrock stays out: two secrets, and the modal collects one.
    expect(filtered.all.map((provider) => provider.id)).toEqual([
      "openai",
      "anthropic",
      "opencode",
      REDROB_PROVIDER_ID,
      "azure",
    ]);
    expect(filtered.connected).toEqual(["openai", "opencode", REDROB_PROVIDER_ID]);
    expect(Object.keys(filtered.default)).toEqual(["openai", "opencode", REDROB_PROVIDER_ID]);
    expect(filtered.default[REDROB_PROVIDER_ID]).toBe(REDROB_MODEL_ID);
  });

  test("filterProviderList exposes an OAuth-only provider, which it never used to", () => {
    // hasOAuth was part of the rule from the start and was never supplied by the filter, so a
    // provider reachable only by OAuth was judged on its env vars and silently withheld.
    const list = multiProviderList();
    const idsWithout = filterProviderList(list, []).all.map((provider) => provider.id);
    expect(idsWithout.includes("amazon-bedrock")).toBe(false);
    const idsWith = filterProviderList(list, [], {
      "amazon-bedrock": [{ type: "oauth" }],
    }).all.map((provider) => provider.id);
    expect(idsWith.includes("amazon-bedrock")).toBe(true);
  });

  test("filterProviderList still honors disabledProviders", () => {
    const filtered = filterProviderList(multiProviderList(), [REDROB_PROVIDER_ID, "openai"]);
    expect(filtered.all.map((provider) => provider.id)).toEqual(["anthropic", "opencode", "azure"]);
    expect(filtered.connected).toEqual(["opencode"]);
    expect(Object.keys(filtered.default)).toEqual(["opencode"]);
  });

  test("a connected provider absent from the catalogue is still kept", () => {
    // The engine resolved it somehow -- a local runtime, an env credential --
    // and the app has no catalogue entry to reason about. Dropping it would take
    // away a provider that works.
    const list = multiProviderList();
    const withGhost = {
      ...list,
      connected: [...list.connected, "mystery-runtime"],
    } as unknown as ProviderListResponse;
    expect(filterProviderList(withGhost, []).connected).toEqual([
      "openai",
      "opencode",
      REDROB_PROVIDER_ID,
      "mystery-runtime",
    ]);
  });

  test("DEFAULT_MODEL resolves to the Redrob provider and model", () => {
    expect(DEFAULT_MODEL.providerID).toBe(REDROB_PROVIDER_ID);
    expect(DEFAULT_MODEL.modelID).toBe(REDROB_MODEL_ID);
  });
});
