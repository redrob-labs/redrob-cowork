import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { isTodoToolPart, withoutTodoToolParts } from "../src/react-app/cowork/thread/hide-todo-tools";

// "Updated the plan (4)" boxes are not drawn in the Cowork transcript.

const tool = (toolName: string): UIMessage["parts"][number] =>
  ({ type: "dynamic-tool", toolName, toolCallId: toolName, state: "output-available", input: {}, output: "" }) as unknown as UIMessage["parts"][number];
const text = (value: string): UIMessage["parts"][number] => ({ type: "text", text: value }) as UIMessage["parts"][number];

describe("withoutTodoToolParts", () => {
  test("drops todowrite and todoread, keeps everything else in order", () => {
    const input: UIMessage[] = [{ id: "a", role: "assistant", parts: [text("one"), tool("todowrite"), tool("websearch"), tool("todoread"), text("two")] }];
    const [message] = withoutTodoToolParts(input);
    expect(message?.parts.map((part) => (part.type === "text" ? part.text : (part as { toolName: string }).toolName))).toEqual(["one", "websearch", "two"]);
    expect(isTodoToolPart(tool("TodoWrite"))).toBe(true);
    expect(isTodoToolPart(tool("write"))).toBe(false);
    expect(isTodoToolPart(text("todowrite"))).toBe(false);
  });

  test("returns the same array and message objects when there is nothing to remove", () => {
    const input: UIMessage[] = [
      { id: "u", role: "user", parts: [text("hi")] },
      { id: "a", role: "assistant", parts: [tool("websearch")] },
    ];
    expect(withoutTodoToolParts(input)).toBe(input);
  });

});
