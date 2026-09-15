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
};

export type RedrobModelPricing = {
  id: string;
  /** USD per million tokens, as the console publishes them. */
  inputPricePerMillionUsd?: number;
  outputPricePerMillionUsd?: number;
  /** Rate applied past `shortContextTokens`, when the console charges one. */
  longContextInputPricePerMillionUsd?: number;
  longContextOutputPricePerMillionUsd?: number;
  /** Price relative to the `auto` router, which is the 1x baseline. */
  inputMultiplier?: number;
  outputMultiplier?: number;
  capabilities: RedrobModelCapabilities;
};

export type RedrobPricing = {
  /** Which model id the router bills as. */
  autoModelId?: string;
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
  return {
    shortContextTokens: asPositiveNumber(value.shortContextTokens),
    maxContextTokens: asPositiveNumber(value.maxContextTokens),
    thinkingLevels: levels,
    ...(typeof value.fastMode === "boolean" ? { fastMode: value.fastMode } : {}),
    ...(typeof value.requiresProviderDataShare === "boolean"
      ? { requiresProviderDataShare: value.requiresProviderDataShare }
      : {}),
  };
}

/** Parse the console's pricing response. Malformed entries are skipped. */
export function parseRedrobPricing(payload: unknown): RedrobPricing {
  if (!isRecord(payload)) return { byModelId: {} };

  const byModelId: Record<string, RedrobModelPricing> = {};
  const models = Array.isArray(payload.models) ? payload.models : [];

  for (const entry of models) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) continue;
    byModelId[id] = {
      id,
      inputPricePerMillionUsd: asPositiveNumber(entry.inputPricePerMillionUsd),
      outputPricePerMillionUsd: asPositiveNumber(entry.outputPricePerMillionUsd),
      longContextInputPricePerMillionUsd: asPositiveNumber(entry.longContextInputPricePerMillionUsd),
      longContextOutputPricePerMillionUsd: asPositiveNumber(entry.longContextOutputPricePerMillionUsd),
      inputMultiplier: asPositiveNumber(entry.inputMultiplier),
      outputMultiplier: asPositiveNumber(entry.outputMultiplier),
      capabilities: parseCapabilities(entry.capabilities),
    };
  }

  return {
    ...(typeof payload.autoModelId === "string" ? { autoModelId: payload.autoModelId } : {}),
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
 * Cheap or expensive, as a glanceable tier rather than a number to interpret.
 *
 * A rate of `$5 / $25` per million tokens tells a reader nothing unless they
 * already know what a token costs, and the multiplier ("8.3x") only helps once
 * they know what the baseline is. The tier says the same thing in a shape that
 * survives a glance: one `$` is the `auto` baseline or cheaper, and each further
 * `$` is another order of expense above it.
 *
 * Thresholds are deliberately coarse -- 2x and 6x -- because the honest claim is
 * "about the same / noticeably more / a lot more", not a precise ranking. Returns
 * `null` when the multiplier is unknown, so a missing catalogue entry renders
 * nothing instead of a misleading `$`.
 */
export function priceTier(pricing: RedrobModelPricing | undefined): 1 | 2 | 3 | null {
  const worst = Math.max(pricing?.inputMultiplier ?? 0, pricing?.outputMultiplier ?? 0);
  if (!worst) return null;
  if (worst < 2) return 1;
  if (worst < 6) return 2;
  return 3;
}

/** `$` / `$$` / `$$$` for the tier above, or `null` when it is unknown. */
export function formatPriceTier(pricing: RedrobModelPricing | undefined): string | null {
  const tier = priceTier(pricing);
  return tier === null ? null : "$".repeat(tier);
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
