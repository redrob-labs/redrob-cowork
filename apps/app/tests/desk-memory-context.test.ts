import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MemoryNote } from "../src/react-app/desk/services/types";
import {
  MEMORY_HEADING,
  createNotesCache,
  estimateTokens,
  memoryContext,
  notesInScope,
} from "../src/react-app/desk/thread/memory-context";
import { deskSystemText, MEMORY_OFF_INSTRUCTION } from "../src/react-app/desk/thread/memory-off";

const note = (id: string, scope: MemoryNote["scope"], text: string, when: number): MemoryNote => ({ id, scope, text, when, how: "told" });

const NOTES: MemoryNote[] = [
  note("you", "you", "Call me Jiwoo", 1),
  note("team", "team", "House style: numbered clauses", 2),
  note("here", "project:ws_1", "Our fiscal year starts in April", 3),
  note("there", "project:ws_2", "Filings by 17:00", 4),
];

describe("which notes a chat reads", () => {
  test("All my work reads every note; This project reads mine, the team's and this project's; Off reads none", () => {
    expect(notesInScope(NOTES, "all", "ws_1").map((entry) => entry.id)).toEqual(["you", "team", "here", "there"]);
    expect(notesInScope(NOTES, "project", "ws_1").map((entry) => entry.id)).toEqual(["you", "team", "here"]);
    expect(notesInScope(NOTES, "none", "ws_1")).toEqual([]);
  });

  test("the prompt carries them newest first, under the heading", () => {
    const context = memoryContext(NOTES, { memory: "project", projectId: "ws_1" });
    expect(context.included).toBe(3);
    expect(context.omitted).toBe(0);
    expect(context.text).toBe(
      `${MEMORY_HEADING}\n\n- Our fiscal year starts in April\n- House style: numbered clauses\n- Call me Jiwoo`,
    );
  });

  test("past the budget the oldest are left out and counted", () => {
    const many = Array.from({ length: 50 }, (_, index) => note(`n${index}`, "you", `Note number ${index} ${"x".repeat(200)}`, index));
    const context = memoryContext(many, { memory: "all", projectId: null, budgetTokens: 2_000 });
    expect(context.included).toBeGreaterThan(0);
    expect(context.included + context.omitted).toBe(50);
    expect(context.omitted).toBeGreaterThan(0);
    expect(estimateTokens(context.text ?? "")).toBeLessThanOrEqual(2_000);
    // The newest survive.
    expect(context.text).toContain("Note number 49 ");
    expect(context.text).not.toContain("Note number 0 ");
  });

  test("no notes, or memory off, adds nothing", () => {
    expect(memoryContext([], { memory: "all", projectId: null })).toEqual({ text: null, included: 0, omitted: 0 });
    expect(memoryContext(NOTES, { memory: "none", projectId: "ws_1" }).text).toBeNull();
  });
});

describe("the system text", () => {
  test("notes follow what was there; memory off replaces them with its rule", () => {
    expect(deskSystemText("all", "Env", "NOTES")).toBe("Env\n\nNOTES");
    expect(deskSystemText("project", undefined, "NOTES")).toBe("NOTES");
    expect(deskSystemText("all", "Env", null)).toBe("Env");
    expect(deskSystemText("none", "Env", "NOTES")).toBe(`Env\n\n${MEMORY_OFF_INSTRUCTION}`);
  });

  test("the send path reads the notes for the chat's scope and the project it is in", () => {
    const route = readFileSync(join(import.meta.dir, "..", "src", "react-app", "shell", "session-route.tsx"), "utf8");
    expect(route).toContain('memoryFor(deskChats, targetSessionId, Boolean(selectedWorkspace && selectedWorkspace.kind !== "personal"))');
    expect(route).toContain("deskSystemText(deskMemory, envSystemContext || undefined, deskNotes)");
    expect(route).toContain("{ memory: deskMemory, projectId: selectedWorkspaceId || null }");
  });
});

describe("the notes cache", () => {
  test("reuses the list for a few seconds, then reads it again", async () => {
    let loads = 0;
    let clock = 0;
    const cache = createNotesCache(async () => {
      loads += 1;
      return NOTES;
    }, 5_000, () => clock);
    await cache.get();
    clock = 4_000;
    await cache.get();
    expect(loads).toBe(1);
    clock = 5_001;
    await cache.get();
    expect(loads).toBe(2);
  });
});
