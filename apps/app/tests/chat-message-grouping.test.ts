import { describe, expect, test } from "bun:test";
import type { DynamicToolUIPart, UIMessage } from "ai";

import {
  getAssistantRenderGroups,
  getMessageCompleted,
  getMessageCreated,
  splitTurnAtAnswer,
} from "../src/components/chat/utils";

function bashPart(id: string): DynamicToolUIPart {
  return {
    type: "dynamic-tool",
    toolName: "bash",
    toolCallId: id,
    state: "output-available",
    input: { command: "ls", description: "list files" },
    output: "ok",
  };
}

function editPart(id: string, filePath: string): DynamicToolUIPart {
  return {
    type: "dynamic-tool",
    toolName: "edit",
    toolCallId: id,
    state: "output-available",
    input: { filePath, oldString: "a", newString: "b" },
    output: "ok",
  };
}

function reasoningPart(text: string): UIMessage["parts"][number] {
  return { type: "reasoning", text, state: "done" };
}

function textPart(text: string): UIMessage["parts"][number] {
  return { type: "text", text, state: "done" };
}

describe("getAssistantRenderGroups tool aggregation", () => {
  test("merges consecutive aggregatable tool calls into one group", () => {
    const groups = getAssistantRenderGroups(
      [bashPart("c1"), bashPart("c2"), editPart("c3", "/tmp/a.ts")],
      false
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("tool-aggregate");
    if (groups[0].kind === "tool-aggregate") {
      expect(groups[0].parts).toHaveLength(3);
    }
  });

  test("reasoning between tool calls does not break the run (thinking models)", () => {
    const groups = getAssistantRenderGroups(
      [
        reasoningPart("let me look"),
        bashPart("c1"),
        reasoningPart("now edit"),
        editPart("c2", "/tmp/a.ts"),
        reasoningPart("one more"),
        bashPart("c3"),
        textPart("Done."),
      ],
      true
    );

    const aggregates = groups.filter((group) => group.kind === "tool-aggregate");
    expect(aggregates).toHaveLength(1);
    if (aggregates[0].kind === "tool-aggregate") {
      expect(aggregates[0].parts.map((part) => part.toolCallId)).toEqual(["c1", "c2", "c3"]);
    }
    // Reasoning still renders, just without splitting the aggregate.
    expect(groups.filter((group) => group.kind === "reasoning").length).toBeGreaterThan(0);
    expect(groups.at(-1)?.kind).toBe("text");
  });

  test("prose between tool calls breaks the run", () => {
    const groups = getAssistantRenderGroups(
      [bashPart("c1"), textPart("Now editing:"), editPart("c2", "/tmp/a.ts")],
      false
    );

    const aggregates = groups.filter((group) => group.kind === "tool-aggregate");
    expect(aggregates).toHaveLength(2);
  });
});

describe("splitTurnAtAnswer", () => {
  test("splits a single-message turn into steps and the final answer", () => {
    const message: UIMessage = {
      id: "msg-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        reasoningPart("thinking"),
        bashPart("c1"),
        textPart("Let me also check something."),
        bashPart("c2"),
        textPart("All done — here is the summary."),
      ],
    };

    const split = splitTurnAtAnswer(message);
    expect(split).not.toBeNull();
    expect(split?.steps.id).toBe("msg-1:steps");
    expect(split?.steps.parts).toHaveLength(5);
    expect(split?.answer.id).toBe("msg-1");
    expect(split?.answer.parts).toHaveLength(1);
    const answerPart = split?.answer.parts[0];
    expect(answerPart?.type === "text" && answerPart.text).toBe("All done — here is the summary.");
  });

  test("returns null for a pure prose message", () => {
    const message: UIMessage = {
      id: "msg-2",
      role: "assistant",
      parts: [textPart("Just an answer.")],
    };
    expect(splitTurnAtAnswer(message)).toBeNull();
  });

  test("returns null when there is no answer text after the work", () => {
    const message: UIMessage = {
      id: "msg-3",
      role: "assistant",
      parts: [bashPart("c1"), bashPart("c2")],
    };
    expect(splitTurnAtAnswer(message)).toBeNull();
  });
});

describe("message timestamps", () => {
  test("reads created and completed from opencode metadata", () => {
    const message: UIMessage = {
      id: "msg-4",
      role: "assistant",
      metadata: { opencode: { created: 1000, completed: 61000 } },
      parts: [textPart("hi")],
    };
    expect(getMessageCreated(message)).toBe(1000);
    expect(getMessageCompleted(message)).toBe(61000);
  });

  test("returns null when completed is absent", () => {
    const message: UIMessage = {
      id: "msg-5",
      role: "assistant",
      metadata: { opencode: { created: 1000 } },
      parts: [textPart("hi")],
    };
    expect(getMessageCompleted(message)).toBeNull();
  });
});

describe("getAssistantRenderGroups unifyActivity (Cowork frame)", () => {
  test("folds reasoning + every tool kind into one activity group", () => {
    const search: DynamicToolUIPart = {
      type: "dynamic-tool",
      toolName: "websearch",
      toolCallId: "s1",
      state: "output-available",
      input: { query: "US China AI race" },
      output: "ok",
    };
    const groups = getAssistantRenderGroups(
      [
        reasoningPart("Researching the US-China AI race."),
        bashPart("c1"),
        editPart("c2", "/tmp/a.ts"),
        search,
      ],
      true, // showThinking
      true, // unifyActivity
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("activity");
    if (groups[0].kind === "activity") {
      // All three tool calls (bash, edit, non-aggregatable websearch) are in the one group.
      expect(groups[0].parts).toHaveLength(3);
      expect(groups[0].reasoning).toContain("Researching the US-China AI race.");
    }
  });

  test("keeps the answer text as its own group after the activity", () => {
    const groups = getAssistantRenderGroups(
      [reasoningPart("thinking"), bashPart("c1"), textPart("Here is the answer.")],
      true,
      true,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].kind).toBe("activity");
    expect(groups[1].kind).toBe("text");
  });

  test("off (bare surface) keeps the original per-kind grouping", () => {
    const groups = getAssistantRenderGroups(
      [reasoningPart("thinking"), bashPart("c1"), editPart("c2", "/tmp/a.ts")],
      true,
      false,
    );
    // reasoning is its own group, tools aggregate - no "activity" group exists.
    expect(groups.some((g) => g.kind === "activity")).toBe(false);
    expect(groups.some((g) => g.kind === "tool-aggregate")).toBe(true);
  });
});
