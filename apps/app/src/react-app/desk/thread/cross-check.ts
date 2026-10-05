import type { CrossCheckLevel } from "@redrob-labs/ui";

import type { DeskCrossCheck } from "../composer/composer-state";
import { parseDeskBlocks, type CheckResult } from "./desk-blocks";

/** The hidden agent that checks an answer (apps/server/src/redrob-desk-agents.ts). */
export const DESK_CHECK_AGENT = "redrob-check";

/** Above this many characters an answer is long enough to be worth checking. */
export const CHECK_MATTERS_LENGTH = 600;

const MATTERS: RegExp[] = [
  // Figures, money and percentages.
  /\d[\d,.]*\s*(%|percent|won|dollars?|원|달러|만|억)|[$₩€£]\s?\d/i,
  // Dates and deadlines.
  /\b(19|20)\d{2}\b|\b\d{1,2}[/.-]\d{1,2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b|\d{1,2}\s*(월|일)|deadline|due by|마감|기한/i,
  // Rules: law, contracts, policy.
  /\b(clause|article|section|act|law|statute|regulation|contract|agreement|policy|required|must)\b|조항|제\s?\d+\s?조|법|계약|규정|의무/i,
  // A file written or attached.
  /\.(docx?|xlsx?|pptx?|pdf|csv|md)\b|attached|attachment|첨부/i,
];

/** Asked for something that leaves the person's hands. */
const TO_SEND = /\b(send|email|e-mail|post|reply|submit|sign|pay|notice|letter)\b|보내|발송|이메일|메일|게시|제출|서명|송금|통지/i;

/**
 * Whether an answer matters enough for "When it matters": it is long, or it carries figures,
 * dates, rules or a file, or the question asked for something to send. A heuristic on purpose:
 * cheap, explainable, and it errs towards checking.
 */
export function checkMatters(answer: string, question = ""): boolean {
  const text = answer.trim();
  if (!text) return false;
  if (text.length > CHECK_MATTERS_LENGTH) return true;
  if (TO_SEND.test(question)) return true;
  return MATTERS.some((pattern) => pattern.test(text));
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

export type CrossCheckDeps = {
  messages(sessionId: string): Promise<TranscriptMessage[]>;
  /** A session for the check, out of the chat's transcript. Returns its id. */
  createCheckSession(parentId: string): Promise<string>;
  prompt(sessionId: string, text: string, agent: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  start(messageId: string, input: { planned: boolean } & CheckPlan): void;
  settle(messageId: string, result: CheckResult | null): void;
};

export const CHECK_POLL_MS = 2_000;
export const CHECK_TIMEOUT_MS = 5 * 60_000;

/**
 * After a Run answers: decide the checks, and when any run, ask `redrob-check` in a child
 * session of the chat so the check never enters its transcript, then wait for its block. The
 * receipt reads the store: running while it works, done or failed after. Never throws.
 */
export async function runCrossCheck(
  deps: CrossCheckDeps,
  input: { sessionId: string; question: string; planned: boolean; levels: DeskCrossCheck },
): Promise<void> {
  let answerId: string | null = null;
  try {
    const answer = lastAnswer(await deps.messages(input.sessionId));
    if (!answer) return;
    answerId = answer.id;
    const plan = crossCheckPlan(input.levels, { question: input.question, answer: answer.text });
    deps.start(answer.id, { planned: input.planned, ...plan });
    if (!plan.fact && !plan.challenge) return;

    const checkId = await deps.createCheckSession(input.sessionId);
    await deps.prompt(checkId, checkPrompt({ question: input.question, answer: answer.text, plan }), DESK_CHECK_AGENT);
    for (let waited = 0; waited < CHECK_TIMEOUT_MS; waited += CHECK_POLL_MS) {
      await deps.sleep(CHECK_POLL_MS);
      const reply = lastAnswer(await deps.messages(checkId));
      if (reply?.completed && reply.finish !== "tool-calls") {
        deps.settle(answer.id, parseCheckAnswer(reply.text));
        return;
      }
    }
    deps.settle(answer.id, null);
  } catch {
    if (answerId) deps.settle(answerId, null);
  }
}
