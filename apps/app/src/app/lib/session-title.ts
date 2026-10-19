import { t } from "../../i18n";

/** Raw English string — used for prefix matching against stored titles. */
export const DEFAULT_SESSION_TITLE = "New session";

const GENERATED_SESSION_TITLE_PREFIX = `${DEFAULT_SESSION_TITLE} - `;

export function isGeneratedSessionTitle(title: string | null | undefined) {
  const trimmed = title?.trim() ?? "";
  if (!trimmed.startsWith(GENERATED_SESSION_TITLE_PREFIX)) return false;
  const suffix = trimmed.slice(GENERATED_SESSION_TITLE_PREFIX.length).trim();
  return Boolean(suffix) && Number.isFinite(Date.parse(suffix));
}

export function getDisplaySessionTitle(
  title: string | null | undefined,
  fallback?: string,
) {
  const trimmed = title?.trim() ?? "";
  if (!trimmed || isGeneratedSessionTitle(trimmed) || isBlockMarkerTitle(trimmed)) return fallback ?? t("session.default_title");
  return trimmed;
}

/**
 * Round 9: a title that is really the opening line of a fenced Cowork block. Since round 8b the
 * Plan agent's first reply is a `redrob-questions` block, and the server's title step can pick up
 * its fence line ("```redrob-questions") as the chat's name. Such a title is never shown.
 */
export function isBlockMarkerTitle(title: string | null | undefined): boolean {
  const trimmed = title?.trim() ?? "";
  if (!trimmed) return false;
  if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) return true;
  return /^`{0,3}\s*redrob-[a-z-]+\s*`{0,3}$/i.test(trimmed);
}

/** Longest chat title derived from a prompt, in characters. */
const PROMPT_TITLE_MAX = 60;

/**
 * Round 9: a chat title made from the person's first prompt, used to replace a block-marker title.
 * First line only, whitespace collapsed, trailing punctuation dropped, cut on a word boundary with
 * an ellipsis past PROMPT_TITLE_MAX. Empty in, empty out.
 */
export function titleFromPrompt(prompt: string): string {
  const firstLine = prompt.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  const text = firstLine.replace(/\s+/g, " ").replace(/[\s.,;:!?]+$/, "");
  if (!text) return "";
  const capped = text.charAt(0).toUpperCase() + text.slice(1);
  if (capped.length <= PROMPT_TITLE_MAX) return capped;
  const cut = capped.slice(0, PROMPT_TITLE_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > PROMPT_TITLE_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "")}\u2026`;
}
