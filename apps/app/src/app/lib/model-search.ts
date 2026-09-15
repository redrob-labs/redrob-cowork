/**
 * Model search matching, shared by the composer model popover and the full
 * model picker so both answer the same query the same way.
 *
 * The old behaviour tested one contiguous substring against each field in
 * isolation, so a user who typed the name they SEE — provider then model,
 * "Redrob Auto" — matched nothing: no single field holds both words. Matching
 * is per token against one haystack instead, which makes provider+model,
 * vendor+model, and out-of-order queries all resolve.
 */

import { inferModelVendor } from "./model-vendor";

export type ModelSearchTarget = {
  providerID: string;
  modelID: string;
  title: string;
  description?: string;
};

/** Lowercased text a query is matched against. */
export function modelSearchHaystack(option: ModelSearchTarget): string {
  const vendor = inferModelVendor(option.modelID);
  return [
    option.description ?? "",
    option.title,
    option.providerID,
    option.modelID,
    `${option.providerID}/${option.modelID}`,
    vendor?.name ?? "",
    vendor?.id ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * True when every whitespace-separated token in `query` appears in the option's
 * haystack. An empty query matches everything.
 */
export function matchesModelQuery(option: ModelSearchTarget, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = modelSearchHaystack(option);
  return tokens.every((token) => haystack.includes(token));
}
