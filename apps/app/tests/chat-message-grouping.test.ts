import { describe, expect, test } from "bun:test";
import type { DynamicToolUIPart, UIMessage } from "ai";

import {
  getAssistantRenderGroups,
  getMessageCompleted,
  getMessageCreated,
  isWebResearchGroup,
  liveActivityOf,
  splitTurnAtAnswer,
} from "../src/components/chat/utils";
import { continuesAggregate } from "../src/lib/tool-aggregate";

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
        textPart("All done - here is the summary."),
      ],
    };

    const split = splitTurnAtAnswer(message);
    expect(split).not.toBeNull();
    expect(split?.steps.id).toBe("msg-1:steps");
    expect(split?.steps.parts).toHaveLength(5);
    expect(split?.answer.id).toBe("msg-1");
    expect(split?.answer.parts).toHaveLength(1);
    const answerPart = split?.answer.parts[0];
    expect(answerPart?.type === "text" && answerPart.text).toBe("All done - here is the summary.");
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

describe("liveActivityOf", () => {
  test("collects every tool call and the shown reasoning; null while there is none", () => {
    const empty: UIMessage["parts"][number] = { type: "reasoning", text: "", state: "streaming" };
    const messages: UIMessage[] = [
      { id: "a1", role: "assistant", parts: [reasoningPart("Looking."), bashPart("c1")] },
      { id: "a2", role: "assistant", parts: [empty, textPart("Done.")] },
    ];
    expect(liveActivityOf(messages, true)).toEqual({ parts: [bashPart("c1")], reasoning: "Looking." });
    expect(liveActivityOf(messages, false)).toEqual({ parts: [bashPart("c1")], reasoning: "" });
    // A bare reasoning part (how thinking starts streaming) puts up no row.
    expect(liveActivityOf([{ id: "a3", role: "assistant", parts: [empty] }], true)).toBeNull();
  });
});

describe("web research groups", () => {
  const web = (toolName: string, id: string): DynamicToolUIPart =>
    ({ type: "dynamic-tool", toolName, toolCallId: id, state: "output-available", input: { query: "q", url: "https://example.com" }, output: "" }) as unknown as DynamicToolUIPart;

  test("web calls fold into one group only in the Cowork frame, which reads it as web research", () => {
    const parts = [web("websearch", "w1"), web("webfetch", "w2")];
    const folded = getAssistantRenderGroups(parts, true, true);
    expect(folded).toHaveLength(1);
    expect(folded[0] && isWebResearchGroup(folded[0])).toBe(true);
    // The bare surface keeps one row per call (each with its own sources popover).
    expect(getAssistantRenderGroups(parts, true).map((group) => group.kind)).toEqual(["tool", "tool"]);
    expect(isWebResearchGroup({ kind: "tool-aggregate", parts: [web("websearch", "w3"), bashPart("c1")] })).toBe(false);
    expect(isWebResearchGroup({ kind: "tool", part: bashPart("c2") })).toBe(false);
    expect(isWebResearchGroup({ kind: "text", text: "hello" })).toBe(false);
  });

  test("in the Cowork frame web research and file edits keep their own aggregates", () => {
    const groups = getAssistantRenderGroups([bashPart("c1"), web("websearch", "w1"), web("webfetch", "w2"), editPart("c2", "a.md"), editPart("c3", "b.md")], true, true);
    expect(groups.map((group) => (group.kind === "tool-aggregate" ? group.parts.map((part) => part.toolCallId) : group.kind))).toEqual([["c1"], ["w1", "w2"], ["c2", "c3"]]);
    expect(groups[1] && isWebResearchGroup(groups[1])).toBe(true);
    // The bare surface keeps commands and edits in one aggregate (develop behaviour).
    expect(continuesAggregate(bashPart("c1"), editPart("c2", "a.md"))).toBe(true);
    expect(continuesAggregate(bashPart("c1"), editPart("c2", "a.md"), true)).toBe(false);
  });
});
