import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { parseRedrobPricing, type RedrobPricing } from "../src/app/lib/redrob-pricing";
import { autoModel, guideGroups, guideModelCount } from "../src/react-app/desk/guide/guide";
import { PricingGuideView, guideFetch } from "../src/react-app/desk/preview/desk-guide";

const model = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: id.toUpperCase(),
  inputPricePerMillionUsd: 1,
  outputPricePerMillionUsd: 4,
  estimatedCosts: [{ profile: "chat", costUsd: 0.0021 }],
  strengths: ["tool calling"],
  capabilities: { thinkingLevels: [], maxContextTokens: 200_000 },
  ...extra,
});

const PRICING: RedrobPricing = {
  autoModelId: "auto",
  costProfiles: [{ id: "chat", label: "short question" }],
  byModelId: {
    auto: { ...model("auto", { routed: true }), estimatedCosts: [{ profile: "chat", costUsd: 0.003 }] },
    zeta: model("zeta", { priceBand: "budget" }),
    alpha: model("alpha", { priceBand: "budget" }),
    big: model("big", { priceBand: "frontier", strengths: ["adjustable reasoning (low, medium, high)"] }),
    loose: model("loose"),
  },
};

describe("the guide's groups", () => {
  test("Auto apart; the rest by the console's band, cheapest first, each by name", () => {
    expect(guideGroups(PRICING).map((group) => [group.band, group.models.map((entry) => entry.id)])).toEqual([
      ["budget", ["alpha", "zeta"]],
      ["frontier", ["big"]],
      ["other", ["loose"]],
    ]);
    expect(autoModel(PRICING)?.id).toBe("auto");
    expect(guideModelCount(PRICING)).toBe(4);
  });

  test("an empty catalogue has no groups and no Auto", () => {
    const empty = parseRedrobPricing({});
    expect(guideGroups(empty)).toEqual([]);
    expect(autoModel(empty)).toBeNull();
  });
});

describe("the guide screen", () => {
  test("shows Auto, the bands, prices per million and per request, and the console's strengths", () => {
    const html = renderToStaticMarkup(<PricingGuideView pricing={PRICING} />);
    expect(html).toContain("Every message goes to Redrob Auto");
    expect(html).toContain("A typical short question costs about $0.0030.");
    expect(html).toContain("Lowest cost");
    expect(html).toContain("Most capable");
    expect(html).toContain("ALPHA");
    expect(html).toContain("$1 / $4");
    expect(html).toContain("$0.0021");
    expect(html).toContain("200K");
    expect(html).toContain("adjustable reasoning (low, medium, high)");
    // No sample rankings, no made-up models.
    expect(html).not.toContain("Gemini Enterprise for Legal");
  });

  test("nothing published says so", () => {
    expect(renderToStaticMarkup(<PricingGuideView pricing={parseRedrobPricing({})} />)).toContain("No models published");
  });

  test("the desktop app reads the catalogue through its own process; the web reads it directly", () => {
    expect(guideFetch(false)).toBe(fetch);
    expect(guideFetch(true)).not.toBe(fetch);
  });
});
