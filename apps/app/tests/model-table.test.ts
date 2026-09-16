import { describe, expect, it } from "bun:test";

import {
  AUTO_MODEL_ID,
  DEFAULT_MODEL_SORT,
  EMPTY_FILTERS,
  bandFacets,
  buildModelRow,
  compareModelRows,
  matchesRowFilters,
  nextSort,
  orderedRows,
  vendorFacets,
  visibleRows,
  type ModelFilters,
} from "../src/react-app/domains/session/modals/model-table";
import type { ModelOption } from "../src/app/types";
import type { RedrobPricing } from "../src/app/lib/redrob-pricing";

function option(modelID: string, title = modelID): ModelOption {
  return {
    providerID: "redrob",
    modelID,
    title,
    behaviorTitle: "",
    behaviorLabel: "",
    behaviorDescription: "",
    behaviorValue: null,
    isFree: false,
  };
}

const pricing: RedrobPricing = {
  costProfiles: [{ id: "code", label: "Coding turn" }],
  byModelId: {
    auto: {
      id: "auto",
      priceBand: "standard",
      estimatedCosts: [{ profile: "code", costUsd: 0.02 }],
      strengths: [],
      routed: true,
      capabilities: { thinkingLevels: ["low", "high"], maxContextTokens: 1_000_000, tools: true },
    },
    "anthropic/claude-opus-4": {
      id: "anthropic/claude-opus-4",
      priceBand: "frontier",
      estimatedCosts: [{ profile: "code", costUsd: 0.244 }],
      strengths: [],
      capabilities: {
        thinkingLevels: [],
        maxContextTokens: 200_000,
        tools: true,
        imageInput: true,
      },
    },
    "openai/gpt-5-nano": {
      id: "openai/gpt-5-nano",
      priceBand: "budget",
      estimatedCosts: [{ profile: "code", costUsd: 0.004 }],
      strengths: [],
      capabilities: { thinkingLevels: [], maxContextTokens: 400_000, tools: true },
    },
    // Deliberately publishes no band, no context and no estimate.
    "mystery/unpriced": {
      id: "mystery/unpriced",
      estimatedCosts: [],
      strengths: [],
      capabilities: { thinkingLevels: [] },
    },
  },
};

const rows = [
  buildModelRow(option(AUTO_MODEL_ID, "Auto"), pricing),
  buildModelRow(option("anthropic/claude-opus-4"), pricing),
  buildModelRow(option("openai/gpt-5-nano"), pricing),
  buildModelRow(option("mystery/unpriced"), pricing),
];

describe("buildModelRow", () => {
  it("reads the facts a column needs off the published catalogue", () => {
    const opus = rows[1]!;
    expect(opus.priceBand).toBe("frontier");
    expect(opus.priceRank).toBe(4);
    expect(opus.contextTokens).toBe(200_000);
    expect(opus.turnCostUsd).toBeCloseTo(0.244);
    expect([...opus.capabilities].sort()).toEqual(["imageInput", "tools"]);
  });

  it("reports reasoning support as a capability, from the published levels", () => {
    expect(rows[0]!.capabilities.has("reasoning")).toBe(true);
    expect(rows[0]!.effortLevels).toEqual(["low", "high"]);
    expect(rows[1]!.capabilities.has("reasoning")).toBe(false);
  });

  it("leaves an unpublished fact null rather than zero", () => {
    // A model with no published price is not free, and a zero here would be read as exactly that.
    const unpriced = rows[3]!;
    expect(unpriced.priceBand).toBeNull();
    expect(unpriced.priceRank).toBeNull();
    expect(unpriced.contextTokens).toBeNull();
    expect(unpriced.turnCostUsd).toBeNull();
  });
});

describe("ordering", () => {
  it("pins auto above every other row whatever the sort", () => {
    for (const sort of [
      DEFAULT_MODEL_SORT,
      { key: "model", direction: "desc" } as const,
      { key: "cost", direction: "desc" } as const,
      { key: "context", direction: "asc" } as const,
    ]) {
      const { auto, rest } = orderedRows(rows, sort);
      expect(auto.map((row) => row.modelId)).toEqual([AUTO_MODEL_ID]);
      expect(rest.some((row) => row.modelId === AUTO_MODEL_ID)).toBe(false);
    }
  });

  it("sorts price cheap-to-expensive by band rather than alphabetically", () => {
    // Alphabetically "budget" < "frontier" < "premium" < "standard", which is not a price order.
    const { rest } = orderedRows(rows, { key: "price", direction: "asc" });
    expect(rest.map((row) => row.priceBand)).toEqual(["budget", "frontier", null]);
  });

  it("sorts missing data last in BOTH directions", () => {
    for (const direction of ["asc", "desc"] as const) {
      const { rest } = orderedRows(rows, { key: "cost", direction });
      expect(rest[rest.length - 1]!.modelId).toBe("mystery/unpriced");
    }
  });

  it("compares numerically, not by string", () => {
    const nano = rows[2]!;
    const opus = rows[1]!;
    // 400K vs 200K: a string compare would put "200000" before "400000" and read as smaller.
    expect(compareModelRows(nano, opus, { key: "context", direction: "desc" })).toBeLessThan(0);
  });
});

describe("nextSort", () => {
  it("starts a new column ascending and flips the active one", () => {
    expect(nextSort({ key: "price", direction: "asc" }, "cost")).toEqual({ key: "cost", direction: "asc" });
    expect(nextSort({ key: "cost", direction: "asc" }, "cost")).toEqual({ key: "cost", direction: "desc" });
    expect(nextSort({ key: "cost", direction: "desc" }, "cost")).toEqual({ key: "cost", direction: "asc" });
  });
});

describe("filters", () => {
  const withCaps = (caps: string[]): ModelFilters => ({
    ...EMPTY_FILTERS,
    capabilities: new Set(caps as never[]),
  });

  it("treats an empty group as no filter", () => {
    expect(rows.every((row) => matchesRowFilters(row, EMPTY_FILTERS))).toBe(true);
  });

  it("ANDs across groups and ORs within one", () => {
    const twoBands: ModelFilters = { ...EMPTY_FILTERS, bands: new Set(["budget", "frontier"]) };
    expect(visibleRows(rows, twoBands, "").map((row) => row.modelId).sort()).toEqual([
      "anthropic/claude-opus-4",
      "auto",
      "openai/gpt-5-nano",
    ]);

    const bandAndCap: ModelFilters = {
      ...EMPTY_FILTERS,
      bands: new Set(["frontier"]),
      capabilities: new Set(["imageInput"]),
    };
    expect(visibleRows(rows, bandAndCap, "").map((row) => row.modelId).sort()).toEqual([
      "anthropic/claude-opus-4",
      "auto",
    ]);
  });

  it("requires every ticked capability, not any of them", () => {
    // nano has tools but no image input, so ticking both must exclude it.
    expect(matchesRowFilters(rows[2]!, withCaps(["tools"]))).toBe(true);
    expect(matchesRowFilters(rows[2]!, withCaps(["tools", "imageInput"]))).toBe(false);
  });

  it("never filters auto out", () => {
    // The router has no single vendor or band. Hiding the recommended choice from someone narrowing the
    // list would be the wrong answer to a narrower question.
    const impossible: ModelFilters = {
      vendors: new Set(["nobody"]),
      bands: new Set(["frontier"]),
      capabilities: new Set(["audioInput"]),
    };
    expect(visibleRows(rows, impossible, "").map((row) => row.modelId)).toEqual([AUTO_MODEL_ID]);
  });

  it("applies search and rail together", () => {
    expect(visibleRows(rows, EMPTY_FILTERS, "opus").map((row) => row.modelId)).toEqual([
      "anthropic/claude-opus-4",
    ]);
  });
});

describe("facets", () => {
  it("counts vendors present in the rows, most models first, excluding auto", () => {
    const facets = vendorFacets(rows);
    expect(facets.some((facet) => facet.id === "")).toBe(false);
    expect(facets.every((facet) => facet.count >= 1)).toBe(true);
    expect(facets.map((facet) => facet.count)).toEqual([...facets.map((f) => f.count)].sort((a, b) => b - a));
  });

  it("orders bands cheap-to-expensive and omits ones no row has", () => {
    // No `premium` row here, so it must not be offered - a filter that empties the table is a dead end.
    expect(bandFacets(rows).map((facet) => facet.band)).toEqual(["budget", "frontier"]);
  });
});
