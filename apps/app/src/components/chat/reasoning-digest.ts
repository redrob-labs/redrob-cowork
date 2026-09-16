/**
 * One human-readable line describing where the model's thinking has got to.
 *
 * The reasoning block was already collapsed behind a bare "Thinking… / Thought" label, which says that
 * thinking is happening and nothing about what. Opening it shows the model's raw trace: code, paths, tool
 * arguments, half-formed plans. A reader who wants to know whether the run is on the right track has to
 * read that, and it is not written for them.
 *
 * This derives the line from the trace that already arrived. No extra model call, so nothing here costs
 * the user anything and there is no second summary that can disagree with the original -- a summarising
 * call would produce one, and when the two differ the reader believes the summary.
 *
 * The whole module is pure string work on purpose: the rules below are the entire feature, and none of
 * them was checkable while the label was a ternary inside a component.
 */

/** Longest line we will show. Past this the row wraps and stops reading as a status. */
export const DIGEST_MAX_CHARS = 90

/**
 * A sentence needs this many letters to be worth showing.
 *
 * Counted as LETTERS rather than characters so that `if (x) { return }` and `src/foo/bar.ts:14` do not
 * qualify on length alone. Korean and Latin both count, since both are prose to the reader.
 */
const MIN_LETTERS = 12

/**
 * Above this share of non-prose characters a candidate is treated as code, not a sentence.
 *
 * 0.18 was picked against real traces: prose with a path or an identifier in it stays under, while an
 * expression, a JSON fragment, or a shell line goes over. It is a heuristic and it is meant to be one --
 * the cost of being wrong is a slightly worse line, never a wrong claim, because the text shown is always
 * the model's own words.
 */
const MAX_SYMBOL_RATIO = 0.18

const SYMBOLS = /[{}()[\]<>=+*/\\|`~@#$%^&_;:"']/g
const LETTERS = /[\p{L}]/gu
/** Hangul, Han, Hiragana, Katakana -- the scripts that write without spaces. */
const CJK = /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

/** Fenced blocks, inline spans, and indented code. Removed whole rather than trimmed. */
function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    // An unclosed fence means the model is still writing code, so drop everything after it.
    .replace(/```[\s\S]*$/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/^[ \t]{4,}\S.*$/gm, " ")
}

/**
 * Split into candidate sentences.
 *
 * Newlines count as boundaries as well as `.!?`, because a reasoning trace is often a list of short lines
 * with no terminal punctuation at all. Korean sentences frequently end in `다.` which the `.` already
 * covers; `。` and `！` are included for models that emit full-width punctuation.
 */
function candidates(text: string): string[] {
  return stripCode(text)
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((line) => line.replace(/^[\s>*\-#\d.)]+/, "").trim())
    .filter((line) => line.length > 0)
}

function looksLikeProse(line: string): boolean {
  const letters = (line.match(LETTERS) ?? []).length
  if (letters < MIN_LETTERS) return false
  const symbols = (line.match(SYMBOLS) ?? []).length
  if (symbols / line.length > MAX_SYMBOL_RATIO) return false
  /*
   * A line that is mostly one long token is an identifier, a path, or a URL, whatever its length.
   *
   * The discriminator is whether the line contains CJK, NOT whether it contains spaces. An earlier version
   * skipped this rule for any line without spaces, so that Korean would survive -- and that let
   * `DEFAULT_COMPACTION_THRESHOLD_PERCENT` and `src/session/overflow.ts:14` through as sentences, because
   * they have no spaces either. Korean and Japanese write without spaces; a Latin line without a single
   * space is one token and never a sentence.
   */
  if (!CJK.test(line)) {
    if (!line.includes(" ")) return false
    const longest = Math.max(...line.split(/\s+/).map((token) => token.length))
    if (longest > line.length * 0.5) return false
  }
  return true
}

/** Truncate without cutting a word in half where the script has words to cut. */
function clip(line: string): string {
  if (line.length <= DIGEST_MAX_CHARS) return line
  const cut = line.slice(0, DIGEST_MAX_CHARS)
  const lastSpace = cut.lastIndexOf(" ")
  // Only honour a word boundary if it is near the end; otherwise a long first word would gut the line.
  // CJK has no spaces, so `lastSpace` is -1 there and the hard cut is correct.
  const base = lastSpace > DIGEST_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${base.trimEnd()}…`
}

/**
 * The line to show beside "Thinking…" / "Thought", or null when the trace has nothing readable in it.
 *
 * Returns the LAST qualifying sentence, not the first. While streaming that is where the model is now,
 * which is the point of a progress line; once finished it is the conclusion it reached, which is more
 * use than the opening restatement of the task.
 *
 * null is a real answer and the caller must render the bare label for it. A trace that is entirely code
 * has no human line in it, and inventing one would mean describing work we did not read.
 */
export function reasoningDigest(text: string): string | null {
  if (!text.trim()) return null
  const lines = candidates(text)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (line !== undefined && looksLikeProse(line)) return clip(line)
  }
  return null
}
