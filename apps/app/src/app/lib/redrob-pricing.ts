/**
 * Redrob console pricing and per-model capabilities.
 *
 * The engine reports Redrob models with `cost: { input: 0, output: 0 }` and one
 * flat context limit for every model — placeholders, not prices. Rendering those
 * would state that every model is free, so price and capability labels come
 * from the console's own catalog instead.
 *
 * `GET {REDROB_BASE_URL}/pricing` is unauthenticated, so this needs no API key
 * and leaks nothing. Every field is optional in practice: a response that omits
 * one produces no label rather than a zero.
 */

import { REDROB_BASE_URL } from "@/react-app/domains/settings/redrob-provider";

export const REDROB_PRICING_URL = `${REDROB_BASE_URL}/pricing`;

export type RedrobModelCapabilities = {
  shortContextTokens?: number;
  maxContextTokens?: number;
  thinkingLevels: string[];
  fastMode?: boolean;
  requiresProviderDataShare?: boolean;
  /** Added by the console alongside the strengths copy. */
  tools?: boolean;
  structuredOutputs?: boolean;
  maxOutputTokens?: number;
  imageInput?: boolean;
  audioInput?: boolean;
  fileInput?: boolean;
  videoInput?: boolean;
  imageOutput?: boolean;
  audioOutput?: boolean;
};

/**
 * How expensive a model is, as the console itself classifies it.
 *
 * This replaces a tier the app used to derive from the price multiplier. The
 * console is the party that knows -- it sets the rates -- and a band it publishes
 * cannot drift from its own pricing the way a local threshold does. Four bands,
 * cheapest first. `auto` publishes none, because a router has no single rate.
 */
export type RedrobPriceBand = "budget" | "standard" | "premium" | "frontier";

const PRICE_BANDS: readonly RedrobPriceBand[] = ["budget", "standard", "premium", "frontier"];

/**
 * What one realistic request costs, per usage profile the console defines
 * (`costProfiles` in the same response). This is the number a reader actually
 * wants: a rate per million tokens is not something anyone can convert in their
 * head.
 */
export type RedrobEstimatedCost = {
  /** Profile id, matching one of RedrobPricing.costProfiles. */
  profile: string;
  costUsd: number;
  /** How many such requests a dollar buys. */
  requestsPerDollar?: number;
};

/** A usage profile the estimates are computed against. */
export type RedrobCostProfile = {
  id: string;
  label: string;
  description?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type RedrobModelPricing = {
  id: string;
  /** The console's own display label for the model. */
  label?: string;
  /** USD per million tokens, as the console publishes them. */
  inputPricePerMillionUsd?: number;
  outputPricePerMillionUsd?: number;
  /** Rate applied past `shortContextTokens`, when the console charges one. */
  longContextInputPricePerMillionUsd?: number;
  longContextOutputPricePerMillionUsd?: number;
  /** Price relative to the `auto` router, which is the 1x baseline. */
  inputMultiplier?: number;
  outputMultiplier?: number;
  /** The console's own cheap-to-expensive classification. */
  priceBand?: RedrobPriceBand;
  /** What one request costs, per usage profile. */
  estimatedCosts: RedrobEstimatedCost[];
  /**
   * Plain-language strengths, written by the console, e.g. "tool calling",
   * "image input", "adjustable reasoning (low, medium, high)". Rendered as
   * published rather than re-worded here: this is the console's claim about its
   * own models, and paraphrasing it in the client is how the two end up
   * disagreeing.
   */
  strengths: string[];
  /** True for the router itself, which has no single upstream model. */
  routed?: boolean;
  capabilities: RedrobModelCapabilities;
};

export type RedrobPricing = {
  /** Which model id the router bills as. */
  autoModelId?: string;
  /** Usage profiles the per-request estimates are computed against. */
  costProfiles: RedrobCostProfile[];
  byModelId: Record<string, RedrobModelPricing>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseCapabilities(value: unknown): RedrobModelCapabilities {
  if (!isRecord(value)) return { thinkingLevels: [] };
  const levels = Array.isArray(value.thinkingLevels)
    ? value.thinkingLevels.filter((level): level is string => typeof level === "string")
    : [];
  const flag = (key: string) =>
    typeof value[key] === "boolean" ? { [key]: value[key] as boolean } : {};
  return {
    shortContextTokens: asPositiveNumber(value.shortContextTokens),
    maxContextTokens: asPositiveNumber(value.maxContextTokens),
    maxOutputTokens: asPositiveNumber(value.maxOutputTokens),
    thinkingLevels: levels,
    ...flag("fastMode"),
    ...flag("requiresProviderDataShare"),
    ...flag("tools"),
    ...flag("structuredOutputs"),
    ...flag("imageInput"),
    ...flag("audioInput"),
    ...flag("fileInput"),
    ...flag("videoInput"),
    ...flag("imageOutput"),
    ...flag("audioOutput"),
  };
}

function parsePriceBand(value: unknown): RedrobPriceBand | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return PRICE_BANDS.find((band) => band === normalized);
}

function parseEstimatedCosts(value: unknown): RedrobEstimatedCost[] {
  if (!Array.isArray(value)) return [];
  const costs: RedrobEstimatedCost[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const profile = typeof entry.profile === "string" ? entry.profile.trim() : "";
    const costUsd = asPositiveNumber(entry.costUsd);
    if (!profile || costUsd === undefined) continue;
    costs.push({
      profile,
      costUsd,
      ...(asPositiveNumber(entry.requestsPerDollar) !== undefined
        ? { requestsPerDollar: asPositiveNumber(entry.requestsPerDollar) }
        : {}),
    });
  }
  return costs;
}

function parseCostProfiles(value: unknown): RedrobCostProfile[] {
  if (!Array.isArray(value)) return [];
  const profiles: RedrobCostProfile[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) continue;
    profiles.push({
      id,
      label: typeof entry.label === "string" ? entry.label : id,
      ...(typeof entry.description === "string" ? { description: entry.description } : {}),
      inputTokens: asPositiveNumber(entry.inputTokens),
      outputTokens: asPositiveNumber(entry.outputTokens),
    });
  }
  return profiles;
}

function parseStrengths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Parse the console's pricing response. Malformed entries are skipped. */
export function parseRedrobPricing(payload: unknown): RedrobPricing {
  if (!isRecord(payload)) return { byModelId: {}, costProfiles: [] };

  const byModelId: Record<string, RedrobModelPricing> = {};
  const models = Array.isArray(payload.models) ? payload.models : [];

  for (const entry of models) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) continue;
    byModelId[id] = {
      id,
      ...(typeof entry.label === "string" && entry.label.trim() ? { label: entry.label.trim() } : {}),
      inputPricePerMillionUsd: asPositiveNumber(entry.inputPricePerMillionUsd),
      outputPricePerMillionUsd: asPositiveNumber(entry.outputPricePerMillionUsd),
      longContextInputPricePerMillionUsd: asPositiveNumber(entry.longContextInputPricePerMillionUsd),
      longContextOutputPricePerMillionUsd: asPositiveNumber(entry.longContextOutputPricePerMillionUsd),
      inputMultiplier: asPositiveNumber(entry.inputMultiplier),
      outputMultiplier: asPositiveNumber(entry.outputMultiplier),
      ...(parsePriceBand(entry.priceBand) ? { priceBand: parsePriceBand(entry.priceBand) } : {}),
      estimatedCosts: parseEstimatedCosts(entry.estimatedCosts),
      strengths: parseStrengths(entry.strengths),
      ...(typeof entry.routed === "boolean" ? { routed: entry.routed } : {}),
      capabilities: parseCapabilities(entry.capabilities),
    };
  }

  return {
    ...(typeof payload.autoModelId === "string" ? { autoModelId: payload.autoModelId } : {}),
    costProfiles: parseCostProfiles(payload.costProfiles),
    byModelId,
  };
}

/** Fetch and parse the console catalog. Throws on a non-2xx response. */
export async function fetchRedrobPricing(
  fetchImpl: typeof fetch = fetch,
): Promise<RedrobPricing> {
  const response = await fetchImpl(REDROB_PRICING_URL, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Redrob pricing request failed: ${response.status}`);
  }
  return parseRedrobPricing(await response.json());
}

/** `$5` / `$0.60` — trailing zeros dropped, cents kept when they matter. */
export function formatUsdPerMillion(price: number | undefined): string | null {
  if (price === undefined) return null;
  const rounded = Math.round(price * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return `$${text}`;
}

/**
 * `$5 / $25` — input then output, per million tokens. Returns `null` unless BOTH
 * sides are known: half a price is worse than none, since a reader cannot tell
 * which half they are looking at.
 */
export function formatModelPriceRange(pricing: RedrobModelPricing | undefined): string | null {
  const input = formatUsdPerMillion(pricing?.inputPricePerMillionUsd);
  const output = formatUsdPerMillion(pricing?.outputPricePerMillionUsd);
  if (!input || !output) return null;
  return `${input} / ${output}`;
}

/** `200K` / `1M` — token counts a human can compare at a glance. */
export function formatTokenCount(tokens: number | undefined): string | null {
  if (tokens === undefined || tokens <= 0) return null;
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

/**
 * Relative price against the `auto` baseline, e.g. `8.3x`. This is what answers
 * "is this one expensive?" without the reader doing arithmetic. Returns `null`
 * for the baseline itself and for anything under 1.05x, where the label would
 * be noise.
 */
export function formatPriceMultiplier(pricing: RedrobModelPricing | undefined): string | null {
  const input = pricing?.inputMultiplier;
  const output = pricing?.outputMultiplier;
  const worst = Math.max(input ?? 0, output ?? 0);
  if (!worst || worst < 1.05) return null;
  const rounded = Math.round(worst * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}x`;
}

/**
 * Cheap or expensive, from the console's own classification.
 *
 * This used to be derived locally from the price multiplier with 2x and 6x
 * thresholds. The console now publishes the band, and it is the party that sets
 * the rates -- a threshold in the client is a second opinion that goes stale the
 * moment pricing moves. The multiplier fallback stays for a model the console has
 * banded but priced relative to Auto only, and `auto` itself has no band at all,
 * because a router has no single rate.
 */
export function priceTier(pricing: RedrobModelPricing | undefined): 1 | 2 | 3 | 4 | null {
  const band = pricing?.priceBand;
  if (band) return (PRICE_BANDS.indexOf(band) + 1) as 1 | 2 | 3 | 4;
  const worst = Math.max(pricing?.inputMultiplier ?? 0, pricing?.outputMultiplier ?? 0);
  if (!worst) return null;
  if (worst < 2) return 1;
  if (worst < 6) return 2;
  return 3;
}

/** `$` … `$$$$` for the tier above, or `null` when it is unknown. */
export function formatPriceTier(pricing: RedrobModelPricing | undefined): string | null {
  const tier = priceTier(pricing);
  return tier === null ? null : "$".repeat(tier);
}

/**
 * A dollar amount for one request, formatted so small numbers survive.
 *
 * The per-million formatter rounds to cents, which is right for a rate like
 * `$0.60` and wrong here: a short question can cost $0.0004, and cents precision
 * would print `$0.00` — a claim that it is free. So precision follows magnitude,
 * down to four decimals.
 */
export function formatUsdAmount(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || value < 0) return null;
  if (value === 0) return "$0";
  const digits = value < 0.01 ? 4 : value < 1 ? 3 : 2;
  return `$${value.toFixed(digits)}`;
}

/** The estimate for one profile id, e.g. `chat`. */
export function estimatedCostFor(
  pricing: RedrobModelPricing | undefined,
  profileId: string,
): RedrobEstimatedCost | undefined {
  return pricing?.estimatedCosts.find((cost) => cost.profile === profileId);
}

/**
 * The reasoning levels a model actually offers, e.g. `low · medium · high`.
 *
 * The rows used to collapse this to the word "reasoning", which answers whether
 * the feature exists but not what the user can pick, and the levels were already
 * in the catalogue response being thrown away.
 */
export function formatThinkingLevels(pricing: RedrobModelPricing | undefined): string | null {
  const levels = pricing?.capabilities.thinkingLevels ?? [];
  if (levels.length === 0) return null;
  return levels.join(" · ");
}
