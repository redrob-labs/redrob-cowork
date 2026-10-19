import { describe, expect, test } from "bun:test";

import {
  CHAT_TITLE_MAX_WORDS,
  cleanGeneratedTitle,
  isPromptDerivedTitle,
  shortTitleFromPrompt,
} from "../src/app/lib/session-title";
import { namingAnswer, namingPrompt, sessionsToTitle } from "../src/react-app/cowork/thread/use-repair-marker-titles";

// Round 10 (R1): chat titles under 7 words, named from the subject rather than the prompt's opening.

const words = (title: string) => title.split(/\s+/).filter(Boolean).length;

describe("shortTitleFromPrompt", () => {
  test("drops filler openers and keeps the subject", () => {
    const title = shortTitleFromPrompt("Deep research, deep think and tell me where you predict the US-China AI race will be in 2035.");
    expect(title.startsWith("US-China AI race")).toBe(true);
    expect(words(title)).toBeLessThanOrEqual(CHAT_TITLE_MAX_WORDS);
  });

  test("drops a 'write a short brief' opener", () => {
    expect(shortTitleFromPrompt("Research and write a short brief on solid-state batteries in 2026")).toBe("Solid-state batteries in 2026");
  });

  test("caps at six words, never ends on a connecting word, no ellipsis", () => {
    const title = shortTitleFromPrompt("Compare the pricing models of the three largest cloud vendors for startups");
    expect(words(title)).toBeLessThanOrEqual(CHAT_TITLE_MAX_WORDS);
    expect(title).not.toMatch(/\u2026|\.\.\.|\b(of|the|and|for)$/);
  });

  test("Korean prompts are capped by word too", () => {
    const title = shortTitleFromPrompt("2026년 국내 전기차 배터리 시장 점유율 변화와 주요 업체 전략을 정리해줘");
    expect(words(title)).toBeLessThanOrEqual(CHAT_TITLE_MAX_WORDS);
    expect(title.startsWith("2026년")).toBe(true);
  });

  test("empty in, empty out", () => {
    expect(shortTitleFromPrompt("   ")).toBe("");
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

describe("sessionsToTitle", () => {
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
});

describe("naming request", () => {
  test("asks for a short title and carries the prompt", () => {
    const text = namingPrompt("Compare vendors");
    expect(text).toContain("2 to 6 words");
    expect(text.endsWith("Compare vendors")).toBe(true);
  });
  test("reads only a finished answer", () => {
    const running = [{ info: { role: "assistant", time: {} }, parts: [{ type: "text", text: "Vendor" }] }];
    const done = [{ info: { role: "assistant", time: { completed: 1 } }, parts: [{ type: "text", text: "Vendor comparison" }] }];
    expect(namingAnswer(running)).toBeNull();
    expect(namingAnswer(done)).toBe("Vendor comparison");
  });
});
