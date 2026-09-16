/**
 * The model picker's data model: one row per model, and the sort / filter rules over those rows.
 *
 * Kept apart from the component because this is where the behaviour the old picker got wrong actually
 * lives, and none of it was testable before. The previous list nested an accordion of provider groups
 * around multi-line blocks 7-8 lines tall, repeated 323 times, with the id printed twice per row and
 * titles wrapping mid-slug. It also had no sort a reader could choose, no filter at all, and "Recent"
 * was a label over four hardcoded substrings - there is no recency store in this app.
 *
 * So a row is FLAT: every fact a reader compares models on is a field, resolved once, and the table
 * renders fields rather than re-deriving them per cell.
 */
import type { ModelOption } from "../../../../app/types";
import { inferModelVendor } from "../../../../app/lib/model-vendor";
import { matchesModelQuery } from "../../../../app/lib/model-search";
import {
  estimatedCostFor,
  priceTier,
  type RedrobPricing,
  type RedrobPriceBand,
} from "../../../../app/lib/redrob-pricing";

/** The router's own id. Pinned above every other row, always. */
export const AUTO_MODEL_ID = "auto";

/**
 * The usage profile the single cost column is quoted against.
 *
 * One number, not three: a table with a column per profile is a spreadsheet, and the question a reader
 * has while picking is "roughly what does a turn of this cost". The console publishes three profiles -
 * `chat`, `code`, `document` (apps/api/src/inference/nutrition.ts) - and `code` is the one that matches
 * what this app is for. `estimatedCostFor` returns undefined for a profile a model does not publish,
 * and the cell then says nothing rather than zero.
 */
export const COST_PROFILE_ID = "code";

export type ModelCapabilityFlag =
  | "tools"
  | "imageInput"
  | "fileInput"
  | "audioInput"
  | "structuredOutputs"
  | "reasoning";

export const CAPABILITY_FLAGS: readonly ModelCapabilityFlag[] = [
  "tools",
  "reasoning",
  "imageInput",
  "fileInput",
  "audioInput",
  "structuredOutputs",
];

export type ModelRow = {
  option: ModelOption;
  /** `provider:model`, unique per row. */
  key: string;
  modelId: string;
  providerId: string;
  title: string;
  vendorId: string;
  vendorName: string;
  isAuto: boolean;
  priceBand: RedrobPriceBand | null;
  /** 1-4, from the band, so sorting is cheap-to-expensive rather than alphabetical on a word. */
  priceRank: number | null;
  contextTokens: number | null;
  /** USD for one turn on COST_PROFILE_ID, or null when the model publishes no estimate. */
  turnCostUsd: number | null;
  capabilities: ReadonlySet<ModelCapabilityFlag>;
  /** Reasoning levels this model accepts, empty when it has none. */
  effortLevels: readonly string[];
  disabled: boolean;
};

export type ModelSortKey = "model" | "vendor" | "price" | "context" | "cost";
export type SortDirection = "asc" | "desc";
export type ModelSort = { key: ModelSortKey; direction: SortDirection };

/** Cheapest-first is the useful default: the reader is choosing what to spend. */
export const DEFAULT_MODEL_SORT: ModelSort = { key: "price", direction: "asc" };

export type ModelFilters = {
  vendors: ReadonlySet<string>;
  bands: ReadonlySet<RedrobPriceBand>;
  capabilities: ReadonlySet<ModelCapabilityFlag>;
};

export const EMPTY_FILTERS: ModelFilters = {
  vendors: new Set(),
  bands: new Set(),
  capabilities: new Set(),
};

export function isAutoOption(option: Pick<ModelOption, "modelID">): boolean {
  return option.modelID === AUTO_MODEL_ID;
}

export function buildModelRow(option: ModelOption, pricing?: RedrobPricing): ModelRow {
  const entry = pricing?.byModelId[option.modelID];
  const caps = entry?.capabilities;
  const vendor = inferModelVendor(option.modelID);
  const flags = new Set<ModelCapabilityFlag>();
  if (caps?.tools) flags.add("tools");
  if (caps?.imageInput) flags.add("imageInput");
  if (caps?.fileInput) flags.add("fileInput");
  if (caps?.audioInput) flags.add("audioInput");
  if (caps?.structuredOutputs) flags.add("structuredOutputs");
  if ((caps?.thinkingLevels?.length ?? 0) > 0) flags.add("reasoning");

  const estimate = estimatedCostFor(entry, COST_PROFILE_ID);

  return {
    option,
    key: `${option.providerID}:${option.modelID}`,
    modelId: option.modelID,
    providerId: option.providerID,
    title: option.title,
    vendorId: vendor?.id ?? "",
    vendorName: vendor?.name ?? "",
    isAuto: isAutoOption(option),
    priceBand: entry?.priceBand ?? null,
    priceRank: priceTier(entry),
    contextTokens: caps?.maxContextTokens ?? caps?.shortContextTokens ?? null,
    turnCostUsd: estimate?.costUsd ?? null,
    capabilities: flags,
    effortLevels: caps?.thinkingLevels ?? [],
    disabled: option.disabled === true,
  };
}

export function buildModelRows(options: readonly ModelOption[], pricing?: RedrobPricing): ModelRow[] {
  return options.map((option) => buildModelRow(option, pricing));
}

/**
 * The vendors present in a set of rows, with how many models each has, most models first.
 *
 * Built from the rows rather than from a fixed list so the rail never offers a filter that would empty
 * the table, and never omits a vendor the catalogue has started serving.
 */
export function vendorFacets(rows: readonly ModelRow[]): Array<{ id: string; name: string; count: number }> {
  const map = new Map<string, { id: string; name: string; count: number }>();
  for (const row of rows) {
    if (row.isAuto || !row.vendorId) continue;
    const found = map.get(row.vendorId);
    if (found) found.count += 1;
    else map.set(row.vendorId, { id: row.vendorId, name: row.vendorName || row.vendorId, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Bands present in these rows, in cheap-to-expensive order rather than alphabetical. */
export function bandFacets(rows: readonly ModelRow[]): Array<{ band: RedrobPriceBand; count: number }> {
  const order: RedrobPriceBand[] = ["budget", "standard", "premium", "frontier"];
  const counts = new Map<RedrobPriceBand, number>();
  for (const row of rows) {
    if (row.isAuto || !row.priceBand) continue;
    counts.set(row.priceBand, (counts.get(row.priceBand) ?? 0) + 1);
  }
  return order.flatMap((band) => (counts.has(band) ? [{ band, count: counts.get(band)! }] : []));
}

/**
 * Whether a row survives the rail.
 *
 * Each group is OR within itself and AND across groups, which is what a reader means by ticking two
 * vendors and one capability. An empty group is not a filter.
 *
 * `auto` is exempt: it is the router, it has no single vendor or band, and hiding it behind a filter
 * would hide the recommended choice from someone narrowing the list.
 */
export function matchesRowFilters(row: ModelRow, filters: ModelFilters): boolean {
  if (row.isAuto) return true;
  if (filters.vendors.size > 0 && !filters.vendors.has(row.vendorId)) return false;
  if (filters.bands.size > 0 && (!row.priceBand || !filters.bands.has(row.priceBand))) return false;
  for (const flag of filters.capabilities) {
    if (!row.capabilities.has(flag)) return false;
  }
  return true;
}

/** Search and rail together, so the caller cannot apply one and forget the other. */
export function visibleRows(
  rows: readonly ModelRow[],
  filters: ModelFilters,
  query: string,
): ModelRow[] {
  const trimmed = query.trim();
  return rows.filter((row) => {
    if (!matchesRowFilters(row, filters)) return false;
    if (!trimmed) return true;
    return matchesModelQuery(row.option, trimmed);
  });
}

/**
 * Missing data sorts LAST in both directions.
 *
 * A model with no published price is not cheap, and putting it above every priced model in ascending
 * order would be read as exactly that.
 */
function compareNullable(a: number | null, b: number | null, direction: SortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
}

export function compareModelRows(a: ModelRow, b: ModelRow, sort: ModelSort): number {
  const text = (x: string, y: string) =>
    sort.direction === "asc" ? x.localeCompare(y) : y.localeCompare(x);
  switch (sort.key) {
    case "model":
      return text(a.title, b.title) || a.modelId.localeCompare(b.modelId);
    case "vendor":
      return text(a.vendorName || a.vendorId, b.vendorName || b.vendorId) || a.title.localeCompare(b.title);
    case "price":
      return compareNullable(a.priceRank, b.priceRank, sort.direction) || a.title.localeCompare(b.title);
    case "context":
      return compareNullable(a.contextTokens, b.contextTokens, sort.direction) || a.title.localeCompare(b.title);
    case "cost":
      return compareNullable(a.turnCostUsd, b.turnCostUsd, sort.direction) || a.title.localeCompare(b.title);
  }
}

/**
 * `auto` first, then everything else in the chosen order.
 *
 * Pinned structurally rather than by sorting: it led the old list only by the accident of "Auto"
 * starting with an A, and any other sort buried it. It is the default and the recommendation, so it
 * does not compete for position with 322 alternatives.
 */
export function orderedRows(rows: readonly ModelRow[], sort: ModelSort): { auto: ModelRow[]; rest: ModelRow[] } {
  const auto: ModelRow[] = [];
  const rest: ModelRow[] = [];
  for (const row of rows) (row.isAuto ? auto : rest).push(row);
  rest.sort((a, b) => compareModelRows(a, b, sort));
  return { auto, rest };
}

/** Clicking the active column flips it; clicking another column starts that one ascending. */
export function nextSort(current: ModelSort, key: ModelSortKey): ModelSort {
  if (current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}
