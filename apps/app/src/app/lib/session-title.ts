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

/** Round 9: a stored chat title as lists should show it: "" for a block marker, so they fall back. */
export function shownChatTitle(title: string | null | undefined): string {
  return title && !isBlockMarkerTitle(title) ? title : "";
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

/** Round 10: most words a chat title may have (Felix: "fewer than 7 words max"). */
export const CHAT_TITLE_MAX_WORDS = 6;

/**
 * Round 10: openers that say what to do rather than what it is about ("Deep research, deep think
 * and tell me ..."). Stripped from the front of a prompt, repeatedly, before it becomes a title.
 */
const PROMPT_FILLER = [
  /^(please|pls|hey|hi|ok|okay|so)\b[\s,]*/i,
  /^(can|could|would|will) you\b[\s,]*/i,
  /^i (want|need|would like|'d like) (you )?to\b[\s,]*/i,
  /^(help me|let's|lets)\b[\s,]*/i,
  /^(deep[- ]?research|deep[- ]?think|research|think hard|think deeply|investigate|analy[sz]e|look into|dig into)\b[\s,]*(and\b[\s,]*)?/i,
  /^(tell|show|give|explain to|walk) (me|us)\b[\s,]*/i,
  /^(write|draft|create|make|prepare|put together|build|produce)\b( me)?( up)?\s+(a|an|the|some)?\s*((short|brief|quick|detailed|full|long|one-page|1-page)\s+)*(brief|memo|report|summary|note|doc|document|draft|overview|analysis|plan|forecast|essay|article|post|email|deck)?\b[\s,]*/i,
  /^(where|what|how|why|when|whether|if) ((do|does|did|would|will|should|could|can|is|are) )?(you|we|i) (predict|think|expect|see|say|believe)\b[\s,]*/i,
  /^(on|about|regarding|for|of|that|the|a|an)\b\s+/i,
];

/**
 * Round 10: a short chat title made by rule from the person's first prompt: filler openers dropped,
 * the first clause kept, capped at CHAT_TITLE_MAX_WORDS words, first letter capitalised, no
 * ellipsis. It shows until the AI-written title lands, and stays when that request fails.
 * Falls back to the plain first-line title when stripping leaves nothing.
 */
export function shortTitleFromPrompt(prompt: string): string {
  const firstLine = prompt.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  let text = firstLine.replace(/\s+/g, " ");
  for (let pass = 0; pass < 8; pass += 1) {
    const before = text;
    for (const filler of PROMPT_FILLER) text = text.replace(filler, "");
    if (text === before) break;
  }
  // First clause only: a sentence end, a colon or semicolon, or an em/en dash ends it.
  text = text.split(/(?<=[a-z0-9\uac00-\ud7a3)])[.?!;:]\s|\s[\u2013\u2014-]\s/i)[0] ?? text;
  const words = text.replace(/[\s.,;:!?~\u2026]+$/, "").split(" ").filter(Boolean).slice(0, CHAT_TITLE_MAX_WORDS);
  while (words.length > 1 && /^(and|or|the|a|an|of|to|in|on|for|with|by|at|from|vs)$/i.test(words[words.length - 1] ?? "")) words.pop();
  const short = words.join(" ").replace(/[\s,;:]+$/, "");
  if (!short) return titleFromPrompt(prompt);
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/**
 * Round 10: the title an AI naming request answered with, cleaned: first line of plain text, no
 * fences, quotes, markdown or "Title:" label, no closing punctuation. "" when the answer is not a
 * usable title (empty, a Cowork block, JSON, or longer than CHAT_TITLE_MAX_WORDS + 1 words), so the
 * caller keeps the rule-made title.
 */
export function cleanGeneratedTitle(answer: string): string {
  if (/```|~~~|redrob-|[{}]/.test(answer)) return "";
  const line = answer.split(/\r?\n/).map((entry) => entry.trim()).find(Boolean) ?? "";
  const text = line
    .replace(/^(#+|\*+|-)\s*/, "")
    .replace(/^(chat )?title\s*[:\-]\s*/i, "")
    .replace(/^["'\u201c\u2018*_`]+|["'\u201d\u2019*_`]+$/g, "")
    .replace(/[\s.,;:!~\u2026]+$/, "")
    .trim();
  if (!text) return "";
  const count = text.split(/\s+/).length;
  if (count > CHAT_TITLE_MAX_WORDS + 1) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Round 10: whether a stored title was made from the prompt itself rather than chosen: a block
 * marker, the default title, or the prompt's own opening words (any trailing "~", "..." or "\u2026"
 * ignored). A title the person typed in Rename is none of these, so it is never replaced.
 */
export function isPromptDerivedTitle(title: string | null | undefined, prompt: string): boolean {
  const trimmed = title?.trim() ?? "";
  if (!trimmed || isBlockMarkerTitle(trimmed) || isGeneratedSessionTitle(trimmed) || trimmed === DEFAULT_SESSION_TITLE) return true;
  const norm = (value: string) => value.toLowerCase().replace(/[\s~.\u2026]+$/, "").replace(/\s+/g, " ").trim();
  const head = norm(trimmed);
  return head.length > 0 && norm(prompt).startsWith(head);
}
