declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import { resolveModelPickerEmptyState } from "./model-picker-modal";

describe("resolveModelPickerEmptyState", () => {
  test("returns nothing to show while any provider group is present", () => {
    expect(resolveModelPickerEmptyState({ providerGroupCount: 1, query: "" })).toBe(null);
  });

  test("blames the search, not the provider list, when a query filtered everything out", () => {
    const state = resolveModelPickerEmptyState({ providerGroupCount: 0, query: "claude" });

    expect(state?.messageKey).toBe("models.no_models_match_search");
    expect(state?.showConnectProvider).toBe(false);
  });

  test("offers to connect a provider when there are no models and no query", () => {
    const state = resolveModelPickerEmptyState({ providerGroupCount: 0, query: "  " });

    expect(state?.messageKey).toBe("models.no_models_available");
    expect(state?.showConnectProvider).toBe(true);
  });
});
