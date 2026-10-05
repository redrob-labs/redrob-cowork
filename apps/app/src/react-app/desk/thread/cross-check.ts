import type { CrossCheckLevel } from "@redrob-labs/ui";

import type { DeskCrossCheck } from "../composer/composer-state";
import { parseDeskBlocks, type CheckResult } from "./desk-blocks";

/** The hidden agent that checks an answer (apps/server/src/redrob-desk-agents.ts). */
export const DESK_CHECK_AGENT = "redrob-check";

/** Above this many characters an answer is long enough to be worth checking. */
export const CHECK_MATTERS_LENGTH = 600;

/** Money and percentages. A bare number or a year is not enough on its own. */
const MONEY = /\d[\d,.]*\s*(%|percent|won|dollars?|원|달러|만\s?원|억)|[$₩€£]\s?\d/i;

/** Rules a professional answers to: law, contracts, policy. */
const RULES = /\b(clause|article|statute|regulation|contract|agreement|policy|law)s?\b|조항|제\s?\d+\s?조|법률|계약|규정/i;

/** Asked for something that leaves the person's hands. */
const TO_SEND = /\b(send|email|e-mail|post|reply|submit|sign|pay|notice|letter)\b|보내|발송|이메일|메일|게시|제출|서명|송금|통지/i;

/**
 * Whether an answer matters enough for "When it matters": it is long, the question asked for
 * something to send, sign or pay, or it puts money next to a rule. A heuristic on purpose:
 * cheap and explainable. Each check is a second AI turn, so a quick answer with a number or a
 * date in it is not checked.
 */
export function checkMatters(answer: string, question = ""): boolean {
  const text = answer.trim();
  if (!text) return false;
  if (text.length > CHECK_MATTERS_LENGTH) return true;
  if (TO_SEND.test(question)) return true;
  return MONEY.test(text) && RULES.test(text);
}

function levelRuns(level: CrossCheckLevel, matters: () => boolean): boolean {
  if (level === "always") return true;
  if (level === "off") return false;
  return matters();
}

export type CheckPlan = { fact: boolean; challenge: boolean };

/** Which checks run on an answer, by the person's levels. */
export function crossCheckPlan(levels: DeskCrossCheck, input: { question: string; answer: string }): CheckPlan {
  let memo: boolean | null = null;
  const matters = () => (memo ??= checkMatters(input.answer, input.question));
  return { fact: levelRuns(levels.factCheck, matters), challenge: levelRuns(levels.challenge, matters) };
}

/** What the check agent is asked: the question, the answer, and which checks. */
export function checkPrompt(input: { question: string; answer: string; plan: CheckPlan }): string {
  const asked = [input.plan.fact ? "a Fact check" : null, input.plan.challenge ? "a Challenge" : null].filter(Boolean);
  return [
    `Run ${asked.join(" and ")} on the answer below. Leave out the check you were not asked for.`,
    "## The question",
    input.question.trim() || "(not given)",
    "## The answer",
    input.answer.trim(),
  ].join("\n\n");
}

/** A check agent's answer, read for its one block. */
export function parseCheckAnswer(text: string): CheckResult | null {
  return parseDeskBlocks(text).check ?? null;
}

export type TranscriptMessage = {
  id: string;
  role: string;
  completed: boolean;
  /** The engine's finish reason; "tool-calls" means the turn is not over. */
  finish?: string;
  text: string;
};

/** The last assistant message with something said, or null. */
export function lastAnswer(messages: TranscriptMessage[]): TranscriptMessage | null {
  return messages.findLast((message) => message.role === "assistant" && message.text.trim().length > 0) ?? null;
}

/** The model the chat sent with, so the check runs on the same one. */
export type CheckModel = { model?: { providerID: string; modelID: string }; variant?: string };

/** What a check needs to run again, kept with the answer for Retry. */
export type CheckRequest = { sessionId: string; question: string; planned: boolean } & CheckModel;

export type CrossCheckDeps = {
  messages(sessionId: string): Promise<TranscriptMessage[]>;
  /** A session for the check, out of the chat's transcript. Returns its id. */
  createCheckSession(parentId: string): Promise<string>;
  prompt(sessionId: string, text: string, agent: string, model: CheckModel): Promise<void>;
  sleep(ms: number): Promise<void>;
  start(messageId: string, input: { planned: boolean; request: CheckRequest } & CheckPlan): void;
  settle(messageId: string, result: CheckResult | null): void;
  /** The check session is known to belong to this answer while it runs. */
  track(checkSessionId: string, messageId: string): void;
  untrack(checkSessionId: string): void;
  /** True once the check asked for something and was told no: it cannot finish. */
  stopped(checkSessionId: string): boolean;
};

export const CHECK_POLL_MS = 2_000;
export const CHECK_TIMEOUT_MS = 5 * 60_000;

/**
 * After a Run answers: decide the checks, and when any run, ask `redrob-check` in a child
 * session of the chat so the check never enters its transcript, then wait for its block. The
 * receipt reads the store: running while it works, done or failed after. Never throws.
 * `plan` is set by Retry, which runs again the checks that failed.
 */
export async function runCrossCheck(
  deps: CrossCheckDeps,
  input: CheckRequest & { levels: DeskCrossCheck; plan?: CheckPlan },
): Promise<void> {
  let answerId: string | null = null;
  let checkId: string | null = null;
  const { levels: _levels, plan: _plan, ...request } = input;
  try {
    const answer = lastAnswer(await deps.messages(input.sessionId));
    if (!answer) return;
    answerId = answer.id;
    const plan = input.plan ?? crossCheckPlan(input.levels, { question: input.question, answer: answer.text });
    deps.start(answer.id, { planned: input.planned, request, ...plan });
    if (!plan.fact && !plan.challenge) return;

    checkId = await deps.createCheckSession(input.sessionId);
    deps.track(checkId, answer.id);
    await deps.prompt(checkId, checkPrompt({ question: input.question, answer: answer.text, plan }), DESK_CHECK_AGENT, {
      ...(input.model ? { model: input.model } : {}),
      ...(input.variant ? { variant: input.variant } : {}),
    });
    for (let waited = 0; waited < CHECK_TIMEOUT_MS; waited += CHECK_POLL_MS) {
      await deps.sleep(CHECK_POLL_MS);
      if (deps.stopped(checkId)) break;
      const reply = lastAnswer(await deps.messages(checkId));
      if (reply?.completed && reply.finish !== "tool-calls") {
        deps.settle(answer.id, parseCheckAnswer(reply.text));
        return;
      }
    }
    deps.settle(answer.id, null);
  } catch {
    if (answerId) deps.settle(answerId, null);
  } finally {
    if (checkId) deps.untrack(checkId);
  }
}

/** Retry runs only the checks that failed. */
export function retryPlan(checks: { fact: string; challenge: string }): CheckPlan {
  return { fact: checks.fact === "failed", challenge: checks.challenge === "failed" };
}
