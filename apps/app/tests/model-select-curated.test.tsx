import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ModelOption } from "../src/app/types";
import { curateModelOptions } from "../src/app/lib/featured-models";
import { inferModelVendor } from "../src/app/lib/model-vendor";
import { parseRedrobPricing } from "../src/app/lib/redrob-pricing";
import { t } from "../src/i18n";
import { ModelMenu } from "../src/components/model-select";

function option(providerID: string, modelID: string, title = modelID): ModelOption {
  return {
    providerID,
    modelID,
    title,
    behaviorTitle: "",
    behaviorLabel: "",
    behaviorDescription: "",
    behaviorValue: null,
    isFree: false,
  };
}

/** A Redrob catalogue like the console's: hundreds of models, the five featured ones among them. */
const REDROB = [
  option("redrob", "auto", "Redrob Auto"),
  option("redrob", "aion-labs/aion-2.0", "Aion 2.0"),
  option("redrob", "x-ai/grok-4.7", "Grok 4.7"),
  option("redrob", "meta/muse-spark-1.3", "Muse Spark 1.3"),
  option("redrob", "google/gemini-3.8-flash", "Gemini 3.8 Flash"),
  option("redrob", "gpt-6-astra", "GPT-6 Astra"),
  option("redrob", "anthropic/claude-opus-5.5", "Claude Opus 5.5"),
  option("redrob", "qwen/qwen3.8-max-0902", "Qwen3.8 Max"),
];

const FEATURED = parseRedrobPricing({
  models: [],
  featured: [
    { modelId: "anthropic/claude-opus-5.5", lab: "Anthropic", note: { en: "Writing", ko: "글쓰기" } },
    { modelId: "gpt-6-astra", lab: "OpenAI", note: { en: "Complex work", ko: "복잡한 작업" } },
    { modelId: "not-served/anywhere", lab: "Nobody", note: { en: "x", ko: "x" } },
    { modelId: "google/gemini-3.8-flash", lab: "Google", note: { en: "Everyday", ko: "일상" } },
  ],
}).featured;

describe("the model menu", () => {
  test("reads the console's featured list, dropping malformed entries", () => {
    const parsed = parseRedrobPricing({
      featured: [
        { modelId: "gpt-6-astra", lab: "OpenAI", note: { en: "a", ko: "b" } },
        { modelId: "missing-note", lab: "X" },
        "nonsense",
      ],
    });
    expect(parsed.featured.map((entry) => entry.modelId)).toEqual(["gpt-6-astra"]);
    expect(parseRedrobPricing({}).featured).toEqual([]);
  });

  test("shows Auto, then the console's featured models in its order, skipping any the engine does not list", () => {
    const rows = curateModelOptions({ options: REDROB, featured: FEATURED, value: { providerID: "redrob", modelID: "auto" }, locale: "en" });
    expect(rows?.map((row) => [row.kind, row.option.modelID, row.lab ?? null])).toEqual([
      ["auto", "auto", null],
      ["featured", "anthropic/claude-opus-5.5", "Anthropic"],
      ["featured", "gpt-6-astra", "OpenAI"],
      ["featured", "google/gemini-3.8-flash", "Google"],
    ]);
    expect(rows?.[1]?.note).toBe("Writing");
  });

  test("names a featured model the way the console does, not by its id", () => {
    const named = parseRedrobPricing({
      featured: [{ modelId: "gpt-6-astra", name: "GPT-6 Astra", lab: "OpenAI", note: { en: "a", ko: "b" } }],
    }).featured;
    const options = [option("redrob", "auto"), option("redrob", "gpt-6-astra")];
    const rows = curateModelOptions({ options, featured: named, value: { providerID: "redrob", modelID: "auto" }, locale: "en" });
    expect(rows?.[1]?.option.title).toBe("GPT-6 Astra");
    // And before the console sends names, the app's own list has them.
    const fallback = curateModelOptions({ options, featured: [], value: { providerID: "redrob", modelID: "auto" }, locale: "en" });
    expect(fallback?.[1]?.option.title).toBe("GPT-6 Astra");
  });

  test("Muse Spark is Meta's, so its row shows Meta's mark rather than Redrob's", () => {
    expect(inferModelVendor("meta/muse-spark-1.3")?.name).toBe("Meta");
  });

  test("uses the console's note in the reader's language", () => {
    const rows = curateModelOptions({
      options: REDROB,
      featured: FEATURED,
      value: { providerID: "redrob", modelID: "auto" },
      locale: "ko",
    });
    expect(rows?.find((row) => row.option.modelID === "gpt-6-astra")?.note).toBe("복잡한 작업");
  });

  test("before the console publishes a list, shows the same five, one per lab, with the app's own notes", () => {
    const rows = curateModelOptions({ options: REDROB, featured: [], value: { providerID: "redrob", modelID: "auto" }, locale: "en" });
    expect(rows?.map((row) => row.lab ?? row.kind)).toEqual(["auto", "Anthropic", "OpenAI", "Google", "Meta", "SpaceXAI"]);
    expect(rows?.every((row) => row.note.length > 0)).toBe(true);
    // Never the whole catalogue.
    expect(rows?.some((row) => row.option.modelID === "aion-labs/aion-2.0")).toBe(false);
  });

  test("keeps the model in use visible when it is not one of the recommendations", () => {
    const rows = curateModelOptions({
      options: REDROB,
      featured: [],
      value: { providerID: "redrob", modelID: "qwen/qwen3.8-max-0902" },
      locale: "en",
    });
    expect(rows?.at(-1)).toMatchObject({ kind: "current", option: { title: "Qwen3.8 Max" } });
    // Once, and not when it is already a row.
    const onAuto = curateModelOptions({ options: REDROB, featured: [], value: { providerID: "redrob", modelID: "auto" }, locale: "en" });
    expect(onAuto?.some((row) => row.kind === "current")).toBe(false);
  });

  test("a model no provider lists any more still shows, by its id", () => {
    const rows = curateModelOptions({ options: REDROB, featured: [], value: { providerID: "ollama", modelID: "gone-model" }, locale: "en" });
    expect(rows?.at(-1)).toMatchObject({ kind: "current", option: { providerID: "ollama", title: "gone-model" } });
  });

  test("without Redrob there is nothing to recommend, so the menu lists the connected provider's own models", () => {
    const ollama = [option("ollama", "llama4"), option("ollama", "qwen3")];
    expect(curateModelOptions({ options: ollama, featured: FEATURED, value: { providerID: "ollama", modelID: "llama4" }, locale: "en" })).toBeNull();
  });

  test("has no search, no full list and no provider connect, and links to the Model Guide's By profession tab", () => {
    const source = readFileSync(fileURLToPath(new URL("../src/components/model-select.tsx", import.meta.url)), "utf8");
    expect(source).not.toContain("CommandInput");
    expect(source).not.toContain("openModelPickerEvent");
    expect(source).not.toContain("openProviderAuthEvent");
    expect(source).not.toContain("model_select.connect_more");
    expect(source).not.toContain("model_picker.all_models");
    expect(source).toContain('export const MODEL_GUIDE_PATH = "/guide?tab=profession";');
    expect(source).toContain('t("model_select.guide_link")');
  });

  test("renders Auto, the labs, a line on what each is for, a price band, and the guide link", () => {
    const pricing = parseRedrobPricing({
      models: [{ id: "gpt-6-astra", priceBand: "frontier", capabilities: {} }],
    });
    const rows = curateModelOptions({
      options: REDROB,
      featured: FEATURED,
      value: { providerID: "redrob", modelID: "qwen/qwen3.8-max-0902" },
      locale: "en",
    });
    const html = renderToStaticMarkup(
      <ModelMenu
        rows={rows}
        groups={[]}
        value={{ providerID: "redrob", modelID: "qwen/qwen3.8-max-0902" }}
        pricing={pricing}
        onSelect={() => undefined}
        onNavigate={() => undefined}
      />,
    );
    const order = ["Redrob Auto", "Claude Opus 5.5", "GPT-6 Astra", "Gemini 3.8 Flash", "Qwen3.8 Max"].map((title) =>
      html.indexOf(`>${title}<`),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain(">Anthropic<");
    expect(html).toContain(">Complex work<");
    expect(html).toContain(">$$$$<");
    expect(html).toContain(`>${t("model_select.current")}<`);
    expect(html).toContain('aria-selected="true" data-checked="true" data-kind="current"');
    expect(html).toContain(t("model_select.guide_link"));
    expect(html).toContain('href="#/guide?tab=profession"');
    expect(html).not.toContain("Aion 2.0");
  });

  test("the Model Guide reads its tab from the URL, so the link wins even when By price is open", () => {
    const source = readFileSync(fileURLToPath(new URL("../src/react-app/desk/preview/desk-guide.tsx", import.meta.url)), "utf8");
    expect(source).toContain('params.get("tab") === "price" ? "price" : "profession"');
    expect(source).not.toContain('useState<GuideTab>("profession")');
  });
});
