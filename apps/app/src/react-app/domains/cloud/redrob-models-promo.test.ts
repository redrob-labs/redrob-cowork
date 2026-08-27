declare const afterEach: (fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import { DEFAULT_DEN_BASE_URL, HOSTED_DEFAULT_DEN_BASE_URL, setDenBootstrapConfig } from "../../../app/lib/den";
import {
  hasRedrobWorkModelsAvailable,
  isRedrobWorkModelsPromoEligible,
  isRedrobWorkModelsPromoEligibleForDenBaseUrl,
  shouldShowRedrobWorkModelsPromo,
  shouldShowRedrobWorkModelsSyncing,
  wasRedrobWorkModelsStartupPromoShown,
} from "./redrob-models-promo";

afterEach(async () => {
  await setDenBootstrapConfig({ baseUrl: DEFAULT_DEN_BASE_URL, requireSignin: false });
});

describe("Redrob Models promo eligibility", () => {
  test("allows promotions on the default Den URL after normalization", () => {
    expect(isRedrobWorkModelsPromoEligibleForDenBaseUrl(`${HOSTED_DEFAULT_DEN_BASE_URL}/api/den/`)).toBe(true);
  });

  test("suppresses promotions for custom configured Den URLs", async () => {
    await setDenBootstrapConfig({ baseUrl: "https://custom-den.example.com", requireSignin: false });

    expect(isRedrobWorkModelsPromoEligible()).toBe(false);
    expect(shouldShowRedrobWorkModelsPromo()).toBe(false);
    expect(wasRedrobWorkModelsStartupPromoShown()).toBe(true);
  });
});

describe("hasRedrobWorkModelsAvailable", () => {
  test("requires a connected redrob provider with at least one model", () => {
    expect(
      hasRedrobWorkModelsAvailable({
        providerConnectedIds: ["redrob"],
        providers: [{ id: "redrob", models: {} }],
      }),
    ).toBe(false);
    expect(
      hasRedrobWorkModelsAvailable({
        providerConnectedIds: ["redrob"],
        providers: [{ id: "redrob", models: { "gpt-5": {} } }],
      }),
    ).toBe(true);
  });
});

describe("shouldShowRedrobWorkModelsSyncing", () => {
  test("only reports a real pending workspace reload", () => {
    expect(shouldShowRedrobWorkModelsSyncing({
      entitled: true,
      available: false,
      workspaceReady: false,
      reloadPending: true,
    })).toBe(false);
    expect(shouldShowRedrobWorkModelsSyncing({
      entitled: true,
      available: false,
      workspaceReady: true,
      reloadPending: false,
    })).toBe(false);
    expect(shouldShowRedrobWorkModelsSyncing({
      entitled: true,
      available: false,
      workspaceReady: true,
      reloadPending: true,
    })).toBe(true);
  });
});
