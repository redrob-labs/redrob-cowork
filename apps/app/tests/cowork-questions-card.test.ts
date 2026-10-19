import { describe, expect, test } from "bun:test";

import { initialAnswers, isPicked, toggleOption } from "../src/react-app/cowork/thread/cowork-questions";
import { answersToPrompt, isQuestionAnswerPrompt } from "../src/react-app/cowork/thread/thread-logic";

// Round 9 (R9-2): the app's own questions card: options, a typed answer per question, Execute.

const single = { id: "who", question: "Who is this for?", options: ["You", "A team", "Investors"] };
const multi = { id: "weigh", question: "What should it weigh?", options: ["Models", "Chips", "Adoption"], multi: true };

describe("toggleOption / isPicked", () => {
  test("a single-answer question picks one, and tapping it again clears it", () => {
    expect(toggleOption(single, null, 1)).toBe(1);
    expect(toggleOption(single, 1, 2)).toBe(2);
    expect(toggleOption(single, 2, 2)).toBeNull();
  });

  test("a multi-answer question adds and removes, kept in order", () => {
    expect(toggleOption(multi, null, 2)).toEqual([2]);
    expect(toggleOption(multi, [2], 0)).toEqual([0, 2]);
    expect(toggleOption(multi, [0, 2], 2)).toEqual([0]);
    expect(isPicked([0, 2], 2)).toBe(true);
    expect(isPicked(1, 2)).toBe(false);
  });

  test("defaults seed the answers", () => {
    expect(initialAnswers([{ ...single, defaultValue: 0 }, multi])).toEqual({ who: 0, weigh: null });
  });
});

describe("answersToPrompt with typed answers", () => {
  test("a typed answer replaces that question's picks; others keep theirs", () => {
    const prompt = answersToPrompt([single, multi], { who: 0, weigh: [1] }, { who: "My board, as a memo" });
    expect(isQuestionAnswerPrompt(prompt)).toBe(true);
    expect(prompt).toContain("Who is this for? My board, as a memo.");
    expect(prompt).not.toContain("Who is this for? You");
    expect(prompt).toContain("What should it weigh? Chips.");
  });

  test("blank typed text counts as no typed answer", () => {
    expect(answersToPrompt([single], { who: 2 }, { who: "   " })).toContain("Who is this for? Investors.");
  });
});
