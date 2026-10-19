import { describe, expect, test } from "bun:test";

import { getDisplaySessionTitle, isBlockMarkerTitle, titleFromPrompt } from "../src/app/lib/session-title";
import { firstPromptText, sessionsNeedingTitle } from "../src/react-app/cowork/thread/use-repair-marker-titles";

// Round 9 (R9-1): a chat the server titled with a Cowork block's fence line is never shown so,
// and is renamed after the person's first prompt.

describe("isBlockMarkerTitle", () => {
  test("fence lines and bare block names are markers", () => {
    expect(isBlockMarkerTitle("```redrob-questions")).toBe(true);
    expect(isBlockMarkerTitle("  ```redrob-plan  ")).toBe(true);
    expect(isBlockMarkerTitle("redrob-questions")).toBe(true);
    expect(isBlockMarkerTitle("~~~")).toBe(true);
  });

  test("ordinary titles are not", () => {
    expect(isBlockMarkerTitle("US-China AI race prediction")).toBe(false);
    expect(isBlockMarkerTitle("Redrob questions for the board")).toBe(false);
    expect(isBlockMarkerTitle("")).toBe(false);
    expect(isBlockMarkerTitle(null)).toBe(false);
  });

  test("the display falls back instead of showing a marker", () => {
    expect(getDisplaySessionTitle("```redrob-questions", "Fallback")).toBe("Fallback");
    expect(getDisplaySessionTitle("A real title", "Fallback")).toBe("A real title");
  });
});

describe("titleFromPrompt", () => {
  test("short prompts are kept, first letter up, end punctuation dropped", () => {
    expect(titleFromPrompt("compare the two vendors.")).toBe("Compare the two vendors");
  });

  test("long prompts cut on a word with an ellipsis", () => {
    const title = titleFromPrompt("Deep research, deep think and tell me where you predict the AI race will go between China and the U.S.");
    expect(title.endsWith("\u2026")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.startsWith("Deep research, deep think and tell me where you")).toBe(true);
    expect(title).not.toMatch(/\s\u2026$/);
  });

  test("first non-empty line only; empty stays empty", () => {
    expect(titleFromPrompt("\n\n  Plan my week\nwith details")).toBe("Plan my week");
    expect(titleFromPrompt("   ")).toBe("");
  });
});

describe("marker title repair helpers", () => {
  test("first prompt skips assistant and synthetic text", () => {
    const messages = [
      { info: { role: "assistant" }, parts: [{ type: "text", text: "hi" }] },
      { info: { role: "user" }, parts: [{ type: "text", text: "system note", synthetic: true }, { type: "text", text: "Real ask" }] },
    ];
    expect(firstPromptText(messages)).toBe("Real ask");
    expect(firstPromptText([])).toBe("");
  });

  test("only untried marker titles need a repair", () => {
    const sessions = [
      { id: "a", title: "```redrob-questions" },
      { id: "b", title: "Fine" },
      { id: "c", title: "```redrob-plan" },
    ];
    expect(sessionsNeedingTitle(sessions, new Set(["c"]))).toEqual(["a"]);
  });
});
