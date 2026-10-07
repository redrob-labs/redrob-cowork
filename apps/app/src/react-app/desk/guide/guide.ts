import type { RedrobModelPricing, RedrobPriceBand, RedrobPricing } from "../../../app/lib/redrob-pricing";

/** A price band and the models in it, cheapest band first. */
export type GuideGroup = { band: RedrobPriceBand | "other"; models: RedrobModelPricing[] };

const BAND_ORDER: ReadonlyArray<GuideGroup["band"]> = ["budget", "standard", "premium", "frontier", "other"];

/** The model's name as the console writes it. */
export function modelLabel(model: Pick<RedrobModelPricing, "id" | "label">): string {
  return model.label?.trim() || model.id;
}

/**
 * The published models by the console's own price band, each band by name. Auto is left
 * out of the bands: it is not one model, and the guide explains it on its own.
 */
export function guideGroups(pricing: RedrobPricing): GuideGroup[] {
  const groups = new Map<GuideGroup["band"], RedrobModelPricing[]>();
  for (const model of Object.values(pricing.byModelId)) {
    if (model.routed || model.id === pricing.autoModelId) continue;
    const band = model.priceBand ?? "other";
    groups.set(band, [...(groups.get(band) ?? []), model]);
  }
  return BAND_ORDER.flatMap((band) => {
    const models = groups.get(band);
    return models?.length ? [{ band, models: [...models].sort((a, b) => modelLabel(a).localeCompare(modelLabel(b))) }] : [];
  });
}

/** Auto, the model every message goes to, when the console publishes it. */
export function autoModel(pricing: RedrobPricing): RedrobModelPricing | null {
  const byId = pricing.autoModelId ? pricing.byModelId[pricing.autoModelId] : undefined;
  return byId ?? Object.values(pricing.byModelId).find((model) => model.routed) ?? null;
}

/** The usage profile the per-request column uses: the first the console defines. */
export function guideProfile(pricing: RedrobPricing) {
  return pricing.costProfiles[0] ?? null;
}

/** Model count, for the header. */
export function guideModelCount(pricing: RedrobPricing): number {
  return guideGroups(pricing).reduce((total, group) => total + group.models.length, 0);
}
