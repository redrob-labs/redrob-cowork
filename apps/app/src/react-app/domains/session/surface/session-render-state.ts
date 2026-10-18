import type { UIMessage } from "ai";

import type { RedrobSessionSnapshot } from "../../../../app/lib/redrob-server";
import { isSyntheticCoworkPrompt } from "../../../cowork/thread/thread-logic";
import { mergeSnapshotAndLiveMessages } from "../sync/message-merge";
import { applyRevertCursor } from "../sync/transcript-reconcile";
import { snapshotToUIMessages } from "../sync/usechat-adapter";

export function resolveRenderedSessionSnapshot(input: {
  sessionId: string;
  currentSnapshot: RedrobSessionSnapshot | null | undefined;
  cachedRendered: { sessionId: string; snapshot: RedrobSessionSnapshot } | null | undefined;
}) {
  if (input.currentSnapshot?.session.id === input.sessionId) {
    return input.currentSnapshot;
  }
  if (
    input.cachedRendered?.sessionId === input.sessionId &&
    input.cachedRendered.snapshot.session.id === input.sessionId
  ) {
    return input.cachedRendered.snapshot;
  }
  return null;
}

/**
 * The leading text of a USER message, concatenating its text parts in order. Used only to read a
 * synthetic-send provenance sentinel off the front (item 10); non-text parts are ignored.
 */
function userMessageText(message: UIMessage): string {
  if (message.role !== "user") return "";
  let text = "";
  for (const part of message.parts) {
    if (part.type === "text") text += part.text;
  }
  return text;
}

/**
 * Hide synthetic USER sends from the Cowork transcript (item 10): the plan-run prompt and the
 * question-answer reply are machinery, not conversation. The engine still received them (they
 * were really sent); this only drops them from the RENDER, and only inside the Cowork frame.
 * The assistant answers they produced are untouched. Ids and order are preserved so the revert
 * cursor still resolves.
 */
export function filterSyntheticCoworkMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => !isSyntheticCoworkPrompt(userMessageText(message)));
}

export function deriveRenderedSessionMessages(input: {
  transcriptState: UIMessage[] | null | undefined;
  snapshot: RedrobSessionSnapshot | null | undefined;
  /** In the Cowork frame, hide synthetic machinery sends from the transcript (item 10). */
  inCoworkFrame?: boolean;
}) {
  const revertMessageId = (input.snapshot?.session as any)?.revert?.messageID ?? null;
  const liveMessages = input.transcriptState ?? [];

  const snapshotMessages = input.snapshot && input.snapshot.messages.length > 0
    ? snapshotToUIMessages(input.snapshot)
    : [];

  // Render the server snapshot as the history floor and layer live stream
  // updates on top. During prompt submission the live cache can briefly contain
  // only the new turn; it must not replace the older persisted transcript.
  const messages = snapshotMessages.length > 0
    ? mergeSnapshotAndLiveMessages(snapshotMessages, liveMessages, { appendLiveOnlyMessages: true })
    : liveMessages;

  // Hide synthetic sends BEFORE the revert cursor runs, preserving ids/order so applyRevertCursor
  // still finds its cursor message. Render-only: the snapshot still persists them server-side, so
  // a reload re-derives then re-filters.
  const visible = input.inCoworkFrame ? filterSyntheticCoworkMessages(messages) : messages;

  return applyRevertCursor(visible, revertMessageId);
}
