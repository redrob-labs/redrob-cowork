import type { ModelOption, ModelRef } from "@/app/types";
import { t, type Language } from "@/i18n";
import type { RedrobFeaturedModel } from "@/app/lib/redrob-pricing";
import { isRedrobOnlyProviderId, REDROB_MODEL_ID } from "@/react-app/domains/settings/redrob-provider";

/**
 * One row of the model menu: Redrob Auto, a lab's recommended model, or the model in use when it is
 * neither.
 */
export type CuratedModelRow = {
  option: ModelOption;
  kind: "auto" | "featured" | "current";
  /** The lab that makes it, for a featured row. */
  lab?: string;
  /** One line on what it is for. */
  note: string;
};

/**
 * What the menu shows while the console does not publish `featured` yet.
 *
 * The same five models as the console's own list, so the menu reads the same before and after the
 * console ships it. The console's list wins as soon as it arrives. Notes go through `t()` because they
 * are this app's copy until then.
 */
type FeaturedEntry = { modelId: string; name?: string; lab: string; note: () => string };

const FALLBACK_FEATURED: ReadonlyArray<FeaturedEntry> = [
  { modelId: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", lab: "Anthropic", note: () => t("model_select.note_anthropic") },
  { modelId: "gpt-6-astra", name: "GPT-6 Astra", lab: "OpenAI", note: () => t("model_select.note_openai") },
  { modelId: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", lab: "Google", note: () => t("model_select.note_google") },
  { modelId: "meta/muse-spark-1.3", name: "Muse Spark 1.3", lab: "Meta", note: () => t("model_select.note_meta") },
  { modelId: "x-ai/grok-4.7", name: "Grok 4.7", lab: "SpaceXAI", note: () => t("model_select.note_xai") },
];

function sameModel(a: ModelRef, b: ModelRef): boolean {
  return a.providerID === b.providerID && a.modelID === b.modelID;
}

/**
 * Auto, then one recommended model per lab, then the model in use if it is not already listed.
 *
 * Returns `null` when Redrob is not connected. The recommendations are Redrob models, so with only
 * another provider connected there would be nothing to recommend, and the menu lists that provider's
 * models instead. A featured model the engine does not list is skipped, so the menu never offers a row
 * that cannot be picked.
 */
export function curateModelOptions(input: {
  options: readonly ModelOption[];
  featured: readonly RedrobFeaturedModel[];
  value: ModelRef;
  /** Which of the console's notes to show. */
  locale: Language;
}): CuratedModelRow[] | null {
  const redrob = input.options.filter((option) => isRedrobOnlyProviderId(option.providerID));
  if (redrob.length === 0) return null;

  const korean = input.locale === "ko";
  const list: ReadonlyArray<FeaturedEntry> = input.featured.length
    ? input.featured.map((entry) => ({
        modelId: entry.modelId,
        name: entry.name,
        lab: entry.lab,
        note: () => (korean ? entry.note.ko : entry.note.en),
      }))
    : FALLBACK_FEATURED;

  const rows: CuratedModelRow[] = [];
  const auto = redrob.find((option) => option.modelID === REDROB_MODEL_ID);
  if (auto) rows.push({ option: auto, kind: "auto", note: t("model_select.note_auto") });
  for (const entry of list) {
    const option = redrob.find((candidate) => candidate.modelID === entry.modelId);
    // The recommendation's own name wins: the engine shows a canonical id such as `gpt-6-astra` as-is.
    if (option) {
      rows.push({
        option: entry.name ? { ...option, title: entry.name } : option,
        kind: "featured",
        lab: entry.lab,
        note: entry.note(),
      });
    }
  }

  // The model in use is always visible, so the menu never hides what will answer the next message.
  if (input.value.modelID && !rows.some((row) => sameModel(row.option, input.value))) {
    // A model no provider lists any more still shows, by id, so the reader can see it and move off it.
    const option: ModelOption = input.options.find((candidate) => sameModel(candidate, input.value)) ?? {
      providerID: input.value.providerID,
      modelID: input.value.modelID,
      title: input.value.modelID,
      behaviorTitle: "",
      behaviorLabel: "",
      behaviorDescription: "",
      behaviorValue: null,
      isFree: false,
    };
    rows.push({ option, kind: "current", note: t("model_select.note_current") });
  }
  return rows;
}

/**
 * The recommended models, in order, with each one's note in the reader's language: the console's list
 * when it publishes one, the app's own until then. The model list in Settings leads with these.
 */
export function recommendedModels(
  featured: readonly RedrobFeaturedModel[],
  locale: Language,
): Array<{ modelId: string; name?: string; lab: string; note: string }> {
  if (featured.length) {
    return featured.map((entry) => ({
      modelId: entry.modelId,
      name: entry.name,
      lab: entry.lab,
      note: locale === "ko" ? entry.note.ko : entry.note.en,
    }));
  }
  return FALLBACK_FEATURED.map((entry) => ({ modelId: entry.modelId, name: entry.name, lab: entry.lab, note: entry.note() }));
}
