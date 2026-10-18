import { describe, expect, test } from "bun:test";

import { effectiveCoworkMode, isComplexPrompt } from "../src/react-app/cowork/composer/composer-state";

describe("cowork complex-prompt auto-plan heuristic", () => {
  test("a short simple ask is NOT complex", () => {
    expect(isComplexPrompt("what time is it")).toBe(false);
    expect(isComplexPrompt("rename this file")).toBe(false);
  });

  test("research / analysis / predict keywords read as complex", () => {
    expect(isComplexPrompt("deep research the US-China AI race")).toBe(true);
    expect(isComplexPrompt("analyze our Q3 numbers")).toBe(true);
    expect(isComplexPrompt("predict where the market goes")).toBe(true);
    expect(isComplexPrompt("write a report on this")).toBe(true);
  });

  test("a long free-form ask is complex even without a keyword", () => {
    const long = "I would like you to look at everything that we have gathered together so far across all of our previous conversations and then tell me the single best way to move forward from here, taking into account every one of the constraints and tradeoffs that we have talked about together in a lot of detail.";
    expect(long.length).toBeGreaterThanOrEqual(180);
    expect(isComplexPrompt(long)).toBe(true);
  });

  test("effectiveCoworkMode upgrades run -> plan for a complex prompt only", () => {
    expect(effectiveCoworkMode("run", "deep research the AI race")).toBe("plan");
    expect(effectiveCoworkMode("run", "say hi")).toBe("run");
  });

  test("an explicit plan or run choice is respected (plan stays plan)", () => {
    expect(effectiveCoworkMode("plan", "say hi")).toBe("plan");
    // A user on run with a simple ask stays on run.
    expect(effectiveCoworkMode("run", "ok")).toBe("run");
  });
});
