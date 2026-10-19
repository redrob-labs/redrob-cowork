import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CoworkThreadContext, type CoworkThread } from "../src/react-app/cowork/thread/cowork-thread-context";
import { CoworkBlocksView } from "../src/react-app/cowork/thread/cowork-thread";
import { parseCoworkBlocks } from "../src/react-app/cowork/thread/cowork-blocks";

// The in-chat plan flow renders only what the person still needs to act on.

const fence = (tag: string, body: unknown) => `\`\`\`${tag}\n${JSON.stringify(body)}\n\`\`\``;

const QUESTIONS = [{ id: "q1", question: "What do you need at the end?", options: ["A memo", "A deck"], defaultValue: 0 }];

const idleThread: CoworkThread = { sessionId: "s1", busy: false, sendText: async () => {} };

function render(markdown: string, isLatest: boolean): string {
  const blocks = parseCoworkBlocks(markdown);
  return renderToStaticMarkup(
    React.createElement(
      CoworkThreadContext,
      { value: idleThread },
      React.createElement(CoworkBlocksView, { blocks, isLatest }),
    ),
  );
}

describe("plan flow", () => {
  test("answered questions leave nothing behind; open questions still render", () => {
    expect(render(fence("redrob-questions", QUESTIONS), false)).toBe("");
    expect(render(fence("redrob-questions", QUESTIONS), true)).toContain("What do you need at the end?");
  });
});
