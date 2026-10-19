import { describe, expect, test } from "bun:test";

import {
  CHAT_TITLE_MAX_WORDS,
  cleanGeneratedTitle,
  getDisplaySessionTitle,
  isBlockMarkerTitle,
  isPromptDerivedTitle,
  shortTitleFromPrompt,
  shownChatTitle,
} from "../src/app/lib/session-title";
import { firstPromptText, namingAnswer, sessionsToTitle } from "../src/react-app/cowork/thread/use-chat-titles";
import { answersToPrompt, planRunPrompt } from "../src/react-app/cowork/thread/thread-logic";

// Chat titles stay under 7 words, named from the subject rather than the prompt's opening; a title
// that is a Cowork block's fence line is never shown.

const words = (title: string) => title.split(/\s+/).filter(Boolean).length;

describe("shortTitleFromPrompt", () => {
  test("drops filler openers and keeps the subject", () => {
    const title = shortTitleFromPrompt("Deep research, deep think and tell me where you predict the US-China AI race will be in 2035.");
    expect(title.startsWith("US-China AI race")).toBe(true);
    expect(words(title)).toBeLessThanOrEqual(CHAT_TITLE_MAX_WORDS);
  });

  test("caps at six words, never ends on a connecting word, no ellipsis; empty stays empty", () => {
    const title = shortTitleFromPrompt("Compare the pricing models of the three largest cloud vendors for startups");
    expect(words(title)).toBeLessThanOrEqual(CHAT_TITLE_MAX_WORDS);
    expect(title).not.toMatch(/\u2026|\.\.\.|\b(of|the|and|for)$/);
    expect(shortTitleFromPrompt("   ")).toBe("");
  });

  test("Korean prompts are capped by word too", () => {
    const title = shortTitleFromPrompt("2026년 국내 전기차 배터리 시장 점유율 변화와 주요 업체 전략을 정리해줘");
    expect(words(title)).toBeLessThanOrEqual(CHAT_TITLE_MAX_WORDS);
    expect(title.startsWith("2026년")).toBe(true);
  });
});

describe("cleanGeneratedTitle", () => {
  test("strips quotes, labels and closing punctuation", () => {
    expect(cleanGeneratedTitle('Title: "US-China AI race to 2035."')).toBe("US-China AI race to 2035");
    expect(cleanGeneratedTitle("**Solid-state battery outlook**\n")).toBe("Solid-state battery outlook");
  });

  test("refuses blocks, JSON and long answers", () => {
    expect(cleanGeneratedTitle("```redrob-check\n{}\n```")).toBe("");
    expect(cleanGeneratedTitle('{"title":"x"}')).toBe("");
    expect(cleanGeneratedTitle("This is a very long sentence that is clearly not a short chat title")).toBe("");
    expect(cleanGeneratedTitle("")).toBe("");
  });
});

describe("isPromptDerivedTitle", () => {
  const prompt = "Research and write a short brief on solid-state batteries";
  test("the prompt's own opening words, with or without a trailing mark", () => {
    expect(isPromptDerivedTitle("Research and write a short brief ~", prompt)).toBe(true);
    expect(isPromptDerivedTitle("Research and write a short brief\u2026", prompt)).toBe(true);
  });
  test("markers and the default title count as prompt-made", () => {
    expect(isPromptDerivedTitle("```redrob-questions", prompt)).toBe(true);
    expect(isPromptDerivedTitle("New session", prompt)).toBe(true);
    expect(isPromptDerivedTitle("", prompt)).toBe(true);
  });
  test("a title the person chose is left alone", () => {
    expect(isPromptDerivedTitle("Battery notes for Q3", prompt)).toBe(false);
  });
});

describe("block marker titles", () => {
  test("fence lines and bare block names are markers; ordinary titles are not", () => {
    expect(isBlockMarkerTitle("```redrob-questions")).toBe(true);
    expect(isBlockMarkerTitle("  ```redrob-plan  ")).toBe(true);
    expect(isBlockMarkerTitle("redrob-questions")).toBe(true);
    expect(isBlockMarkerTitle("~~~")).toBe(true);
    expect(isBlockMarkerTitle("Redrob questions for the board")).toBe(false);
    expect(isBlockMarkerTitle("")).toBe(false);
    expect(isBlockMarkerTitle(null)).toBe(false);
  });

  test("the display falls back instead of showing a marker", () => {
    expect(getDisplaySessionTitle("```redrob-questions", "Fallback")).toBe("Fallback");
    expect(getDisplaySessionTitle("A real title", "Fallback")).toBe("A real title");
    expect(shownChatTitle("```redrob-questions")).toBe("");
    expect(shownChatTitle(undefined)).toBe("");
  });
});

describe("naming pass", () => {
  test("marker titles first, then newest untried root chats, capped", () => {
    const sessions = [
      { id: "a", title: "Fine" },
      { id: "b", title: "Child", parentID: "a" },
      { id: "c", title: "```redrob-plan" },
      { id: "d", title: "Other" },
    ];
    expect(sessionsToTitle(sessions, new Set(["d"]))).toEqual(["c", "a"]);
    expect(sessionsToTitle(sessions, new Set(), 1)).toEqual(["c"]);
  });

  test("the first prompt skips assistant, synthetic and hidden Cowork sends", () => {
    const messages = [
      { info: { role: "assistant" }, parts: [{ type: "text", text: "hi" }] },
      { info: { role: "user" }, parts: [{ type: "text", text: "system note", synthetic: true }] },
      { info: { role: "user" }, parts: [{ type: "text", text: planRunPrompt("the plan") }] },
      { info: { role: "user" }, parts: [{ type: "text", text: answersToPrompt([], {}) }] },
      { info: { role: "user" }, parts: [{ type: "text", text: "Compare the vendors" }] },
    ];
    expect(firstPromptText(messages)).toBe("Compare the vendors");
    expect(firstPromptText([])).toBe("");
  });

  test("the naming answer is read only once it has finished", () => {
    const running = [{ info: { role: "assistant", time: {} }, parts: [{ type: "text", text: "Vendor" }] }];
    const done = [{ info: { role: "assistant", time: { completed: 1 } }, parts: [{ type: "text", text: "Vendor comparison" }] }];
    expect(namingAnswer(running)).toBeNull();
    expect(namingAnswer(done)).toBe("Vendor comparison");
  });
});
