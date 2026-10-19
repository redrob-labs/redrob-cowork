import { describe, expect, test } from "bun:test";
import type { DynamicToolUIPart } from "ai";

import { currentActivityLabel, latestReasoningLead } from "../src/components/chat/unified-activity";

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
});
