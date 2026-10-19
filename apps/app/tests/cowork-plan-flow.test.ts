import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CoworkThreadContext, type CoworkThread } from "../src/react-app/cowork/thread/cowork-thread-context";
import { CoworkBlocksView } from "../src/react-app/cowork/thread/cowork-thread";
import { parseCoworkBlocks } from "../src/react-app/cowork/thread/cowork-blocks";

// Round 7: the in-chat plan flow renders only what the person still needs to act on.

const fence = (tag: string, body: unknown) => `\`\`\`${tag}\n${JSON.stringify(body)}\n\`\`\``;

const QUESTIONS = [{ id: "q1", question: "What do you need at the end?", options: ["A memo", "A deck"], defaultValue: 0 }];
const PLAN = { title: "Research plan", summary: "A memo on the topic.", sections: [], todo: [{ label: "Search the web" }] };

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

describe("round 7 plan flow", () => {
  test("C1: answered questions leave no 'Answered.' line behind", () => {
    const html = render(fence("redrob-questions", QUESTIONS), false);
    expect(html).toBe("");
    expect(html).not.toContain("Answered");
  });

  test("C1: open questions still render", () => {
    expect(render(fence("redrob-questions", QUESTIONS), true)).toContain("What do you need at the end?");
  });

  test("C3: the plan offers Run and no Keep it for later", () => {
    const html = render(fence("redrob-plan", PLAN), true);
    expect(html).toContain(">Run<");
    expect(html).not.toContain("Run this plan");
    expect(html).not.toContain("Keep it for later");
  });
});
