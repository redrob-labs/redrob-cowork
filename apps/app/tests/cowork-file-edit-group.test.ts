import { describe, expect, test } from "bun:test";

import { fileStepsHeader, fileStepsOf, isFileEditParts } from "../src/components/chat/file-edit-group";
import type { AnyToolPart } from "../src/lib/tool-aggregate";

// File edits read as the web-research style table, one row per file.

function tool(toolName: string, input: Record<string, unknown>, state = "output-available", id = Math.random().toString(36)): AnyToolPart {
  return { type: "dynamic-tool", toolName, toolCallId: id, state, input, output: "" } as unknown as AnyToolPart;
}

describe("file edit table", () => {
  test("only file-family parts with a path make a table", () => {
    expect(isFileEditParts([tool("write", { filePath: "a.md", content: "x" })])).toBe(true);
    expect(isFileEditParts([tool("write", { filePath: "a.md" }), tool("bash", { command: "ls" })])).toBe(false);
    expect(isFileEditParts([])).toBe(false);
  });

  test("one step per file; a write makes it 'created', edits alone 'edited'", () => {
    const steps = fileStepsOf([
      tool("write", { filePath: "reports/brief.md", content: "x" }),
      tool("edit", { filePath: "reports/brief.md" }),
      tool("edit", { filePath: "notes.md" }),
    ]);
    expect(steps.map((step) => [step.path, step.kind])).toEqual([
      ["reports/brief.md", "created"],
      ["notes.md", "edited"],
    ]);
    const states = fileStepsOf([
      tool("write", { filePath: "a.md" }, "input-available"),
      tool("edit", { filePath: "b.md" }, "output-error"),
    ]);
    expect(states.map((step) => [step.running, step.failed])).toEqual([[true, false], [false, true]]);
    // A mix of writes and edits reads as edited.
    expect(fileStepsHeader(fileStepsOf([tool("write", { filePath: "a.md" }), tool("edit", { filePath: "b.md" })]))).toBe("Edited 2 files");
  });
});
