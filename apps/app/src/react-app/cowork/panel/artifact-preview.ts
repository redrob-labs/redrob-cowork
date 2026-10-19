/**
 * The short plain-text preview an artifact row shows under its name: two lines that are never cut
 * off with "...". The preview is built to end cleanly instead of being clipped by CSS: markdown syntax is stripped, a leading heading that
 * only repeats the file's title is skipped, and the text is cut on a whole sentence when one fits
 * the budget, otherwise on a whole word - never mid-word, never with an ellipsis glyph.
 */

/** About two lines of 13px text in the default 440px panel (~55 characters a line beside the icon). */
export const ARTIFACT_PREVIEW_BUDGET = 104;

/** YAML front matter at the very start, with LF or CRLF line endings. */
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
/** `**`, `*`, `~~` and inline code spans; a backslash-escaped delimiter is literal text. */
const SYMBOL_EMPHASIS = /(?<!\\)(\*\*|\*|~~|`)(\S(?:.*?\S)?)(?<!\\)\1/g;
/** `__` and `_` only at word edges, so `snake_case` identifiers survive. */
const UNDERSCORE_EMPHASIS = /(?<![\w\\])(__|_)(\S(?:.*?\S)?)(?<!\\)\1(?!\w)/g;

/** Pure: strips emphasis delimiters until none remain (nested emphasis peels one layer a pass). */
function stripEmphasis(text: string): string {
  let previous;
  do {
    previous = text;
    text = text.replace(SYMBOL_EMPHASIS, "$2").replace(UNDERSCORE_EMPHASIS, "$2");
  } while (text !== previous);
  return text.replace(/\\([\\`*_~])/g, "$1");
}

/** Pure: markdown to one line of plain reading text. */
export function plainMarkdown(text: string): string {
  return stripEmphasis(
    text
      .replace(FRONT_MATTER, "")
      .replace(/```[\s\S]*?```/g, " ") // code blocks
      .replace(/^\s*\|.*\|\s*$/gm, " ") // table rows
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links keep their text
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "") // heading, quote and list markers
      .replace(/^\s*([-*_]\s*){3,}$/gm, " "), // rules
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Pure: the first line of a markdown text, if it is a heading, as plain text ("" otherwise). */
function leadingHeading(text: string): string {
  const first = text.replace(FRONT_MATTER, "").split(/\r?\n/).find((line) => line.trim()) ?? "";
  return /^\s{0,3}#{1,6}\s+/.test(first) ? plainMarkdown(first) : "";
}

/**
 * Pure: the preview for a file's text, at most `budget` characters, ending on a sentence or a whole
 * word. A leading heading is dropped: it is the document's own title, and the row already shows
 * the file's name above. "" when the file has no readable text.
 */
export function artifactPreview(text: string, budget = ARTIFACT_PREVIEW_BUDGET): string {
  let plain = plainMarkdown(text);
  const heading = leadingHeading(text);
  if (heading && plain.startsWith(heading)) plain = plain.slice(heading.length).trim();
  if (plain.length <= budget) return plain;
  const window = plain.slice(0, budget + 1);
  // The longest run of whole sentences that fits, when it is not too short to be useful.
  const sentence = [...window.matchAll(/[.!?\u3002](?=\s|$)/g)].map((match) => match.index ?? -1).filter((index) => index > 0).pop();
  if (sentence !== undefined && sentence >= budget * 0.45) return plain.slice(0, sentence + 1);
  const space = window.lastIndexOf(" ");
  const cut = space > 0 ? plain.slice(0, space) : plain.slice(0, budget);
  return cut.replace(/[\s,;:\u2013\u2014-]+$/, "");
}
