import { createContext, use } from "react";

import type { ComposerDraft } from "../../../app/types";
import type { CoworkQuestionState } from "./question-state";
import type { PlanRunActivity } from "./plan-progress";

/**
 * What the thread's own controls need from the session they sit in: its id, whether it is
 * working, and a way to send a reply through the same path as the composer, so busy state,
 * errors and the transcript stay right. Provided by `SessionSurface`.
 */
export type CoworkThread = {
  sessionId: string;
  busy: boolean;
  sendText(text: string): Promise<void>;
  /** Round 8 (M1): which Plan questions were answered and which plans are held back. */
  questions?: CoworkQuestionState;
  /** Round 9: how far each plan's run has got, by the plan message's id (see plan-progress.ts). */
  plans?: ReadonlyMap<string, PlanRunActivity>;
  /** Round 9: the session was working at some point while this surface was mounted. */
  liveHere?: boolean;
};

export const CoworkThreadContext = createContext<CoworkThread | null>(null);

export function useCoworkThread(): CoworkThread | null {
  return use(CoworkThreadContext);
}

/** A plain text reply as a composer draft. */
export function textDraft(text: string): ComposerDraft {
  return { mode: "prompt", parts: [{ type: "text", text }], attachments: [], text, resolvedText: text };
}
