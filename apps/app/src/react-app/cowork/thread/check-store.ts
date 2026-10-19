import { create } from "zustand";

import type { CheckModel, CheckPlan, CheckRequest } from "./cross-check";
import type { CheckResult } from "./cowork-blocks";
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

/**
 * Settled check results are kept on this device, so a chat reopened later (or after
 * the app restarts) still shows its Fact check and Council chips. Only finished checks are kept:
 * a check still running when the app closed has no result to show and would read as stuck.
 */
export const CHECKS_STORAGE_KEY = "redrob.cowork.checks.v1";
/** How many answers' checks are kept, newest first. */
export const CHECKS_KEPT = 200;

/** Where settled check results are kept between app runs (null when there is no storage). */
type CheckStorage = () => Pick<Storage, "getItem" | "setItem"> | null;

/** The browser's localStorage, or null outside a window (tests, SSR). */
const windowCheckStorage: CheckStorage = () => (typeof window === "undefined" ? null : window.localStorage);

/** Whether an answer's checks have finished (nothing still running) and found something to show. */
function isSettled(checks: AnswerChecks): boolean {
  return checks.fact !== "running" && checks.challenge !== "running" && (checks.fact !== "off" || checks.challenge !== "off");
}

/** Reads the kept answers; anything unreadable is ignored. Pure apart from the storage read. */
export function readKeptChecks(storage: CheckStorage): Record<string, AnswerChecks> {
  try {
    const raw = storage()?.getItem(CHECKS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { entries?: unknown }).entries)) return {};
    const answers: Record<string, AnswerChecks> = {};
    for (const entry of (parsed as { entries: unknown[] }).entries) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string" || !entry[1] || typeof entry[1] !== "object") continue;
      const checks = entry[1] as AnswerChecks;
      if (isSettled(checks)) answers[entry[0]] = checks;
    }
    return answers;
  } catch {
    return {};
  }
}

/** Keeps the settled answers, newest last, capped at CHECKS_KEPT. Storage errors are ignored. */
export function writeKeptChecks(storage: CheckStorage, answers: Record<string, AnswerChecks>) {
  try {
    const entries = Object.entries(answers).filter(([, checks]) => isSettled(checks)).slice(-CHECKS_KEPT);
    storage()?.setItem(CHECKS_STORAGE_KEY, JSON.stringify({ entries }));
  } catch {
    // Quota or private mode: the chips still show for this app session.
  }
}

/** In memory for the app session, with settled results kept on the device. */
export function createCheckStore(options: { storage?: CheckStorage } = {}) {
  const storage = options.storage ?? windowCheckStorage;
  return create<CheckStoreState>()((set, get) => ({
    pending: {},
    answers: readKeptChecks(storage),
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
    settle: (messageId, result) => {
      set((state) => {
        const previous = state.answers[messageId];
        if (!previous) return state;
        // A retry that comes back empty keeps the earlier result for the check that was done.
        const merged = result && previous.result ? { ...previous.result, ...result } : result;
        // Re-insert so the newest settled answer is last (the cap drops the oldest).
        const { [messageId]: _old, ...rest } = state.answers;
        return { answers: { ...rest, [messageId]: settleChecks(previous, merged) } };
      });
      writeKeptChecks(storage, get().answers);
    },
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
