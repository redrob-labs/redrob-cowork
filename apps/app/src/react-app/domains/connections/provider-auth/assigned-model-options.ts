import type { ModelOption } from "@/app/types";

/**
 * Merge the live workspace model catalog over a fallback list, keyed by
 * provider + model. `primary` wins so a fresh catalog entry replaces a stale
 * fallback for the same model instead of appearing twice.
 */
export function mergeModelOptions(
  primary: readonly ModelOption[],
  fallback: readonly ModelOption[],
): ModelOption[] {
  const merged = new Map<string, ModelOption>();
  for (const option of fallback) {
    merged.set(`${option.providerID}:${option.modelID}`, option);
  }
  for (const option of primary) {
    merged.set(`${option.providerID}:${option.modelID}`, option);
  }
  return [...merged.values()];
}
