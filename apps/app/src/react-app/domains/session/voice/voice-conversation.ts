import type { UIMessage } from "ai";

import { getMessagesText } from "@/components/chat/utils";

/**
 * The answer to the last thing the user said: every assistant message after the last user message,
 * read as one, the way the reply's own read-aloud button reads it. Null while there is none yet, or
 * when the answer has no words in it (only tool calls, say), so there is nothing to read.
 */
export function replyToRead(messages: UIMessage[]): { id: string; text: string } | null {
  const lastUser = messages.findLastIndex((message) => message.role === "user");
  const answer = messages.slice(lastUser + 1).filter((message) => message.role === "assistant");
  const last = answer.at(-1);
  if (!last) return null;
  const text = getMessagesText(answer).trim();
  return text ? { id: last.id, text } : null;
}

/** Whether a turn was running at the last look, and whether its answer is still to be read. */
export type VoiceReplyWait = { streaming: boolean; due: boolean };

/**
 * One look at the chat. The turn a spoken message started ending, and its answer's last words
 * arriving, are separate events in either order, so the answer is read once both have happened.
 * `takeReply` is asked only when a turn ends, and says whether a spoken message started it.
 */
export function voiceReplyStep(
  wait: VoiceReplyWait,
  now: { streaming: boolean; messages: UIMessage[]; takeReply: () => boolean },
): { wait: VoiceReplyWait; read: { id: string; text: string } | null } {
  const ended = wait.streaming && !now.streaming;
  const due = wait.due || (ended && now.takeReply());
  const read = due && !now.streaming ? replyToRead(now.messages) : null;
  return { wait: { streaming: now.streaming, due: due && !read }, read };
}
