import type { UIMessage } from "ai";

import { getMessagesText } from "../../../components/chat/utils";
import { parseCoworkBlocks } from "./cowork-blocks";

/**
 * Where Plan's questions stand, read from the RAW transcript (hidden question-answer sends
 * included). Message position is not enough: the plan agent often keeps writing after it asks
 * (another message, or the plan itself), so "no longer the last message" does not mean answered.
 * - answered: an assistant message whose questions have ANY user message after them (the person's
 *   own reply, or the hidden send the question card makes);
 * - heldPlans: an assistant message whose plan shares a turn with questions (same message or an
 *   earlier one since the last user message). That plan was drafted before the answers; it stays out
 *   of sight and never runs. The answers produce a new plan, which runs as usual.
 */
export type CoworkQuestionState = {
  /** Assistant message ids whose questions have been answered. */
  answered: ReadonlySet<string>;
  /** Assistant message ids whose plan is held back because questions came with it. */
  heldPlans: ReadonlySet<string>;
};

/** No questions anywhere: nothing answered, no plan held. */
export const EMPTY_QUESTION_STATE: CoworkQuestionState = { answered: new Set(), heldPlans: new Set() };

/** Whether two states hold the same ids (so a caller can keep the previous object). */
export function sameQuestionState(a: CoworkQuestionState, b: CoworkQuestionState): boolean {
  const same = (x: ReadonlySet<string>, y: ReadonlySet<string>) => x.size === y.size && [...x].every((id) => y.has(id));
  return same(a.answered, b.answered) && same(a.heldPlans, b.heldPlans);
}

/** Pure: the answered question messages and the held plans in a transcript. */
export function coworkQuestionState(messages: readonly UIMessage[]): CoworkQuestionState {
  let lastUser = -1;
  messages.forEach((message, index) => {
    if (message.role === "user") lastUser = index;
  });
  const answered = new Set<string>();
  const heldPlans = new Set<string>();
  let questionsThisTurn = false;
  messages.forEach((message, index) => {
    if (message.role === "user") {
      questionsThisTurn = false;
      return;
    }
    if (message.role !== "assistant") return;
    const blocks = parseCoworkBlocks(getMessagesText([message]));
    if (blocks.questions) {
      questionsThisTurn = true;
      if (index < lastUser) answered.add(message.id);
    }
    if (blocks.plan && questionsThisTurn) heldPlans.add(message.id);
  });
  return { answered, heldPlans };
}
