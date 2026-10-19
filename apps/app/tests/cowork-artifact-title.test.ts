import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { isArtifactWriteInFlight, prettyArtifactTitle } from "../src/lib/artifacts";

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
});
