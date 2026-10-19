import type { UIMessage } from "ai";

/**
 * Round 7 C8: the plan's progress lives in the to-do dock above the composer, so inside the Cowork
 * frame the agent's to-do tool calls ("Updated the plan (4)") are not drawn in the transcript.
 * Matches the engine's `todowrite` and `todoread` tools.
 */
const TODO_TOOL = /^todo(?:write|read)$/i;

/** Whether a message part is a to-do tool call. */
export function isTodoToolPart(part: UIMessage["parts"][number]): boolean {
  return part.type === "dynamic-tool" && TODO_TOOL.test(part.toolName);
}

/**
 * The transcript without to-do tool calls. Pure and identity-preserving: a message with no such
 * part is returned as the same object, and the same array comes back when nothing was removed,
 * so memoized rows downstream do not re-render.
 */
export function withoutTodoToolParts(messages: UIMessage[]): UIMessage[] {
  let changed = false;
  const next = messages.map((message) => {
    if (message.role !== "assistant" || !message.parts.some(isTodoToolPart)) return message;
    changed = true;
    return { ...message, parts: message.parts.filter((part) => !isTodoToolPart(part)) };
  });
  return changed ? next : messages;
}
