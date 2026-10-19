import { describe, expect, test } from "bun:test";
import type { DynamicToolUIPart } from "ai";

import { isWebResearchGroup } from "../src/components/chat/utils";

// Round 7 C7: web research rows stay in place during a live Cowork run.

const tool = (toolName: string, state = "output-available") =>
  ({ type: "dynamic-tool", toolName, toolCallId: `${toolName}-1`, state, input: { query: "q", url: "https://example.com" }, output: "" }) as unknown as DynamicToolUIPart;

describe("isWebResearchGroup", () => {
  test("a single web search or fetch counts, running or done", () => {
    expect(isWebResearchGroup({ kind: "tool", part: tool("websearch") })).toBe(true);
    expect(isWebResearchGroup({ kind: "tool", part: tool("websearch", "input-streaming") })).toBe(true);
    expect(isWebResearchGroup({ kind: "tool", part: tool("webfetch") })).toBe(true);
  });

  test("an aggregate counts only when every call in it is web research", () => {
    expect(isWebResearchGroup({ kind: "tool-aggregate", parts: [tool("websearch"), tool("webfetch")] })).toBe(true);
    expect(isWebResearchGroup({ kind: "tool-aggregate", parts: [tool("websearch"), tool("bash")] })).toBe(false);
    expect(isWebResearchGroup({ kind: "tool-aggregate", parts: [] })).toBe(false);
  });

  test("other tools, text and reasoning do not", () => {
    expect(isWebResearchGroup({ kind: "tool", part: tool("bash") })).toBe(false);
    expect(isWebResearchGroup({ kind: "text", text: "hello" })).toBe(false);
    expect(isWebResearchGroup({ kind: "reasoning", text: "x", isStreaming: false })).toBe(false);
  });
});
