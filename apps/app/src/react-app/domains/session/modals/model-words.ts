/**
 * The model list in words rather than in figures.
 *
 * The list was written for engineers: price bands, "1M context", a dollar figure per coding turn, and a
 * strip of capability icons. Someone choosing between models wants to know what a model is for, roughly
 * what it costs, and how much it can read, in terms they already use. The figures are still one switch
 * away, in the technical view.
 */
import { t } from "@/i18n";
import type { RedrobPriceBand } from "../../../../app/lib/redrob-pricing";
import type { ModelRow } from "./model-table";

const BAND_WORD_KEYS: Record<RedrobPriceBand, string> = {
  budget: "model_words.band_budget",
  standard: "model_words.band_standard",
  premium: "model_words.band_premium",
  frontier: "model_words.band_frontier",
};

const BAND_SUMMARY_KEYS: Record<RedrobPriceBand, string> = {
  budget: "model_words.summary_budget",
  standard: "model_words.summary_standard",
  premium: "model_words.summary_premium",
  frontier: "model_words.summary_frontier",
};

/** "Lowest cost", "Everyday"... for a band, or null when the console published none. */
export function bandWord(band: RedrobPriceBand | null): string | null {
  return band ? t(BAND_WORD_KEYS[band]) : null;
}

/**
 * Roughly what one short question costs, as a person would say it.
 *
 * Rounded on purpose: "under 1¢" and "about 7¢" are what a reader compares, and four decimals of a
 * dollar claim a precision the estimate does not have. Priced on the console's `chat` profile, a short
 * question and a couple of paragraphs back.
 */
export function questionCost(costUsd: number | null): string | null {
  if (costUsd === null || !Number.isFinite(costUsd) || costUsd < 0) return null;
  const cents = costUsd * 100;
  // Below half a cent it is "under 1¢"; from there it rounds, so a premium model at 0.8¢ reads
  // "about 1¢" and does not look as cheap as a budget one at 0.05¢.
  if (cents < 0.5) return t("model_words.cost_under_cent");
  if (cents < 100) return t("model_words.cost_cents", { cents: Math.max(1, Math.round(cents)) });
  const dollars = costUsd < 10 ? Math.round(costUsd * 10) / 10 : Math.round(costUsd);
  return t("model_words.cost_dollars", { dollars });
}

/** A page is about 650 tokens, a book about 100,000. Close enough to compare models by. */
const TOKENS_PER_PAGE = 650;
const TOKENS_PER_BOOK = 100_000;

/** How much a model can read at once: "about 10 books", "about a book", "about 50 pages". */
export function readsAtOnce(tokens: number | null): string | null {
  if (!tokens || tokens <= 0) return null;
  if (tokens >= 2 * TOKENS_PER_BOOK) return t("model_words.reads_books", { count: Math.round(tokens / TOKENS_PER_BOOK) });
  if (tokens >= TOKENS_PER_BOOK) return t("model_words.reads_book");
  const pages = Math.max(10, Math.round(tokens / TOKENS_PER_PAGE / 10) * 10);
  return t("model_words.reads_pages", { count: pages });
}

/** What a model can do, as short phrases, in the order a reader filters on them. */
export function abilityWords(row: Pick<ModelRow, "capabilities">): string[] {
  const words: string[] = [];
  if (row.capabilities.has("tools")) words.push(t("model_words.can_tools"));
  if (row.capabilities.has("reasoning")) words.push(t("model_words.can_reason"));
  if (row.capabilities.has("imageInput")) words.push(t("model_words.can_images"));
  if (row.capabilities.has("audioInput")) words.push(t("model_words.can_audio"));
  return words;
}

/**
 * One line on what a model is good for.
 *
 * The console's own note for a recommended model wins, because it is a recommendation somebody wrote.
 * Every other model gets a sentence built from facts the console publishes about it: its price band and
 * how much it reads. It never claims quality the facts do not support.
 */
export function goodFor(row: Pick<ModelRow, "isAuto" | "priceBand" | "contextTokens">, note?: string): string {
  if (note) return note;
  if (row.isAuto) return t("model_select.note_auto");
  const lead = row.priceBand ? t(BAND_SUMMARY_KEYS[row.priceBand]) : t("model_words.summary_unknown");
  if (row.contextTokens && row.contextTokens >= 500_000) return `${lead} ${t("model_words.summary_long")}`;
  return lead;
}
