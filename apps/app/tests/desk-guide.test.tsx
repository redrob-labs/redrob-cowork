import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { parseRedrobPricing, type RedrobPricing } from "../src/app/lib/redrob-pricing";
import { autoModel, guideGroups, guideModelCount } from "../src/react-app/desk/guide/guide";
import { guideOutputs, guideProfessions, loadGuideResearch } from "../src/react-app/desk/guide/model-guide";
import { PricingGuideView, ProfessionGuideView, guideFetch } from "../src/react-app/desk/preview/desk-guide";
import { setLocale } from "../src/i18n";
import redrobCatalogue from "../../../scripts/model-guide/snapshots/redrob/2026-10-08.json";

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
  featured: [],
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
  test("the shipped research parses: 12 professions, 5 tasks each, 5 ranked picks per language and per output", async () => {
    const research = await loadGuideResearch();
    expect(research.professions).toHaveLength(12);
    const ranked = (picks: Array<{ benchmark?: boolean }>) => picks.filter((pick) => !pick.benchmark);
    for (const profession of research.professions) {
      expect(profession.tasks).toHaveLength(5);
      for (const task of profession.tasks) {
        expect(Object.keys(task.picks).sort()).toEqual(["en", "hi", "ko"]);
        for (const picks of Object.values(task.picks)) expect(ranked(picks)).toHaveLength(5);
        expect(Object.keys(task.picksByOutput).sort()).toEqual([...task.outputs].sort());
        for (const byLanguage of Object.values(task.picksByOutput)) {
          expect(Object.keys(byLanguage).sort()).toEqual(["en", "hi", "ko"]);
          for (const picks of Object.values(byLanguage)) expect(ranked(picks)).toHaveLength(5);
        }
      }
    }
  });

  test("a benchmark is GPT-6 Astra on ChatGPT Work or Opus 5.5 on Claude Cowork, only when it would make the top five", async () => {
    const research = await loadGuideResearch();
    const w = research.weights;
    const total = (pick: { score: { quality: number; reliability: number; speed: number; cost: number } }) =>
      w.quality * pick.score.quality + w.reliability * pick.score.reliability + w.speed * pick.score.speed + w.cost * pick.score.cost;
    const lists = research.professions.flatMap((p) =>
      p.tasks.flatMap((task) => [...Object.values(task.picks), ...Object.values(task.picksByOutput).flatMap((x) => Object.values(x))]),
    );
    let shown = 0;
    for (const picks of lists) {
      expect(picks[0]?.benchmark).toBeUndefined();
      const fifth = picks.filter((pick) => !pick.benchmark).at(-1);
      for (const pick of picks.filter((entry) => entry.benchmark)) {
        shown += 1;
        expect(["gpt-6-astra@chatgpt-work", "claude-opus-5-5@claude-cowork"]).toContain(`${pick.steps[0]?.model}@${pick.harness}`);
        // The stored scores are rounded to one decimal, so allow for that in the comparison.
        expect(total(pick)).toBeGreaterThanOrEqual(total(fifth ?? pick) - 0.1);
      }
    }
    expect(shown).toBeGreaterThan(0);
  });

  test("accountants: five CPA tasks, in Korean too, where the Korean ranking says it is partly estimated", async () => {
    const research = await loadGuideResearch();
    const accountant = research.professions.find((p) => p.id === "accountant");
    expect(accountant?.label.ko).toBe("회계사");
    expect(accountant?.tasks.map((task) => task.id)).toEqual([
      "close-books",
      "prepare-tax",
      "audit-workpapers",
      "financial-statements",
      "client-advisory",
    ]);
    for (const task of accountant?.tasks ?? [])
      for (const pick of task.picks.ko ?? []) expect(pick.flags).toContain("partly-estimated");
  });

  test("a task offers only the outputs it is ranked for, labelled in the app's language", async () => {
    const research = await loadGuideResearch();
    const statements = guideProfessions(research, "ko")
      .find((p) => p.id === "accountant")
      ?.tasks?.find((task) => task.id === "financial-statements");
    expect(Object.keys(statements?.picksByOutput ?? {}).sort()).toEqual(["documents", "presentations", "spreadsheets"]);
    expect(statements?.label).toBe("재무제표와 주석 작성(US GAAP·K-IFRS)");
    expect(statements?.picksByOutput?.documents?.ko?.[0]?.harness).toBe("Redrob Cowork");
    const outputs = guideOutputs();
    expect(outputs.map((o) => o.value)).toEqual(["documents", "presentations", "spreadsheets", "graphics", "web"]);
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

  test("labels in the app's language; no pick or tool says coming soon; efforts sit on the model's own scale", async () => {
    const research = await loadGuideResearch();
    const ko = guideProfessions(research, "ko");
    expect(ko.find((p) => p.id === "lawyer")?.label).toBe("변호사");
    const en = guideProfessions(research, "en");
    const task = en.find((p) => p.id === "designer")?.tasks?.find((entry) => entry.id === "design-screens");
    const first = task?.picksByLanguage?.en?.[0];
    expect(first?.harness).toBe("Redrob Cowork");
    const shown = en.flatMap((p) => (p.tasks ?? []).flatMap((entry) => Object.values(entry.picksByLanguage ?? {}).flat()));
    expect(shown.filter((pick) => pick.comingSoon || pick.tools?.some((tool) => tool.soon))).toEqual([]);
    expect(first?.tools?.map((tool) => tool.label)).toContain("UI design");
    const levels = first?.efforts ?? [];
    expect(levels.length).toBeGreaterThan(1);
    expect(levels.map((level) => level.level)).toEqual(levels.map((_, i) => i + 1));
    expect(first?.effort?.of).toBe(levels.length);
  });

  test("a Redrob Cowork pick is ranked only at thinking levels Redrob serves that model at", async () => {
    const research = await loadGuideResearch();
    const served: Record<string, { thinking: string[] }> = redrobCatalogue.models;
    let checked = 0;
    for (const profession of research.professions)
      for (const task of profession.tasks)
        for (const picks of [...Object.values(task.picks), ...Object.values(task.picksByOutput).flatMap((x) => Object.values(x))])
          for (const pick of picks) {
            const id = research.catalogue?.[pick.steps[0]?.model ?? ""];
            if (pick.harness !== "redrob-desk" || !id) continue;
            // "default" sends no level, which Redrob always serves: the provider's own default.
            const allowed = [...(served[id]?.thinking ?? []), "default"];
            expect(allowed).toContain(pick.steps[0]?.effort ?? "default");
            for (const [effort] of pick.efforts) expect(allowed).toContain(effort);
            checked += 1;
          }
    expect(checked).toBeGreaterThan(700);
    // Opus 5.5 is ranked at Max elsewhere, but Redrob serves it up to High.
    const opus = research.professions[0]?.tasks.flatMap((task) => Object.values(task.picks).flat()).find(
      (pick) => pick.harness === "redrob-desk" && pick.steps[0]?.model === "claude-opus-5-5",
    );
    expect(opus?.steps[0]?.effort).toBe("high");
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

  test("renders the language select, figure kinds and sources, and a switch for new chats, with no Auto notice", async () => {
    const research = await loadGuideResearch();
    const html = renderToStaticMarkup(<ProfessionGuideView research={research} locale="en" />);
    expect(html).toContain("Work in");
    expect(html).toContain("Hindi");
    expect(html).toContain("Estimate");
    expect(html).toContain("Sources");
    expect(html).toContain("Redrob Cowork");
    expect(html).not.toContain("every message goes to Redrob Auto");
    expect(html).toContain("Use for new chats");
    // The comparison strip in place of the effort meter, with the effort written out in the detail.
    expect(html).toContain("rr-guide__glancehead");
    expect(html).toMatch(/aria-label="Quality \d of 5, Reliability \d of 5, Speed \d of 5, Value \d of 5/);
    expect(html).not.toContain("rr-model__effort");
    expect(html).toContain("Thinking: ");
    expect(html).toContain("I need");
    expect(html).toContain("Anything");
    expect(html).toContain("Benchmark");
    expect(html).toContain("is-benchmark");
  });

  test("in Korean, the harness, rank and effort read as Korean, not as English left in the component", async () => {
    const research = await loadGuideResearch();
    setLocale("ko");
    const html = renderToStaticMarkup(<ProfessionGuideView research={research} locale="ko" />);
    setLocale("en");
    expect(html).toContain("· 레드롭 코워크");
    expect(html).toMatch(/1위/);
    expect(html).not.toContain(" effort<");
    expect(html).not.toContain("on 레드롭 코워크");
    expect(html).not.toMatch(/#1 for /);
  });
});
