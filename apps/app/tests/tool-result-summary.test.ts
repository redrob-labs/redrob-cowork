import { describe, expect, test } from "bun:test";

import {
  extractToolResultFacts,
  formatToolResultSummary,
  readToolResultFacts,
} from "../src/lib/tool-result-summary";

describe("extractToolResultFacts", () => {
  test("keeps the bash exit code, including a non-zero one", () => {
    expect(extractToolResultFacts("bash", { exit: 0, output: "x".repeat(5000) })).toEqual({ exit: 0 });
    expect(extractToolResultFacts("bash", { exit: 2 })).toEqual({ exit: 2 });
  });

  test("does not copy the bulky fields it was given", () => {
    const facts = extractToolResultFacts("read", {
      loaded: ["a", "b", "c"],
      preview: "x".repeat(10_000),
    });

    expect(facts).toEqual({ loaded: 3 });
  });

  test("reads counts per tool", () => {
    expect(extractToolResultFacts("grep", { matches: 7 })).toEqual({ matches: 7 });
    expect(extractToolResultFacts("glob", { count: 4 })).toEqual({ count: 4 });
    expect(extractToolResultFacts("lsp", { result: [1, 2] })).toEqual({ count: 2 });
  });

  test("reads diff stats from the file diff", () => {
    expect(
      extractToolResultFacts("edit", { filediff: { additions: 12, deletions: 3, file: "a.ts", patch: "…" } }),
    ).toEqual({ additions: 12, deletions: 3 });
  });

  test("flags truncation for any tool", () => {
    expect(extractToolResultFacts("grep", { matches: 1, truncated: true })).toEqual({
      matches: 1,
      truncated: true,
    });
  });

  test("returns null when there is nothing to summarize", () => {
    expect(extractToolResultFacts("bash", {})).toBe(null);
    expect(extractToolResultFacts("bash", undefined)).toBe(null);
    expect(extractToolResultFacts("unknown_mcp_tool", { anything: 1 })).toBe(null);
  });
});

describe("formatToolResultSummary", () => {
  test("renders a summary line for facts", () => {
    expect(formatToolResultSummary({ exit: 0 })).toBeTruthy();
    expect(formatToolResultSummary({ matches: 3 })).toContain("3");
    expect(formatToolResultSummary({ additions: 12, deletions: 3 })).toContain("12");
  });

  test("joins several facts", () => {
    const summary = formatToolResultSummary({ matches: 3, truncated: true });
    expect(summary?.includes("·")).toBe(true);
  });

  test("says nothing rather than inventing a zero", () => {
    expect(formatToolResultSummary(null)).toBe(null);
    expect(formatToolResultSummary({})).toBe(null);
    expect(formatToolResultSummary({ exit: null })).toBe(null);
  });
});

describe("readToolResultFacts", () => {
  test("reads facts back off the part's provider metadata", () => {
    expect(readToolResultFacts({ redrob: { resultFacts: { matches: 2 } } })).toEqual({ matches: 2 });
  });

  test("tolerates every shape a part can arrive in", () => {
    expect(readToolResultFacts(undefined)).toBe(null);
    expect(readToolResultFacts({ opencode: { partId: "p" } })).toBe(null);
    expect(readToolResultFacts({ redrob: { mcpResult: {} } })).toBe(null);
  });
});
