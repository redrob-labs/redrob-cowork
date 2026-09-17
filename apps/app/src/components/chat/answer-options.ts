/**
 * Answer options a reply can offer as chips.
 *
 * The engine asks the model to end a message with one line, `[OPTIONS: a | b | c]`, when the reply
 * genuinely comes down to a few concrete answers. This is the app half: take that line off the rendered
 * text and turn it into buttons that fill the composer, reusing the chip-to-setPrompt path the task
 * suggestions and the env-var card already use.
 *
 * Parsing is deliberately strict about POSITION and lenient about content. Strict because a line that
 * merely mentions options inside a paragraph is prose, not an offer, and stripping it would delete words
 * the reader needed; the marker only counts as the last non-empty line. Lenient because a model will
 * vary the spacing and occasionally the bracket case, and refusing those would leave the raw marker
 * visible, which is worse than accepting it.
 *
 * A single option is rejected on purpose. One button is not a choice, it is a suggestion the user did not
 * ask for, and the most common way to produce one is a stray pipe-free line that happens to start with
 * the word OPTIONS.
 */

const MARKER = /^\[options:\s*(.+?)\s*\]$/i

/** How many choices a marker may carry. More than this reads as a list, not a set of buttons. */
const MAX_OPTIONS = 6

export type ParsedAnswerOptions = {
  /** The message text with the marker line removed, trimmed of the blank line it leaves behind. */
  body: string
  /** The choices, in the order written. Empty when there was no usable marker. */
  options: string[]
}

/**
 * Split a reply into its body and its offered options.
 *
 * Returns the original text unchanged when there is no marker, so this is safe to call on every text
 * group rather than only where a marker is expected.
 */
export function parseAnswerOptions(text: string): ParsedAnswerOptions {
  if (!text || !text.includes("[")) return { body: text, options: [] }
  const lines = text.split("\n")
  let lastIndex = lines.length - 1
  while (lastIndex >= 0 && (lines[lastIndex] ?? "").trim().length === 0) lastIndex -= 1
  if (lastIndex < 0) return { body: text, options: [] }
  const match = MARKER.exec((lines[lastIndex] ?? "").trim())
  if (!match) return { body: text, options: [] }
  const options = (match[1] ?? "")
    .split("|")
    .map((option) => option.trim())
    .filter((option) => option.length > 0)
  // Two is the minimum that is actually a choice, and a marker that fails that is left in the text
  // rather than silently swallowed, so the failure is visible to whoever wrote it.
  if (options.length < 2) return { body: text, options: [] }
  const body = lines.slice(0, lastIndex).join("\n").replace(/\s+$/, "")
  return { body, options: options.slice(0, MAX_OPTIONS) }
}

/**
 * Whether the marker is still being written.
 *
 * A streaming reply passes through states like `[OPTIONS: merge it` where the line is a valid prefix but
 * not yet a marker. Rendering chips from that would make them appear and change under the reader, so the
 * caller holds off while this is true and shows the raw text, which is what the reader sees anyway.
 */
export function hasIncompleteOptionsMarker(text: string): boolean {
  if (!text) return false
  const lines = text.split("\n")
  const last = (lines[lines.length - 1] ?? "").trim()
  if (last.length === 0) return false
  return /^\[options:/i.test(last) && !last.endsWith("]")
}
