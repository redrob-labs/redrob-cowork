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
  isRedrobOnlyProviderId,
} from "@/react-app/domains/settings/redrob-provider";

// A multi-provider engine response mirroring what OpenCode returns before any
// app-layer filtering: several providers, one of which is Redrob.
const multiProviderList = (): ProviderListResponse => ({
  all: [
    { id: "openai", name: "OpenAI", env: ["OPENAI_API_KEY"], models: {} },
    { id: "anthropic", name: "Anthropic", env: ["ANTHROPIC_API_KEY"], models: {} },
    { id: "opencode", name: "OpenCode Zen", env: [], models: {} },
    { id: REDROB_PROVIDER_ID, name: "Redrob", env: ["REDROB_API_KEY"], models: {} },
  ],
  connected: ["openai", "opencode", REDROB_PROVIDER_ID],
  default: {
    openai: "gpt-4o",
    opencode: "big-pickle",
    [REDROB_PROVIDER_ID]: REDROB_MODEL_ID,
  },
}) as unknown as ProviderListResponse;

describe("Redrob-only provider allowlist", () => {
  test("isRedrobOnlyProviderId accepts only the Redrob id", () => {
    expect(isRedrobOnlyProviderId(REDROB_PROVIDER_ID)).toBe(true);
    expect(isRedrobOnlyProviderId(" Redrob ")).toBe(true);
    expect(isRedrobOnlyProviderId("openai")).toBe(false);
    expect(isRedrobOnlyProviderId("anthropic")).toBe(false);
    expect(isRedrobOnlyProviderId("opencode")).toBe(false);
    expect(isRedrobOnlyProviderId("")).toBe(false);
  });

  test("filterProviderList keeps only Redrob from a multi-provider list", () => {
    const filtered = filterProviderList(multiProviderList(), []);
    expect(filtered.all.map((provider) => provider.id)).toEqual([REDROB_PROVIDER_ID]);
    expect(filtered.connected).toEqual([REDROB_PROVIDER_ID]);
    expect(Object.keys(filtered.default)).toEqual([REDROB_PROVIDER_ID]);
    expect(filtered.default[REDROB_PROVIDER_ID]).toBe(REDROB_MODEL_ID);
  });

  test("filterProviderList still honors disabledProviders on top of the allowlist", () => {
    const filtered = filterProviderList(multiProviderList(), [REDROB_PROVIDER_ID]);
    expect(filtered.all).toEqual([]);
    expect(filtered.connected).toEqual([]);
    expect(Object.keys(filtered.default)).toEqual([]);
  });

  test("DEFAULT_MODEL resolves to the Redrob provider and model", () => {
    expect(DEFAULT_MODEL.providerID).toBe(REDROB_PROVIDER_ID);
    expect(DEFAULT_MODEL.modelID).toBe(REDROB_MODEL_ID);
  });
});
