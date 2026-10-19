import { describe, expect, test } from "bun:test";

import { fileStepsHeader, fileStepsOf, isFileEditParts } from "../src/components/chat/file-edit-group";
import type { AnyToolPart } from "../src/lib/tool-aggregate";

// File edits read as the web-research style table, one row per file.

let nextId = 0;
function tool(toolName: string, input: Record<string, unknown>, state = "output-available"): AnyToolPart {
  nextId += 1;
  return { type: "dynamic-tool", toolName, toolCallId: `call-${nextId}`, state, input, output: "" } as unknown as AnyToolPart;
}

describe("file edit table", () => {
  test("only file-family parts naming a path make a table", () => {
    expect(isFileEditParts([tool("write", { filePath: "a.md", content: "x" })])).toBe(true);
    expect(isFileEditParts([tool("apply_patch", { patchText: "*** Begin Patch\n*** Update File: a.md\n*** End Patch" })])).toBe(true);
    expect(isFileEditParts([tool("write", { filePath: "a.md" }), tool("bash", { command: "ls" })])).toBe(false);
    expect(isFileEditParts([tool("write", { filePath: "   " })])).toBe(false);
    expect(isFileEditParts([])).toBe(false);
  });

  test("one step per file across spellings and patches; a write makes it 'created', edits alone 'edited'", () => {
    const steps = fileStepsOf([
      tool("write", { filePath: "reports/Brief.md", content: "x" }),
      tool("edit", { filePath: "./reports\\brief.md" }),
      tool("apply_patch", { patchText: "*** Begin Patch\n*** Update File: notes.md\n*** Add File: c.md\n*** End Patch" }),
    ]);
    expect(steps.map((step) => [step.path, step.kind])).toEqual([
      ["reports/Brief.md", "created"],
      ["notes.md", "edited"],
      ["c.md", "edited"],
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
