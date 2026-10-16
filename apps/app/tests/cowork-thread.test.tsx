/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";

import { MessageList } from "../src/components/chat/message-list";
import { MessageListProvider } from "../src/components/chat/message-list-provider";
import { CoworkFrameContext } from "../src/react-app/cowork/shell/cowork-frame";
import { createCheckStore } from "../src/react-app/cowork/thread/check-store";
import { CoworkThreadContext, type CoworkThread } from "../src/react-app/cowork/thread/cowork-thread-context";
import { CoworkAnswerFooterView, CoworkApproval } from "../src/react-app/cowork/thread/cowork-thread";
import { approvalActions } from "../src/react-app/cowork/thread/thread-logic";

/** Other files stub `globalThis.window`; static rendering must not see a partial stub. */
function withoutWindow<T>(run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  if (descriptor?.configurable) Reflect.deleteProperty(globalThis, "window");
  try {
    return run();
  } finally {
    if (descriptor?.configurable) Object.defineProperty(globalThis, "window", descriptor);
  }
}

const thread: CoworkThread = { sessionId: "s1", busy: false, sendText: async () => {} };

function render(messages: UIMessage[], inFrame: boolean, status: "ready" | "streaming" = "ready") {
  return withoutWindow(() =>
    renderToStaticMarkup(
      <CoworkFrameContext value={inFrame}>
        <MessageListProvider
          workspaceId="ws"
          sessionId="s1"
          showThinking={true}
          developerMode={false}
          displaySuggestions={false}
          providerConnectedCount={1}
          dispatchAction={() => {}}
          setPrompt={() => {}}
          onRevertToUserMessage={() => {}}
          onForkAtMessage={() => {}}
          onEditUserMessage={() => {}}
          onRetryMessage={() => {}}
        >
          <CoworkThreadContext value={thread}>
            <MessageList messages={messages} status={status} />
          </CoworkThreadContext>
        </MessageListProvider>
      </CoworkFrameContext>,
    ),
  );
}

const user: UIMessage = { id: "u1", role: "user", metadata: { opencode: { created: 1_000 } }, parts: [{ type: "text", text: "Help", state: "done" }] };

function assistant(id: string, text: string): UIMessage {
  return { id, role: "assistant", metadata: { opencode: { created: 1_000, completed: 2_000 } }, parts: [{ type: "text", text, state: "done" }] };
}

const questions = [
  "Two questions so the plan fits:",
  "```redrob-questions",
  JSON.stringify([{ id: "q1", question: "What do you need at the end?", options: ["A memo", "A notice, ready to send"], defaultValue: 1 }]),
  "```",
].join("\n");

const plan = [
  "Here is the plan.",
  "```redrob-plan",
  JSON.stringify({ title: "End the Seorin MSA", sections: [{ heading: "How I will do it", ordered: true, items: ["Read the contract."] }], todo: [{ label: "Write the notice" }] }),
  "```",
].join("\n");

describe("the thread inside the Cowork frame", () => {
  test("an assistant turn sits on the AI surface, with a receipt", () => {
    const markup = render([user, assistant("a1", "The notice must go by registered mail.")], true);
    // Round 32 (Claude-style): the assistant reply is plain prose, no AI bubble.
    expect(markup).not.toContain("bg-surface-ai");
    expect(markup).not.toContain("border-border-ai");
    expect(markup).toContain('data-surface="ai"');
    expect(markup).toContain("Redrob Auto");
    expect(markup).toContain("Not checked");
  });

  test("outside the frame the turn is unchanged: no receipt, blocks stay as written", () => {
    const markup = render([user, assistant("a1", plan)], false);
    expect(markup).not.toContain("bg-surface-ai");
    expect(markup).not.toContain("Not checked");
    expect(markup).not.toContain("Run this plan");
    expect(markup).toContain("redrob-plan");
  });

  test("Plan's questions render as PlanQuestions, then fold once answered", () => {
    const latest = render([user, assistant("a1", questions)], true);
    expect(latest).toContain("Two questions so the plan fits:");
    expect(latest).toContain("What do you need at the end?");
    expect(latest).toContain("Write the plan");
    expect(latest).toContain('aria-pressed="true"');
    expect(latest).not.toContain("redrob-questions");
    // No receipt under questions: they wait on the person.
    expect(latest).not.toContain("Not checked");

    const answered = render([user, assistant("a1", questions), { ...user, id: "u2" }], true);
    expect(answered).not.toContain("Write the plan");
    expect(answered).toContain("Answered.");
  });

  test("a plan renders as a draft PlanDocument with Run and Keep", () => {
    const markup = render([user, assistant("a1", plan)], true);
    expect(markup).toContain("End the Seorin MSA");
    expect(markup).toContain("Draft, not run yet");
    expect(markup).toContain("Run this plan");
    expect(markup).toContain("Keep it for later");
    expect(markup).toContain("Read the contract.");
    expect(markup).not.toContain("redrob-plan");
  });

  test("the receipt shows where the checks stand, then their reports", () => {
    // The store's own transitions are tested in cowork-thread-logic; static rendering reads its initial state.
    const store = createCheckStore();
    store.getState().start("a9", { planned: true, fact: true, challenge: false });
    const running = renderToStaticMarkup(<CoworkAnswerFooterView checks={store.getState().answers.a9} model="gpt-6-sol" />);
    expect(running).toContain("gpt-6-sol");
    expect(running).toContain("by Redrob Auto");
    expect(running).toContain("Plan followed");
    expect(running).toContain("Fact check running");
    store.getState().settle("a9", { fact: { summary: "All good.", claims: [{ verdict: "holds", claim: "Registered mail" }], missed: [] } });
    const done = renderToStaticMarkup(<CoworkAnswerFooterView checks={store.getState().answers.a9} />);
    expect(done).toContain("Fact check: holds up");
    expect(done).toContain("All good.");
    expect(done).toContain("Registered mail");
  });

  test("while a run works, a running status line", () => {
    const markup = render([user], true, "streaming");
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Working on it");
  });

  test("a saved memory shows as a thread note", () => {
    const saved: UIMessage = {
      id: "a2",
      role: "assistant",
      metadata: { opencode: { created: 1_000, completed: 2_000 } },
      parts: [
        { type: "dynamic-tool", toolName: "redrob-cloud_execute_capability", toolCallId: "c1", state: "output-available", input: { name: "redrob.postMemory", body: { content: "Filings go out by 16:00." } }, output: "ok" },
        { type: "text", text: "Saved.", state: "done" },
      ],
    };
    expect(render([user, saved], true)).toContain("Filings go out by 16:00.");
    expect(render([user, saved], false)).not.toContain("Saved to memory");
  });
});

describe("approvals", () => {
  test("ApprovalStep offers Always only in Developer mode", () => {
    const respond = () => {};
    const plain = renderToStaticMarkup(<CoworkApproval title="Send the notice?" description="It goes to Seorin." {...approvalActions("p1", respond, false)} />);
    expect(plain).toContain("Send the notice?");
    expect(plain).toContain("Approve");
    expect(plain).toContain("Reject");
    expect(plain).not.toContain("Always allow this");
    const developer = renderToStaticMarkup(<CoworkApproval title="Send?" description="x" {...approvalActions("p1", respond, true)} />);
    expect(developer).toContain("Always allow this");
  });
});
