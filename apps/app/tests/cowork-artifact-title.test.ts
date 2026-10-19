import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { getArtifactsFromMessages, isArtifactWriteInFlight, prettyArtifactTitle } from "../src/lib/artifacts";

describe("prettyArtifactTitle (item 4)", () => {
  test("strips the extension, turns dashes/underscores into spaces, Sentence case", () => {
    // Round-7 calibration: Sentence case, NOT Title Case, NOT acronym-aware.
    expect(prettyArtifactTitle("us-china-ai-race.md")).toBe("Us china ai race");
    expect(prettyArtifactTitle("quarterly_report_2026.docx")).toBe("Quarterly report 2026");
    expect(prettyArtifactTitle("notes.txt")).toBe("Notes");
  });

  test("takes only the basename, not the folders", () => {
    expect(prettyArtifactTitle("workspaces/w1/sub dir/final-draft.md")).toBe("Final draft");
    expect(prettyArtifactTitle("C:\\Users\\kim\\plan-b.md")).toBe("Plan b");
  });

  test("collapses repeated separators and falls back to the raw basename when empty", () => {
    expect(prettyArtifactTitle("a--b__c.md")).toBe("A b c");
    // An extension-only name has no stem to humanize, so the basename is kept.
    expect(prettyArtifactTitle(".gitignore")).toBe(".gitignore");
  });
});

describe("isArtifactWriteInFlight (item 8)", () => {
  const writePart = (filePath: string, state: string): UIMessage["parts"][number] =>
    ({ type: "dynamic-tool", toolName: "write", toolCallId: "c1", state, input: { filePath } }) as unknown as UIMessage["parts"][number];

  const message = (parts: UIMessage["parts"]): UIMessage => ({ id: "m1", role: "assistant", parts });

  test("true while a write/edit for the path is still streaming or running", () => {
    expect(isArtifactWriteInFlight([message([writePart("/w/report.md", "input-streaming")])], "/w/report.md")).toBe(true);
    expect(isArtifactWriteInFlight([message([writePart("/w/report.md", "input-available")])], "/w/report.md")).toBe(true);
  });

  test("false once the write has settled (output-available or output-error)", () => {
    expect(isArtifactWriteInFlight([message([writePart("/w/report.md", "output-available")])], "/w/report.md")).toBe(false);
    expect(isArtifactWriteInFlight([message([writePart("/w/report.md", "output-error")])], "/w/report.md")).toBe(false);
  });

  test("false for a different path, and matches regardless of path normalization", () => {
    expect(isArtifactWriteInFlight([message([writePart("/w/other.md", "input-streaming")])], "/w/report.md")).toBe(false);
    // The in-chat card passes the artifact's normalized path; a leading ./ on the tool input still matches.
    expect(isArtifactWriteInFlight([message([writePart("./w/report.md", "input-streaming")])], "w/report.md")).toBe(true);
  });

  test("covers an in-flight apply_patch whose path lives in patchText (M2)", () => {
    const applyPatch = (patchText: string, state: string): UIMessage["parts"][number] =>
      ({ type: "dynamic-tool", toolName: "apply_patch", toolCallId: "c2", state, input: { patchText } }) as unknown as UIMessage["parts"][number];
    const patch = "*** Begin Patch\n*** Add File: /w/report.md\n+hello\n*** End Patch";
    expect(isArtifactWriteInFlight([message([applyPatch(patch, "input-available")])], "/w/report.md")).toBe(true);
    expect(isArtifactWriteInFlight([message([applyPatch(patch, "output-available")])], "/w/report.md")).toBe(false);
  });
});

describe("in-flight write cards (item 8 / M1)", () => {
  const writePart = (filePath: string, state: string): UIMessage["parts"][number] =>
    ({ type: "dynamic-tool", toolName: "write", toolCallId: "c1", state, input: { filePath } }) as unknown as UIMessage["parts"][number];
  const message = (parts: UIMessage["parts"]): UIMessage => ({ id: "m1", role: "assistant", parts });

  test("a still-streaming write surfaces a provisional card only when opted in", () => {
    const msgs = [message([writePart("/w/report.md", "input-streaming")])];
    // Default (Files strip): a non-settled write is NOT collected - card appears only once settled.
    expect(getArtifactsFromMessages(msgs, [], { includeTargetFallbacks: false }).length).toBe(0);
    // Cowork card list opts in: the in-flight write gets a provisional card, so the caret can show.
    const cards = getArtifactsFromMessages(msgs, [], { includeTargetFallbacks: false, includeInFlightWrites: true });
    expect(cards.map((a) => a.path)).toEqual(["/w/report.md"]);
  });
});

describe("writtenOnly cards (round 7 C2)", () => {
  const text = (value: string): UIMessage["parts"][number] => ({ type: "text", text: value }) as UIMessage["parts"][number];
  const tool = (toolName: string, state: string, input: Record<string, unknown>): UIMessage["parts"][number] =>
    ({ type: "dynamic-tool", toolName, toolCallId: `${toolName}-${state}`, state, input, output: "" }) as unknown as UIMessage["parts"][number];
  const message = (parts: UIMessage["parts"]): UIMessage => ({ id: "m1", role: "assistant", parts });

  test("a path only MENTIONED in prose makes no card (the plan's 'Save as reports/x.md')", () => {
    const messages = [message([text("Draft the memo, saved as a Markdown file. Save as reports/us-china-ai-race-outlook.md.")])];
    expect(getArtifactsFromMessages(messages, [], { includeTargetFallbacks: false, writtenOnly: true })).toHaveLength(0);
    // The bare surface's Files strip still collects mentioned paths (default behaviour unchanged).
    expect(getArtifactsFromMessages(messages, [], { includeTargetFallbacks: false }).map((a) => a.path)).toEqual(["reports/us-china-ai-race-outlook.md"]);
  });

  test("a read is not a deliverable; a settled write is", () => {
    const messages = [message([
      tool("read", "output-available", { filePath: "notes/source.md" }),
      tool("write", "output-available", { filePath: "reports/outlook.md" }),
    ])];
    expect(getArtifactsFromMessages(messages, [], { includeTargetFallbacks: false, writtenOnly: true }).map((a) => a.path)).toEqual(["reports/outlook.md"]);
  });

  test("an in-flight write still gets its card under writtenOnly", () => {
    const messages = [message([tool("write", "input-streaming", { filePath: "reports/outlook.md" })])];
    expect(getArtifactsFromMessages(messages, [], { includeTargetFallbacks: false, includeInFlightWrites: true, writtenOnly: true })).toHaveLength(1);
  });
});
