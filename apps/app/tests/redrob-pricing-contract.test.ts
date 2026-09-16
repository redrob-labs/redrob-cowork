import { describe, expect, test } from "bun:test";

import {
  estimatedCostFor,
  formatPriceTier,
  formatThinkingLevels,
  formatUsdAmount,
  parseRedrobPricing,
  priceTier,
} from "../src/app/lib/redrob-pricing";

/**
 * Shaped after the live console response (GET /api/backend/v1/pricing), including
 * the fields it started publishing after the catalogue grew from six models to
 * several hundred: strengths, priceBand, estimatedCosts, costProfiles, and the
 * modality capabilities.
 *
 * `auto` is kept exactly as the console serves it -- a router with `routed: true`,
 * no price band, and an empty estimate list -- because that is the case a client
 * gets wrong first.
 */
const LIVE_SHAPED_PAYLOAD = {
  autoModelId: "auto",
  costProfiles: [
    { id: "chat", label: "A short question", description: "One question and a couple of paragraphs back.", inputTokens: 500, outputTokens: 300 },
    { id: "code", label: "A coding turn", description: "A file or two of context, a patch back.", inputTokens: 8000, outputTokens: 1500 },
    { id: "document", label: "A long document", description: "A long read, a short answer.", inputTokens: 60000, outputTokens: 2000 },
  ],
  models: [
    {
      id: "auto",
      label: "auto",
      routed: true,
      priceBand: null,
      estimatedCosts: [],
      strengths: ["tool calling", "adjustable reasoning (low, medium, high, xhigh, max)", "million-token context"],
      inputPricePerMillionUsd: 0.6,
      outputPricePerMillionUsd: 1.8,
      capabilities: {
        maxContextTokens: 2_000_000,
        thinkingLevels: ["low", "medium", "high", "xhigh", "max"],
        fastMode: true,
        imageInput: true,
        tools: true,
        structuredOutputs: true,
        maxOutputTokens: 64_000,
      },
    },
    {
      id: "claude-opus-5",
      label: "claude-opus-5",
      routed: false,
      priceBand: "premium",
      estimatedCosts: [
        { profile: "chat", costUsd: 0.0105, requestsPerDollar: 95 },
        { profile: "code", costUsd: 0.081375, requestsPerDollar: 12 },
        { profile: "document", costUsd: 0.3675, requestsPerDollar: 2 },
      ],
      strengths: ["tool calling", "structured output", "image input", "file input"],
      inputPricePerMillionUsd: 5,
      outputPricePerMillionUsd: 25,
      inputMultiplier: 8.3,
      outputMultiplier: 13.9,
      capabilities: { maxContextTokens: 1_000_000, thinkingLevels: ["low", "medium", "high"], imageInput: true },
    },
    {
      id: "cheap-thing",
      priceBand: "BUDGET",
      estimatedCosts: [{ profile: "chat", costUsd: 0.0004 }],
      strengths: [],
      capabilities: { thinkingLevels: [] },
    },
    { id: "  ", label: "nameless" },
    "not an object",
  ],
};

describe("the console pricing contract", () => {
  const pricing = parseRedrobPricing(LIVE_SHAPED_PAYLOAD);

  test("the new per-model fields are carried through, and junk entries are dropped", () => {
    expect(Object.keys(pricing.byModelId).sort()).toEqual(["auto", "cheap-thing", "claude-opus-5"]);
    expect(pricing.costProfiles.map((profile) => profile.id)).toEqual(["chat", "code", "document"]);

    const opus = pricing.byModelId["claude-opus-5"]!;
    expect(opus.priceBand).toBe("premium");
    expect(opus.strengths).toEqual(["tool calling", "structured output", "image input", "file input"]);
    expect(opus.capabilities.imageInput).toBe(true);
    expect(estimatedCostFor(opus, "code")?.costUsd).toBe(0.081375);
    expect(estimatedCostFor(opus, "code")?.requestsPerDollar).toBe(12);
    expect(estimatedCostFor(opus, "nonexistent")).toBeUndefined();
  });

  test("a band is read case-insensitively, and an unknown one is not invented", () => {
    expect(pricing.byModelId["cheap-thing"]!.priceBand).toBe("budget");
    expect(parseRedrobPricing({ models: [{ id: "x", priceBand: "cheapish" }] }).byModelId.x!.priceBand)
      .toBeUndefined();
  });

  test("the router publishes no band and no estimates, and neither is faked", () => {
    const auto = pricing.byModelId.auto!;
    expect(auto.routed).toBe(true);
    expect(auto.priceBand).toBeUndefined();
    expect(auto.estimatedCosts).toEqual([]);
    // No band, but it is priced against itself, so no multiplier either: nothing
    // to show rather than a misleading single `$`.
    expect(priceTier(auto)).toBeNull();
    expect(formatPriceTier(auto)).toBeNull();
    expect(formatThinkingLevels(auto)).toBe("low · medium · high · xhigh · max");
  });

  test("the band drives the tier, and the multiplier is only the fallback", () => {
    // premium is the third of four bands.
    expect(priceTier(pricing.byModelId["claude-opus-5"])).toBe(3);
    expect(formatPriceTier(pricing.byModelId["claude-opus-5"])).toBe("$$$");
    expect(formatPriceTier(pricing.byModelId["cheap-thing"])).toBe("$");
    expect(formatPriceTier(parseRedrobPricing({
      models: [{ id: "unbanded", inputMultiplier: 9, outputMultiplier: 3 }],
    }).byModelId.unbanded)).toBe("$$$");
    expect(formatPriceTier(undefined)).toBeNull();
  });

  test("a dollar amount keeps its precision where it matters", () => {
    // The point of the whole exercise: a fraction of a cent must not render as
    // free.
    expect(formatUsdAmount(0.0004)).toBe("$0.0004");
    expect(formatUsdAmount(0.0105)).toBe("$0.011");
    // 0.3675 has no exact binary form and sits a hair below the tie, so toFixed
    // rounds it down. Pinned as it behaves rather than as decimal arithmetic
    // would suggest -- a tenth of a cent either way does not change a decision,
    // and a test that asserts otherwise fails on every platform.
    expect(formatUsdAmount(0.3675)).toBe("$0.367");
    expect(formatUsdAmount(12.5)).toBe("$12.50");
    expect(formatUsdAmount(0)).toBe("$0");
    expect(formatUsdAmount(undefined)).toBeNull();
    expect(formatUsdAmount(Number.NaN)).toBeNull();
  });

  test("a response that is not the expected shape yields an empty catalogue", () => {
    expect(parseRedrobPricing(null)).toEqual({ byModelId: {}, costProfiles: [] });
    expect(parseRedrobPricing({ models: "nope" }).byModelId).toEqual({});
  });
});
