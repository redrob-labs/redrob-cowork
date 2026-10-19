import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { coworkQuestionState } from "../src/react-app/cowork/thread/question-state";

// Questions stay open until the person answers; a plan drafted beside them is held.

const fence = (tag: string, body: unknown) => `\`\`\`${tag}\n${JSON.stringify(body)}\n\`\`\``;
const QUESTIONS = fence("redrob-questions", [{ id: "q1", question: "Memo or deck?", options: ["Memo", "Deck"], defaultValue: 0 }]);
const PLAN = fence("redrob-plan", { title: "Research plan", summary: "A memo.", sections: [], todo: [{ label: "Search" }] });
const msg = (id: string, role: "user" | "assistant", text: string): UIMessage => ({ id, role, parts: [{ type: "text", text }] });

describe("coworkQuestionState", () => {
  test("questions followed by more agent output (not a reply) stay OPEN, and the plan beside them is held", () => {
    const state = coworkQuestionState([
      msg("u1", "user", "Predict the US-China AI race"),
      msg("a1", "assistant", QUESTIONS),
      msg("a2", "assistant", PLAN),
    ]);
    expect(state.answered.has("a1")).toBe(false);
    expect(state.heldPlans.has("a2")).toBe(true);
  });

  test("a reply after the questions (the hidden answer send counts) answers them; the next plan runs free", () => {
    const state = coworkQuestionState([
      msg("u1", "user", "Predict"),
      msg("a1", "assistant", `${QUESTIONS}\n\n${PLAN}`),
      msg("u2", "user", "\u2060\ufeffMemo or deck? Memo."),
      msg("a2", "assistant", PLAN),
    ]);
    expect(state.answered.has("a1")).toBe(true);
    expect(state.heldPlans.has("a1")).toBe(true);
    expect(state.heldPlans.has("a2")).toBe(false);
  });

  test("a plan with no questions in its turn is never held", () => {
    expect(coworkQuestionState([msg("u1", "user", "Go"), msg("a1", "assistant", PLAN)]).heldPlans.size).toBe(0);
  });

});
