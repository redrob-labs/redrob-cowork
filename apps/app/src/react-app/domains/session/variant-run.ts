import type { VariantKind, VariantSlot } from "./model-fanout";

/**
 * Running the variants and collecting their answers.
 *
 * Each variant is a FORK of the session, prompted with the same text. Forks rather than one session with
 * several replies, because the engine gives a user message exactly one assistant message and that history
 * is the next turn's input: two answers in one transcript would each read the other as their own earlier
 * turn. Forks rather than fresh sessions, because a variant has to start from the SAME conversation to be
 * an answer to this turn rather than to a blank one.
 *
 * Answers are collected by polling each fork's messages. The app subscribes to events for the session on
 * screen, and these forks are deliberately not on screen, so a poll is the honest way to watch them
 * without pretending a second subscription exists.
 *
 * Kept out of the route because the interesting parts are testable without React: which fork is finished,
 * what counts as its answer text, and when the run as a whole is done.
 */

export type VariantState = {
  index: number;
  label: string;
  sessionID: string | null;
  status: "starting" | "running" | "done" | "failed";
  text: string;
  error?: string;
};

export type VariantRun = {
  kind: VariantKind;
  prompt: string;
  variants: VariantState[];
};

type MessageLike = {
  info?: { role?: string; time?: { completed?: number | null } | null } | null;
  parts?: Array<{ type?: string; text?: string }> | null;
};

/**
 * The assistant text of a FINISHED reply, or undefined while it is still being written.
 *
 * `time.completed` is the finish signal rather than "there is some text": a streaming reply has text from
 * its first token, and adopting a half-written answer would put a truncated turn into the session as
 * though the model had stopped there.
 */
export function finishedAssistantText(messages: readonly MessageLike[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.info?.role !== "assistant") continue;
    if (!message.info.time?.completed) return undefined;
    const text = (message.parts ?? [])
      .filter(part => part?.type === "text" && typeof part.text === "string")
      .map(part => part.text as string)
      .join("")
      .trim();
    return text.length > 0 ? text : undefined;
  }
  return undefined;
}

/** Whether every variant has reached a terminal state, so the poll can stop. */
/**
 * The assistant text SO FAR, finished or not.
 *
 * Separate from `finishedAssistantText` on purpose, and the two are not interchangeable. This one feeds the
 * panel: a column that sits at "working" for forty seconds and then dumps a finished essay reads as broken,
 * and the main transcript streams in the same window, so a variant has no business being the one place that
 * hides the answer being written. `finishedAssistantText` still guards adoption, which is the part that
 * must not move: a half-written answer can be READ but not kept.
 */
export function partialAssistantText(messages: readonly MessageLike[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message?.info || message.info.role !== "assistant") continue;
    const text = (message.parts ?? [])
      .filter(part => part?.type === "text" && typeof part.text === "string")
      .map(part => part.text as string)
      .join("")
      .trim();
    if (text.length > 0) return text;
  }
  return "";
}

export function runSettled(run: VariantRun): boolean {
  return run.variants.every(variant => variant.status === "done" || variant.status === "failed");
}

/** Whether a run produced anything worth showing. A run where every variant failed is not a choice. */
export function runHasAnswer(run: VariantRun): boolean {
  return run.variants.some(variant => variant.status === "done" && variant.text.length > 0);
}

/**
 * The request that makes another model REWRITE an answer instead of writing its own.
 *
 * This is the difference between the two features, and it is not a UI difference. Compare asks several
 * models the same QUESTION and gets independent answers, which is how you tell models apart. Paraphrase
 * hands a model an ANSWER and asks for the same content in different words, which is how you find a
 * wording you prefer. Re-asking the question would have produced a different answer, and a different
 * answer is not a paraphrase of the first one.
 *
 * Sent in a FRESH session rather than a fork, because a rewrite needs the text and nothing else: the
 * conversation would only be context the model might drift toward, and it is expensive to carry for a task
 * that is complete in one message.
 *
 * The instruction is mostly a list of things not to do, and every one of them is a way a rewrite can lie:
 * dropping a caveat, rounding a number, turning "cannot" into "should not", or answering the question
 * again because the model decided it knew better.
 */
export function buildParaphrasePrompt(answer: string): string {
  return [
    "Rewrite the text below in different words. It is an answer someone already received, and they want the same content phrased differently.",
    "",
    "Rules:",
    "- Keep every fact, number, name, path and caveat exactly as it is. If you cannot keep one, leave it untouched.",
    "- Do not add information, do not remove information, and do not answer the question the text was answering.",
    "- Keep any warning as strong as it was. A warning that reads softer after a rewrite is a defect, not a style.",
    "- Keep code, commands and quoted strings byte for byte.",
    "- Reply with the rewritten text alone. No preamble, no explanation of what you changed.",
    "",
    "Text to rewrite:",
    "",
    answer,
  ].join("\n")
}
/** The initial state for a set of slots, before any session exists. */
export function startingRun(input: {
  kind: VariantKind;
  prompt: string;
  slots: readonly VariantSlot[];
}): VariantRun {
  return {
    kind: input.kind,
    prompt: input.prompt,
    variants: input.slots.map(slot => ({
      index: slot.index,
      label: slot.label,
      sessionID: null,
      status: "starting" as const,
      text: "",
    })),
  };
}

/** Replace one variant in a run, leaving the others as they were. */
export function withVariant(run: VariantRun, index: number, patch: Partial<VariantState>): VariantRun {
  return {
    ...run,
    variants: run.variants.map(variant =>
      variant.index === index ? { ...variant, ...patch } : variant
    ),
  };
}

/**
 * The sessions to delete when a variant is adopted: every fork except the chosen one.
 *
 * Returned as a list rather than deleted here so the caller can report a failure to remove one without
 * losing the adoption itself. A fork left behind is untidy; a lost adoption is the user's work.
 */
export function discardedSessions(run: VariantRun, chosenIndex: number): string[] {
  return run.variants
    .filter(variant => variant.index !== chosenIndex && variant.sessionID)
    .map(variant => variant.sessionID as string);
}
