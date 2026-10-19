import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { getArtifactsFromMessages, prettyArtifactTitle } from "../src/lib/artifacts";

describe("prettyArtifactTitle", () => {
  test("Title Case with acronyms, plural acronyms and minor words", () => {
    expect(prettyArtifactTitle("us-china-ai-race-2035.md")).toBe("US China AI Race 2035");
    // A plural acronym keeps its lowercase "s" (seen live as "Korea Cheapest Evs 2026").
    expect(prettyArtifactTitle("korea-cheapest-evs-2026.md")).toBe("Korea Cheapest EVs 2026");
    expect(prettyArtifactTitle("plan-for-the-launch.md")).toBe("Plan for the Launch");
    expect(prettyArtifactTitle("OpenAI-vs-DeepSeek-notes.md")).toBe("OpenAI vs DeepSeek Notes");
  });

  test("takes only the basename and falls back to it when there is no stem", () => {
    expect(prettyArtifactTitle("C:\\Users\\kim\\plan-b.md")).toBe("Plan B");
    expect(prettyArtifactTitle(".gitignore")).toBe(".gitignore");
  });
});

const message = (parts: UIMessage["parts"]): UIMessage => ({ id: "m1", role: "assistant", parts });
const tool = (toolName: string, state: string, input: Record<string, unknown>): UIMessage["parts"][number] =>
  ({ type: "dynamic-tool", toolName, toolCallId: `${toolName}-${state}`, state, input, output: "" }) as unknown as UIMessage["parts"][number];
const writing = (messages: UIMessage[]) =>
  getArtifactsFromMessages(messages, [], { includeTargetFallbacks: false, includeInFlightWrites: true, writtenOnly: true }).map((card) => [card.path, card.writing === true]);

describe("in-flight write cards", () => {
  test("a write, edit or apply_patch is writing while streaming or running, not once settled", () => {
    expect(writing([message([tool("write", "input-streaming", { filePath: "/w/report.md" })])])).toEqual([["/w/report.md", true]]);
    expect(writing([message([tool("edit", "input-available", { filePath: "/w/report.md" })])])).toEqual([["/w/report.md", true]]);
    expect(writing([message([tool("write", "output-available", { filePath: "/w/report.md" })])])).toEqual([["/w/report.md", false]]);
    const patch = "*** Begin Patch\n*** Add File: /w/report.md\n+hello\n*** End Patch";
    expect(writing([message([tool("apply_patch", "input-available", { patchText: patch })])])).toEqual([["/w/report.md", true]]);
  });

  test("a rewrite of a settled file marks the one card writing, whatever the path spelling", () => {
    const messages = [message([tool("write", "output-available", { filePath: "w/report.md" }), tool("write", "input-streaming", { filePath: "./w/report.md" })])];
    expect(writing(messages)).toEqual([["w/report.md", true]]);
  });

  test("only the Cowork card list opts in to provisional cards", () => {
    const messages = [message([tool("write", "input-streaming", { filePath: "/w/report.md" })])];
    expect(getArtifactsFromMessages(messages, [], { includeTargetFallbacks: false })).toHaveLength(0);
  });
});

describe("writtenOnly cards", () => {
  const text = (value: string): UIMessage["parts"][number] => ({ type: "text", text: value }) as UIMessage["parts"][number];

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
});
