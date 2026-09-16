import type { UIMessage } from "ai";

import { sessionErrorPresentationFromUIMessage } from "../session/sync/session-error";
import { REDROB_CONSOLE_BILLING_URL } from "../settings/redrob-provider";

/**
 * Paying for inference from inside Redrob Cowork, without Redrob Cowork handling money.
 *
 * The console owns billing end to end: the checkout page, the amount, and which methods Stripe
 * offers. This module is only what the app needs to be honest about it, and it is deliberately
 * small.
 *
 * Two facts shape everything here.
 *
 * Redrob Cowork cannot read a balance. The workspace key belongs to Redrob Code's auth store
 * (`apps/server/src/redrob-auth.ts`), the engine never hands it back, and the console exposes no
 * billing status endpoint that Work's own authenticated surface could call. So there is no balance
 * query to write, and writing one against a guessed contract would put a number on screen that
 * nothing verified.
 *
 * What the app can observe is a refusal: the console declining a request because the workspace has
 * no credit. That arrives as a session error, which is why `classifyRedrobPaymentRefusal` reads
 * text rather than a typed payload. It is the same signal whether it comes live from
 * `session.error` or from the diagnostic block on a reloaded transcript.
 *
 * The state below therefore has no success state, by construction. Opening the checkout proves the
 * browser opened and nothing else, so the furthest this can go is "handed off, not confirmed". Only
 * the console can end that, and it ends it by letting the next request through.
 */

/** Which kind of refusal the console sent. Both mean the same thing to the user: add credit. */
export type RedrobPaymentRefusalSignal = "insufficient_credit" | "payment_required";

export type RedrobPaymentRefusal = {
  signal: RedrobPaymentRefusalSignal;
  /** The console's own words, capped for display. Never a credential: session errors carry none. */
  detail: string;
};

/** How much of the console's message the sheet will show. */
const DETAIL_CAP = 240;

/**
 * A provider line, when the error carries one. Present in the technical details block built by
 * `presentOpencodeSessionError`, absent from a bare live error string.
 */
const PROVIDER_PATTERN = /(?:^|\n)\s*Provider:\s*(\S+)/i;

/**
 * Out of credit, in the wordings an OpenAI-compatible gateway uses for it.
 *
 * `quota` is in the list because that is the word this console actually sends. Its refusal is
 * `{"type":"insufficient_quota","message":"This workspace is out of credit (balance $-0.64)..."}`, and the
 * pattern named credit / credits / balance / funds but not quota - so the one wording that reaches users
 * in practice fell through to a raw JSON blob with no top-up offered.
 *
 * `out of credit` is matched separately, because the message says that in prose without ever putting
 * "insufficient" next to it.
 */
const INSUFFICIENT_PATTERN =
  /insufficient[\s_-]+(?:credit|credits|balance|funds|quota)|\bout of (?:credit|credits|balance|funds)\b/i;

/**
 * HTTP 402. Matched only where the number is labelled as a status or paired with the reason phrase,
 * so a 402 that happens to appear in a model name or a token count is not read as a bill.
 */
const PAYMENT_REQUIRED_PATTERN =
  /(?:\b(?:status|statuscode|status_code|code)\b\s*[:=]?\s*402\b|\b402\s+payment[\s_-]?required\b|\bpayment[\s_-]?required\b)/i;

function refusalDetail(text: string): string {
  const line = text
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => INSUFFICIENT_PATTERN.test(candidate) || PAYMENT_REQUIRED_PATTERN.test(candidate));
  const detail = (line ?? text.trim()).replace(/\s+/g, " ");
  return detail.length > DETAIL_CAP ? `${detail.slice(0, DETAIL_CAP - 1)}\u2026` : detail;
}

/**
 * Decide whether a session error is the console refusing to spend money it does not have.
 *
 * Scoped to the Redrob provider: an error that names a different provider is that provider's
 * billing problem, and offering a Redrob top-up for it would send the user to the wrong place. An
 * error that names no provider is accepted, because Redrob is the only provider this app connects.
 *
 * Returns null for everything else. A missed refusal shows the ordinary error, which is the safe
 * direction to be wrong in.
 */
export function classifyRedrobPaymentRefusal(text: string | null | undefined): RedrobPaymentRefusal | null {
  if (!text || !text.trim()) return null;

  const provider = text.match(PROVIDER_PATTERN)?.[1]?.trim().toLowerCase();
  if (provider && provider !== "redrob") return null;

  if (INSUFFICIENT_PATTERN.test(text)) {
    return { signal: "insufficient_credit", detail: refusalDetail(text) };
  }
  if (PAYMENT_REQUIRED_PATTERN.test(text)) {
    return { signal: "payment_required", detail: refusalDetail(text) };
  }
  return null;
}

export type RedrobPayState = {
  /** What the console refused, when a refusal is what opened this. */
  refusal: RedrobPaymentRefusal | null;
  /** True once the checkout has been opened in the browser. Not a claim that anything was paid. */
  handedOff: boolean;
  /** A recheck is in flight. */
  checking: boolean;
  /** The last recheck could not finish. */
  checkFailed: boolean;
  /**
   * Whether Redrob Code still holds a workspace key, from Work's own authenticated read. It is the
   * only billing-adjacent fact this app can verify, and it says nothing about credit.
   */
  keyConnected: boolean | null;
};

export type RedrobPayEvent =
  | { type: "refused"; refusal: RedrobPaymentRefusal }
  | { type: "checkout-opened" }
  | { type: "recheck-started" }
  | { type: "recheck-settled"; keyConnected: boolean }
  | { type: "recheck-failed" };

export function redrobPayInitialState(refusal: RedrobPaymentRefusal | null = null): RedrobPayState {
  return { refusal, handedOff: false, checking: false, checkFailed: false, keyConnected: null };
}

/**
 * Advance the sheet.
 *
 * No event here can report a payment. `recheck-settled` carries the one thing Work is allowed to
 * assert, that the engine still holds a key, and it leaves `handedOff` standing: a connected key
 * with no credit and a connected key with credit look identical from this side.
 */
export function redrobPayReducer(state: RedrobPayState, event: RedrobPayEvent): RedrobPayState {
  switch (event.type) {
    case "refused":
      return { ...state, refusal: event.refusal };
    case "checkout-opened":
      return { ...state, handedOff: true, checkFailed: false };
    case "recheck-started":
      return { ...state, checking: true, checkFailed: false };
    case "recheck-settled":
      return { ...state, checking: false, checkFailed: false, keyConnected: event.keyConnected };
    case "recheck-failed":
      return { ...state, checking: false, checkFailed: true };
  }
}

/**
 * Every status line the sheet can show. Exported so a test can walk the reachable states and assert
 * that none of them claims a payment went through.
 */
export const REDROB_PAY_STATUS_KEYS = [
  "billing.pay_status_unknown",
  "billing.pay_status_refused",
  "billing.pay_status_unconfirmed",
  "billing.pay_status_checking",
  "billing.pay_status_check_failed",
  "billing.pay_status_key_missing",
] as const;

export type RedrobPayStatusKey = (typeof REDROB_PAY_STATUS_KEYS)[number];

/**
 * The one sentence the sheet shows about status. Ordered by what the user most needs to know: work
 * in progress first, then a lost connection, then the honest "cannot confirm" that follows a
 * handoff, then the refusal that started it.
 */
export function redrobPayStatusKey(state: RedrobPayState): RedrobPayStatusKey {
  if (state.checking) return "billing.pay_status_checking";
  if (state.checkFailed) return "billing.pay_status_check_failed";
  if (state.keyConnected === false) return "billing.pay_status_key_missing";
  if (state.handedOff) return "billing.pay_status_unconfirmed";
  if (state.refusal) return "billing.pay_status_refused";
  return "billing.pay_status_unknown";
}

/** The console page to open. A constant: Work never builds an amount or a session into it. */
export function redrobCheckoutUrl(): string {
  return REDROB_CONSOLE_BILLING_URL;
}

/**
 * Read the refusal, if any, out of a transcript.
 *
 * Only the most recent session error is considered. An older refusal that a later turn ran past has
 * been answered by the console itself, and re-raising it would ask the user to pay for credit they
 * evidently have.
 */
export function redrobPaymentRefusalFromMessages(messages: readonly UIMessage[]): RedrobPaymentRefusal | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    const presentation = sessionErrorPresentationFromUIMessage(message);
    if (!presentation) continue;
    return classifyRedrobPaymentRefusal(`${presentation.title}\n${presentation.technicalDetails}`);
  }
  return null;
}
