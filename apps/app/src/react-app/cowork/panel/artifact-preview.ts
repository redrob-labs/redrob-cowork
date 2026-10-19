/**
 * Round 10 (R6): the short plain-text preview an artifact row shows under its name.
 *
 * Felix: a 2-line preview that is NOT cut off at the end with "...". So the preview is built to
 * end cleanly instead of being clipped by CSS: markdown syntax is stripped, a leading heading that
 * only repeats the file's title is skipped, and the text is cut on a whole sentence when one fits
 * the budget, otherwise on a whole word - never mid-word, never with an ellipsis glyph.
 */

/** About two lines of 13px text in the default 440px panel (~55 characters a line beside the icon). */
export const ARTIFACT_PREVIEW_BUDGET = 104;

/** Pure: markdown to one line of plain reading text. */
export function plainMarkdown(text: string): string {
  return text
    .replace(/^---\n[\s\S]*?\n---\n?/, "") // front matter
    .replace(/```[\s\S]*?```/g, " ") // code blocks
    .replace(/^\s*\|.*\|\s*$/gm, " ") // table rows
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links keep their text
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "") // heading, quote and list markers
    .replace(/(\*\*|__|\*|_|~~|`)(\S(?:.*?\S)?)\1/g, "$2") // emphasis and inline code
    .replace(/^\s*([-*_]\s*){3,}$/gm, " ") // rules
    .replace(/\s+/g, " ")
    .trim();
}

/** Pure: the first line of a markdown text, if it is a heading, as plain text ("" otherwise). */
function leadingHeading(text: string): string {
  const first = text.replace(/^---\n[\s\S]*?\n---\n?/, "").split(/\r?\n/).find((line) => line.trim()) ?? "";
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
