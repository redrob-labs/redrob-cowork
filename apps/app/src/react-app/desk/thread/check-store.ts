import { create } from "zustand";

import type { CheckModel, CheckPlan, CheckRequest } from "./cross-check";
import type { CheckResult } from "./desk-blocks";
import type { CheckState } from "./thread-logic";

/** A prompt sent in Run mode, waiting for its answer, with the model it was sent on. */
export type PendingRun = { question: string; planned: boolean } & CheckModel;

/** What is known about one answer: whether it followed a plan and where each check stands. */
export type AnswerChecks = {
  planned: boolean;
  fact: CheckState;
  challenge: CheckState;
  result?: CheckResult;
  /** What Retry runs again. */
  request?: CheckRequest;
};

export type CheckStoreState = {
  /** By session id. */
  pending: Record<string, PendingRun>;
  /** By answer message id. */
  answers: Record<string, AnswerChecks>;
  /** Check session id to the answer it checks, while the check runs. */
  checking: Record<string, string>;
  /** Check sessions told no when they asked for something: they cannot finish. */
  stopped: Record<string, true>;
  /** Set by the mounted cross-check; null until then. */
  retryHandler: ((messageId: string) => void) | null;
  expect(sessionId: string, run: PendingRun): void;
  /** The pending run for a session, removed so it is handled once. */
  take(sessionId: string): PendingRun | null;
  start(messageId: string, input: { planned: boolean; request?: CheckRequest } & CheckPlan): void;
  /** A check finished: what it returned decides done, and a check it left out failed. */
  settle(messageId: string, result: CheckResult | null): void;
  track(checkSessionId: string, messageId: string): void;
  untrack(checkSessionId: string): void;
  stop(checkSessionId: string): void;
  setRetryHandler(handler: ((messageId: string) => void) | null): void;
};

export function startChecks(input: { planned: boolean; request?: CheckRequest } & CheckPlan): AnswerChecks {
  return {
    planned: input.planned,
    fact: input.fact ? "running" : "off",
    challenge: input.challenge ? "running" : "off",
    ...(input.request ? { request: input.request } : {}),
  };
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

/**
 * A retry keeps what already came back: a check that is done stays done, and only the
 * ones run again go back to running.
 */
function restartChecks(previous: AnswerChecks | undefined, next: AnswerChecks): AnswerChecks {
  if (!previous) return next;
  return {
    ...next,
    fact: next.fact === "off" ? previous.fact : next.fact,
    challenge: next.challenge === "off" ? previous.challenge : next.challenge,
    ...(previous.result ? { result: previous.result } : {}),
  };
}

/** In memory for the app session. */
export function createCheckStore() {
  return create<CheckStoreState>()((set, get) => ({
    pending: {},
    answers: {},
    checking: {},
    stopped: {},
    retryHandler: null,
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
    start: (messageId, input) =>
      set((state) => ({ answers: { ...state.answers, [messageId]: restartChecks(state.answers[messageId], startChecks(input)) } })),
    settle: (messageId, result) =>
      set((state) => {
        const previous = state.answers[messageId];
        if (!previous) return state;
        // A retry that comes back empty keeps the earlier result for the check that was done.
        const merged = result && previous.result ? { ...previous.result, ...result } : result;
        return { answers: { ...state.answers, [messageId]: settleChecks(previous, merged) } };
      }),
    track: (checkSessionId, messageId) => set((state) => ({ checking: { ...state.checking, [checkSessionId]: messageId } })),
    untrack: (checkSessionId) =>
      set((state) => {
        const { [checkSessionId]: _gone, ...checking } = state.checking;
        const { [checkSessionId]: _was, ...stopped } = state.stopped;
        return { checking, stopped };
      }),
    stop: (checkSessionId) => set((state) => ({ stopped: { ...state.stopped, [checkSessionId]: true } })),
    setRetryHandler: (handler) => set({ retryHandler: handler }),
  }));
}

export const useCheckStore = createCheckStore();
