import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { parseRedrobPricing, type RedrobPricing } from "../src/app/lib/redrob-pricing";
import { autoModel, guideGroups, guideModelCount } from "../src/react-app/desk/guide/guide";
import { guideProfessions, loadGuideResearch } from "../src/react-app/desk/guide/model-guide";
import { PricingGuideView, ProfessionGuideView, guideFetch } from "../src/react-app/desk/preview/desk-guide";

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

describe("the guide by profession", () => {
  test("the shipped research parses: 11 professions, 5 tasks each, 5 picks per language", async () => {
    const research = await loadGuideResearch();
    expect(research.professions).toHaveLength(11);
    for (const profession of research.professions) {
      expect(profession.tasks).toHaveLength(5);
      for (const task of profession.tasks) {
        expect(Object.keys(task.picks).sort()).toEqual(["en", "hi", "ko"]);
        for (const picks of Object.values(task.picks)) expect(picks).toHaveLength(5);
      }
    }
  });

  test("every figure says what kind it is, and every non-estimate benchmark or price links its source", async () => {
    const research = await loadGuideResearch();
    const sources = research.professions.flatMap((p) =>
      p.tasks.flatMap((task) => Object.values(task.picks).flatMap((picks) => picks.flatMap((pick) => pick.sources))),
    );
    expect(sources.length).toBeGreaterThan(825 * 2);
    const cited = sources.filter((source) => !["monthly", "image"].includes(source.label));
    expect(cited.filter((source) => !source.url)).toEqual([]);
    expect(sources.filter((source) => source.label === "monthly").every((source) => source.kind === "estimate")).toBe(true);
  });

  test("labels in the app's language; planned tools say soon; efforts sit on the model's own scale", async () => {
    const research = await loadGuideResearch();
    const ko = guideProfessions(research, "ko");
    expect(ko.find((p) => p.id === "lawyer")?.label).toBe("변호사");
    const en = guideProfessions(research, "en");
    const task = en.find((p) => p.id === "designer")?.tasks?.find((entry) => entry.id === "design-screens");
    const first = task?.picksByLanguage?.en?.[0];
    expect(first?.harness).toBe("Redrob Cowork");
    expect(first?.tools?.find((tool) => tool.label === "UI design")?.soon).toBe(true);
    expect(first?.tools?.find((tool) => tool.label === "Reads files")?.soon).toBe(false);
    const levels = first?.efforts ?? [];
    expect(levels.length).toBeGreaterThan(1);
    expect(levels.map((level) => level.level)).toEqual(levels.map((_, i) => i + 1));
    expect(first?.effort?.of).toBe(levels.length);
  });

  test("a task that needs a picture runs a text model, then an image model, and adds the image cost", async () => {
    const research = await loadGuideResearch();
    const raw = research.professions.find((p) => p.id === "small-team")?.tasks.find((task) => task.id === "create-marketing");
    const pick = raw?.picks.en?.[0];
    expect(pick?.steps.map((step) => step.role ?? "text")).toEqual(["text", "image"]);
    expect(pick?.sources.some((source) => source.label === "image")).toBe(true);
    const shown = guideProfessions(research, "en")
      .find((p) => p.id === "small-team")
      ?.tasks?.find((task) => task.id === "create-marketing")?.picksByLanguage?.en?.[0];
    expect(shown?.model).toBeUndefined();
    expect(shown?.steps?.map((step) => step.role)).toEqual(["Writes", "Makes the image"]);
    expect(shown?.steps?.[0]?.effort).toEqual(shown?.effort);
    const ranked = shown?.efforts?.find((level) => level.level === shown?.effort?.level);
    expect(ranked?.monthly).toBe(shown?.monthly);
  });

  test("renders the language select, figure kinds and sources, and no model switch", async () => {
    const research = await loadGuideResearch();
    const html = renderToStaticMarkup(<ProfessionGuideView research={research} locale="en" />);
    expect(html).toContain("Work in");
    expect(html).toContain("Hindi");
    expect(html).toContain("Estimate");
    expect(html).toContain("Sources");
    expect(html).toContain("Redrob Cowork");
    expect(html).toContain("every message goes to Redrob Auto");
  });
});
