import { createContext, use } from "react";

import type { ComposerDraft } from "../../../app/types";

/**
 * What the thread's own controls need from the session they sit in: its id, whether it is
 * working, and a way to send a reply through the same path as the composer, so busy state,
 * errors and the transcript stay right. Provided by `SessionSurface`.
 */
export type DeskThread = {
  sessionId: string;
  busy: boolean;
  sendText(text: string): Promise<void>;
};

export const DeskThreadContext = createContext<DeskThread | null>(null);

export function useDeskThread(): DeskThread | null {
  return use(DeskThreadContext);
}

/** A plain text reply as a composer draft. */
export function textDraft(text: string): ComposerDraft {
  return { mode: "prompt", parts: [{ type: "text", text }], attachments: [], text, resolvedText: text };
}
