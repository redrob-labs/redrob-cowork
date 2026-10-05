import { create } from "zustand";

import type { CheckPlan } from "./cross-check";
import type { CheckResult } from "./desk-blocks";
import type { CheckState } from "./thread-logic";

/** A prompt sent in Run mode, waiting for its answer. */
export type PendingRun = { question: string; planned: boolean };

/** What is known about one answer: whether it followed a plan and where each check stands. */
export type AnswerChecks = { planned: boolean; fact: CheckState; challenge: CheckState; result?: CheckResult };

export type CheckStoreState = {
  /** By session id. */
  pending: Record<string, PendingRun>;
  /** By answer message id. */
  answers: Record<string, AnswerChecks>;
  expect(sessionId: string, run: PendingRun): void;
  /** The pending run for a session, removed so it is handled once. */
  take(sessionId: string): PendingRun | null;
  start(messageId: string, input: { planned: boolean } & CheckPlan): void;
  /** A check finished: what it returned decides done, and a check it left out failed. */
  settle(messageId: string, result: CheckResult | null): void;
};

export function startChecks(input: { planned: boolean } & CheckPlan): AnswerChecks {
  return { planned: input.planned, fact: input.fact ? "running" : "off", challenge: input.challenge ? "running" : "off" };
}

export function settleChecks(previous: AnswerChecks, result: CheckResult | null): AnswerChecks {
  const settle = (state: CheckState, found: boolean): CheckState => (state === "running" ? (found ? "done" : "failed") : state);
  return {
    ...previous,
    fact: settle(previous.fact, Boolean(result?.fact)),
    challenge: settle(previous.challenge, Boolean(result?.challenge)),
    ...(result ? { result } : {}),
  };
}

/** In memory for the app session, as the composer's per-chat choices are. */
export function createCheckStore() {
  return create<CheckStoreState>()((set, get) => ({
    pending: {},
    answers: {},
    expect: (sessionId, run) => set((state) => ({ pending: { ...state.pending, [sessionId]: run } })),
    take: (sessionId) => {
      const run = get().pending[sessionId];
      if (!run) return null;
      set((state) => {
        const { [sessionId]: _taken, ...pending } = state.pending;
        return { pending };
      });
      return run;
    },
    start: (messageId, input) => set((state) => ({ answers: { ...state.answers, [messageId]: startChecks(input) } })),
    settle: (messageId, result) =>
      set((state) => {
        const previous = state.answers[messageId];
        if (!previous) return state;
        return { answers: { ...state.answers, [messageId]: settleChecks(previous, result) } };
      }),
  }));
}

export const useCheckStore = createCheckStore();
