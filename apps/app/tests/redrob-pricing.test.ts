import { describe, expect, test } from "bun:test";

import {
  formatModelPriceRange,
  formatPriceMultiplier,
  formatTokenCount,
  formatUsdPerMillion,
  parseRedrobPricing,
  REDROB_PRICING_URL,
} from "../src/app/lib/redrob-pricing";

/**
 * Trimmed from a live GET https://console.redrob.ai/api/backend/v1/pricing
 * response, so the parser is tested against the shape the console really sends
 * rather than one inferred from its source.
 */
const LIVE_SAMPLE = {
  autoModelId: "auto",
  inputPricePerMillionUsd: 0.6,
  outputPricePerMillionUsd: 1.8,
  namedModelMarginPercent: 5,
  models: [
    {
      id: "auto",
      inputPricePerMillionUsd: 0.6,
      outputPricePerMillionUsd: 1.8,
      inputMultiplier: 1,
      outputMultiplier: 1,
      capabilities: {
        shortContextTokens: 272000,
        maxContextTokens: 1050000,
        thinkingLevels: ["low", "medium", "high", "xhigh", "max"],
        fastMode: true,
        requiresProviderDataShare: false,
      },
    },
    {
      id: "claude-opus-5",
      inputPricePerMillionUsd: 5,
      outputPricePerMillionUsd: 25,
      inputMultiplier: 8.33,
      outputMultiplier: 13.89,
      capabilities: {
        shortContextTokens: 200000,
        maxContextTokens: 1000000,
        thinkingLevels: ["low", "medium", "high", "xhigh", "max"],
        fastMode: true,
        requiresProviderDataShare: false,
      },
    },
    {
      id: "claude-fable-5",
      inputPricePerMillionUsd: 10,
      outputPricePerMillionUsd: 50,
      inputMultiplier: 16.67,
      outputMultiplier: 27.78,
      capabilities: {
        shortContextTokens: 200000,
        maxContextTokens: 1000000,
        thinkingLevels: ["low", "medium", "high", "xhigh", "max"],
        fastMode: true,
        requiresProviderDataShare: true,
      },
    },
    {
      id: "gpt-5.6-terra",
      inputPricePerMillionUsd: 2,
      outputPricePerMillionUsd: 12,
      inputMultiplier: 3.33,
      outputMultiplier: 6.67,
      longContextInputPricePerMillionUsd: 4,
      longContextOutputPricePerMillionUsd: 18,
      capabilities: {
        shortContextTokens: 272000,
        maxContextTokens: 1000000,
        thinkingLevels: [],
        fastMode: false,
        requiresProviderDataShare: false,
      },
    },
  ],
};

describe("REDROB_PRICING_URL", () => {
  test("hangs off the already-approved console host", () => {
    expect(REDROB_PRICING_URL).toBe("https://console.redrob.ai/api/backend/v1/pricing");
  });
});

describe("parseRedrobPricing", () => {
  test("reads the live response shape", () => {
    const pricing = parseRedrobPricing(LIVE_SAMPLE);

    expect(pricing.autoModelId).toBe("auto");
    expect(Object.keys(pricing.byModelId).sort()).toEqual([
      "auto",
      "claude-fable-5",
      "claude-opus-5",
      "gpt-5.6-terra",
    ]);
    expect(pricing.byModelId["claude-opus-5"]?.inputPricePerMillionUsd).toBe(5);
    expect(pricing.byModelId["claude-opus-5"]?.outputPricePerMillionUsd).toBe(25);
    expect(pricing.byModelId["claude-opus-5"]?.capabilities.maxContextTokens).toBe(1000000);
    expect(pricing.byModelId["claude-fable-5"]?.capabilities.requiresProviderDataShare).toBe(true);
    expect(pricing.byModelId["gpt-5.6-terra"]?.capabilities.thinkingLevels).toEqual([]);
    expect(pricing.byModelId["gpt-5.6-terra"]?.longContextOutputPricePerMillionUsd).toBe(18);
  });

  test("survives every malformed payload instead of throwing", () => {
    expect(parseRedrobPricing(null).byModelId).toEqual({});
    expect(parseRedrobPricing({ models: "nope" }).byModelId).toEqual({});
    expect(parseRedrobPricing({ models: [{ name: "no id" }] }).byModelId).toEqual({});
    expect(
      parseRedrobPricing({ models: [{ id: "x", inputPricePerMillionUsd: "5" }] }).byModelId["x"]
        ?.inputPricePerMillionUsd,
    ).toBe(undefined);
  });
});

describe("formatters", () => {
  test("prints whole dollars without decimals and cents with them", () => {
    expect(formatUsdPerMillion(5)).toBe("$5");
    expect(formatUsdPerMillion(0.6)).toBe("$0.60");
    expect(formatUsdPerMillion(undefined)).toBe(null);
  });

  test("prints input / output together", () => {
    const pricing = parseRedrobPricing(LIVE_SAMPLE);
    expect(formatModelPriceRange(pricing.byModelId["claude-opus-5"])).toBe("$5 / $25");
    expect(formatModelPriceRange(pricing.byModelId["auto"])).toBe("$0.60 / $1.80");
  });

  test("says nothing when only half the price is known", () => {
    expect(
      formatModelPriceRange({
        id: "x",
        inputPricePerMillionUsd: 5,
        capabilities: { thinkingLevels: [] },
      }),
    ).toBe(null);
  });

  test("states the multiplier against Auto, and stays quiet at the baseline", () => {
    const pricing = parseRedrobPricing(LIVE_SAMPLE);
    expect(formatPriceMultiplier(pricing.byModelId["claude-opus-5"])).toBe("13.9x");
    expect(formatPriceMultiplier(pricing.byModelId["auto"])).toBe(null);
    expect(formatPriceMultiplier(undefined)).toBe(null);
  });

  test("prints token counts a human can compare", () => {
    expect(formatTokenCount(200000)).toBe("200K");
    expect(formatTokenCount(1000000)).toBe("1M");
    expect(formatTokenCount(1050000)).toBe("1.1M");
    expect(formatTokenCount(0)).toBe(null);
    expect(formatTokenCount(undefined)).toBe(null);
  });
});
