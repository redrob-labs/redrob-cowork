import { describe, expect, test } from "bun:test";
import type { DynamicToolUIPart } from "ai";

import { webStepsMeta, webStepsOf } from "../src/components/chat/web-research-group";
import { parseWebSearchResults } from "../src/lib/websearch-results";

// Round 8b: web research reads as a Claude-style table with each search's sources.

const JSON_OUTPUT = JSON.stringify({
  search_id: "s1",
  results: [
    { url: "https://www.congress.gov/crs-product/R48642", title: "U.S. Export Controls and China", publish_date: null, excerpts: ["export controls..."] },
    { url: "https://www.huaweicentral.com/deepseek-huawei-ai-chips-tools/", title: "DeepSeek introduces new core tools", publish_date: "2026-09-30", excerpts: [] },
    { url: "not a url", title: "skip me" },
  ],
});

const search = (query: string, output?: string, state = "output-available") =>
  ({ type: "dynamic-tool", toolName: "websearch", toolCallId: `ws-${query}`, state, input: { query }, output }) as unknown as DynamicToolUIPart;

describe("parseWebSearchResults", () => {
  test("reads the JSON results shape the engine returns now", () => {
    const results = parseWebSearchResults(JSON_OUTPUT);
    expect(results.map((result) => result.title)).toEqual(["U.S. Export Controls and China", "DeepSeek introduces new core tools"]);
    expect(results[1]?.publishedAt).toBe("2026-09-30");
  });

  test("still reads the older Title/URL block shape, and ignores non-strings", () => {
    expect(parseWebSearchResults("Title: A\nURL: https://a.example/x\nHighlights: hi")[0]).toMatchObject({ title: "A", url: "https://a.example/x" });
    expect(parseWebSearchResults(undefined)).toEqual([]);
    expect(parseWebSearchResults("{ broken json")).toEqual([]);
  });
});

describe("webStepsOf / webStepsMeta", () => {
  test("one row per search with its sources; running and non-web parts handled", () => {
    const parts = [
      search("US China AI race", JSON_OUTPUT),
      search("Huawei Ascend", undefined, "input-available"),
      { type: "dynamic-tool", toolName: "bash", toolCallId: "b", state: "output-available", input: {} } as unknown as DynamicToolUIPart,
    ];
    const steps = webStepsOf(parts);
    expect(steps.map((step) => [step.label, step.results.length, step.running])).toEqual([
      ["US China AI race", 2, false],
      ["Huawei Ascend", 0, true],
    ]);
    expect(webStepsMeta(steps)).toBe("2 searches · 2 sources");
  });
});
