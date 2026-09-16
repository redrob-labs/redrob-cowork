import type { UIMessage } from "ai";

/**
 * Which messages belong to a context compaction, so they can be collapsed instead of read.
 *
 * When a session outgrows the model's window the engine summarises it, and that summary arrives as real
 * messages: a user message carrying a `compaction` part as its marker, and the assistant turn after it
 * holding the summary text. Rendered like any other turn, that pastes a wall of machine-written recap
 * into the middle of a conversation - text addressed to the model, not to the reader, and long enough
 * to bury what came before it.
 *
 * So both are folded into one line. Nothing is deleted: the summary is what the model is now working
 * from, so it has to stay expandable rather than hidden, and it stays in the transcript on disk either
 * way.
 *
 * The marker is identified by the part the sync layer now carries through (`data-compaction`); the
 * summary is identified positionally, as the assistant run immediately following a marker. Positional
 * because the engine gives the summary no marker of its own - anything else here would be a guess about
 * its text.
 */
export const COMPACTION_PART_TYPE = "data-compaction";

export function isCompactionMarker(message: Pick<UIMessage, "role" | "parts">): boolean {
  if (message.role !== "user") return false;
  return message.parts.some((part) => part.type === COMPACTION_PART_TYPE);
}

export type CompactionSpan = {
  /** Index of the marker user message. */
  markerIndex: number;
  /** Indices of the assistant messages holding the summary, empty when it has not arrived yet. */
  summaryIndexes: number[];
};

export function compactionSpans(messages: readonly UIMessage[]): CompactionSpan[] {
  const spans: CompactionSpan[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || !isCompactionMarker(message)) continue;
    const summaryIndexes: number[] = [];
    for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
      if (messages[cursor]?.role !== "assistant") break;
      summaryIndexes.push(cursor);
    }
    spans.push({ markerIndex: index, summaryIndexes });
  }
  return spans;
}

/**
 * Every message index a compaction owns.
 *
 * One set rather than a lookup per row, because the renderer asks this question for every message on
 * every render and the answer does not change between them.
 */
export function collapsedCompactionIndexes(messages: readonly UIMessage[]): Set<number> {
  const indexes = new Set<number>();
  for (const span of compactionSpans(messages)) {
    indexes.add(span.markerIndex);
    for (const summary of span.summaryIndexes) indexes.add(summary);
  }
  return indexes;
}
