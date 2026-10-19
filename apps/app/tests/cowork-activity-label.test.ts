import { describe, expect, test } from "bun:test";
import type { DynamicToolUIPart } from "ai";

import { currentActivityLabel, isWebStepInFlight, latestReasoningLead } from "../src/components/chat/unified-activity";
import { nextWorkingLineIndex } from "../src/lib/working-lines";

// The live activity label follows what the run is doing now.

const tool = (toolName: string, state: string, input: Record<string, unknown>) =>
  ({ type: "dynamic-tool", toolName, toolCallId: `${toolName}-${state}`, state, input, output: "" }) as unknown as DynamicToolUIPart;

describe("latestReasoningLead", () => {
  test("takes the NEWEST paragraph, not the first; empty gives nothing", () => {
    const reasoning = "I will start by planning the memo.\n\nNow comparing chip export rules across 2024 and 2026.";
    expect(latestReasoningLead(reasoning)).toBe("Now comparing chip export rules across 2024 and 2026.");
    expect(latestReasoningLead("   ")).toBeNull();
  });

  test("a bold step heading wins over its body", () => {
    expect(latestReasoningLead("**Planning**\n\nFirst things.\n\n**Checking export rules**\nLooking at BIS.")).toBe("Checking export rules");
  });
});

describe("currentActivityLabel", () => {
  test("a tool in flight wins, then the newest thought, then the friendly fallback", () => {
    const running = [tool("websearch", "input-available", { query: "US chip export rules 2026" })];
    expect(currentActivityLabel(running, "Old thought.", "Mulling it over...")).toContain("US chip export rules 2026");
    const finished = [tool("websearch", "output-available", { query: "q" })];
    expect(currentActivityLabel(finished, "First.\n\nDrafting the scenarios section.")).toBe("Drafting the scenarios section.");
    expect(currentActivityLabel([], "", "Mulling it over...")).toBe("Mulling it over...");
  });
});

describe("rotating working lines", () => {
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
});

describe("web steps show a static globe, not the loader", () => {
  test("a running search or read counts; a finished one or a running non-web tool does not", () => {
    expect(isWebStepInFlight([tool("websearch", "input-available", { query: "q" })])).toBe(true);
    expect(isWebStepInFlight([tool("webfetch", "input-available", { url: "https://a.example" })])).toBe(true);
    expect(isWebStepInFlight([tool("webfetch", "output-available", { url: "https://a.example" })])).toBe(false);
    expect(isWebStepInFlight([tool("bash", "input-available", { command: "ls" })])).toBe(false);
    expect(isWebStepInFlight([])).toBe(false);
  });
});
