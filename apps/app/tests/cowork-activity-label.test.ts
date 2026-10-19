import { describe, expect, test } from "bun:test";
import type { DynamicToolUIPart } from "ai";

import { currentActivityLabel, isWebStepInFlight, latestReasoningLead } from "../src/components/chat/unified-activity";
import { nextWorkingLineIndex, workingLine, WORKING_LINE_COUNT } from "../src/lib/working-lines";

// Round 8 M2: the "Working on it" line follows what the run is doing now.

const tool = (toolName: string, state: string, input: Record<string, unknown>) =>
  ({ type: "dynamic-tool", toolName, toolCallId: `${toolName}-${state}`, state, input, output: "" }) as unknown as DynamicToolUIPart;

describe("latestReasoningLead", () => {
  test("takes the NEWEST paragraph, not the first", () => {
    const reasoning = "I will start by planning the memo.\n\nNow comparing chip export rules across 2024 and 2026.";
    expect(latestReasoningLead(reasoning)).toBe("Now comparing chip export rules across 2024 and 2026.");
  });

  test("a bold step heading wins over its body", () => {
    expect(latestReasoningLead("**Planning**\n\nFirst things.\n\n**Checking export rules**\nLooking at BIS.")).toBe("Checking export rules");
  });

  test("empty reasoning gives nothing", () => {
    expect(latestReasoningLead("   ")).toBeNull();
  });
});

describe("currentActivityLabel", () => {
  test("a tool in flight wins", () => {
    const parts = [tool("websearch", "input-available", { query: "US chip export rules 2026" })];
    expect(currentActivityLabel(parts, "Old thought.")).toContain("US chip export rules 2026");
  });

  test("between tools, the newest thought shows", () => {
    const parts = [tool("websearch", "output-available", { query: "q" })];
    expect(currentActivityLabel(parts, "First.\n\nDrafting the scenarios section.")).toBe("Drafting the scenarios section.");
  });

  test("with no thought, the step that just finished shows instead of a generic line", () => {
    const parts = [tool("websearch", "output-available", { query: "Taiwan chip supply" })];
    expect(currentActivityLabel(parts, "")).toContain("Taiwan chip supply");
  });

  test("nothing at all falls back to Working on it", () => {
    expect(currentActivityLabel([], "")).toBe("Working on it");
  });

  test("round 8c: a friendly fallback line shows only when nothing specific is known", () => {
    expect(currentActivityLabel([], "", "Mulling it over…")).toBe("Mulling it over…");
    const parts = [tool("websearch", "input-available", { query: "chip rules" })];
    expect(currentActivityLabel(parts, "", "Mulling it over…")).toContain("chip rules");
  });
});

describe("round 8c: rotating working lines", () => {
  test("ten distinct lines, all translated", () => {
    expect(WORKING_LINE_COUNT).toBe(10);
    const lines = Array.from({ length: WORKING_LINE_COUNT }, (_, index) => workingLine(index));
    expect(new Set(lines).size).toBe(10);
    for (const line of lines) expect(line.startsWith("cowork.")).toBe(false);
  });

  test("the next line never repeats the one just shown", () => {
    for (let previous = 0; previous < 10; previous += 1) {
      for (const roll of [0, 0.2, 0.5, 0.8, 0.9999]) {
        const next = nextWorkingLineIndex(previous, 10, () => roll);
        expect(next).not.toBe(previous);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(10);
      }
    }
  });

  test("the first line can be any of them", () => {
    expect(nextWorkingLineIndex(null, 10, () => 0)).toBe(0);
    expect(nextWorkingLineIndex(null, 10, () => 0.9999)).toBe(9);
  });
});


describe("round 9: web steps show a static globe, not the loader", () => {
  test("a running search or read counts; a finished one or a running non-web tool does not", () => {
    expect(isWebStepInFlight([tool("websearch", "input-available", { query: "q" })])).toBe(true);
    expect(isWebStepInFlight([tool("webfetch", "input-available", { url: "https://a.example" })])).toBe(true);
    expect(isWebStepInFlight([tool("webfetch", "output-available", { url: "https://a.example" })])).toBe(false);
    expect(isWebStepInFlight([tool("bash", "input-available", { command: "ls" })])).toBe(false);
    expect(isWebStepInFlight([])).toBe(false);
  });
});
