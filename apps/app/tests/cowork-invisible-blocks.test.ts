import { describe, expect, test } from "bun:test";

import { isInvisibleCoworkText } from "../src/react-app/cowork/thread/invisible-blocks";

// Round 7 (review of C1/C7): a superseded questions-only message leaves no blank band.

const fence = (tag: string, body: unknown) => `\`\`\`${tag}\n${JSON.stringify(body)}\n\`\`\``;
const QUESTIONS = [{ id: "q1", question: "What do you need?", options: ["A memo", "A deck"], defaultValue: 0 }];
const PLAN = { title: "Research plan", summary: "A memo.", sections: [], todo: [{ label: "Search" }] };

describe("isInvisibleCoworkText", () => {
  test("questions-only text is invisible once superseded, visible while waiting", () => {
    expect(isInvisibleCoworkText(fence("redrob-questions", QUESTIONS), false)).toBe(true);
    expect(isInvisibleCoworkText(fence("redrob-questions", QUESTIONS), true)).toBe(false);
  });

  test("prose or a plan keeps the group", () => {
    expect(isInvisibleCoworkText(`A few questions first.\n\n${fence("redrob-questions", QUESTIONS)}`, false)).toBe(false);
    expect(isInvisibleCoworkText(fence("redrob-plan", PLAN), false)).toBe(false);
  });

  test("plain text without Cowork blocks is never hidden", () => {
    expect(isInvisibleCoworkText("Hello", false)).toBe(false);
    expect(isInvisibleCoworkText("", false)).toBe(false);
  });
});
