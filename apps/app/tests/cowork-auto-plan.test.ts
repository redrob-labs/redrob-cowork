import { describe, expect, test } from "bun:test";

import { effectiveCoworkMode, isComplexPrompt } from "../src/react-app/cowork/composer/composer-state";
import { isPlanRunPrompt, planRunPrompt } from "../src/react-app/cowork/thread/thread-logic";

describe("cowork complex-prompt auto-plan heuristic", () => {
  test("keywords or length read as complex; a complex Run prompt upgrades to Plan, a chosen mode is kept", () => {
    const long = "I would like you to look at everything that we have gathered together so far across all of our previous conversations and then tell me the single best way to move forward from here, taking into account every one of the constraints and tradeoffs that we have talked about together in a lot of detail.";
    const cases: Array<[string, boolean]> = [
      ["what time is it", false],
      ["rename this file", false],
      ["deep research the US-China AI race", true],
      ["analyze our Q3 numbers", true],
      ["write a report on this", true],
      [long, true],
    ];
    for (const [prompt, complex] of cases) expect(isComplexPrompt(prompt)).toBe(complex);
    expect(effectiveCoworkMode("run", "deep research the AI race")).toBe("plan");
    expect(effectiveCoworkMode("run", "say hi")).toBe("run");
    expect(effectiveCoworkMode("plan", "say hi")).toBe("plan");
  });

  test("a plan being RUN is never upgraded back to Plan (no plan -> plan loop)", () => {
    // The run prompt carries the whole plan and says "plan", so it always reads as complex.
    const runPrompt = planRunPrompt("Step 1. Research the market.\nStep 2. Draft the report.");
    expect(isPlanRunPrompt(runPrompt)).toBe(true);
    expect(isComplexPrompt(runPrompt)).toBe(true);
    expect(effectiveCoworkMode("run", runPrompt, isPlanRunPrompt(runPrompt))).toBe("run");
  });
});
