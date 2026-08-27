import { describe, expect, test } from "vitest";

import type { ModelOption } from "../src/app/types";
import { mergeModelOptions } from "../src/react-app/domains/connections/provider-auth/assigned-model-options";

function option(providerID: string, modelID: string, title: string): ModelOption {
  return {
    providerID,
    modelID,
    title,
    behaviorTitle: "Reasoning",
    behaviorLabel: "Default",
    behaviorDescription: "",
    behaviorValue: null,
    isFree: false,
    source: "local",
  };
}

describe("mergeModelOptions", () => {
  test("lets the live workspace catalog replace a fallback for the same provider and model", () => {
    const fallback = option("anthropic", "claude-sonnet", "Fallback Sonnet");
    const live = option("anthropic", "claude-sonnet", "Live Sonnet");
    const local = option("openai", "gpt-5", "GPT-5");

    expect(mergeModelOptions([live, local], [fallback])).toEqual([live, local]);
  });

  test("keeps a fallback that the live catalog does not cover", () => {
    const fallback = option("openai", "gpt-5", "GPT-5");
    const live = option("anthropic", "claude-sonnet", "Live Sonnet");

    expect(mergeModelOptions([live], [fallback])).toEqual([fallback, live]);
  });
});
