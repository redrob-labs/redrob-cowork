import { describe, expect, test } from "bun:test";
import {
  discardedSessions,
  finishedAssistantText,
  runHasAnswer,
  runSettled,
  startingRun,
  withVariant,
} from "../src/react-app/domains/session/variant-run";

const assistant = (text: string, completed: number | null) => ({
  info: { role: "assistant", time: { completed } },
  parts: [{ type: "text", text }],
});

const run = () =>
  startingRun({
    kind: "compare",
    prompt: "write a haiku",
    slots: [
      { index: 0, model: { providerID: "redrob", modelID: "a" }, label: "a" },
      { index: 1, model: { providerID: "redrob", modelID: "b" }, label: "b" },
    ],
  });

describe("finished answers", () => {
  test("returns the text once the reply is complete", () => {
    expect(finishedAssistantText([assistant("done", 1700)])).toBe("done");
  });

  test("returns nothing while the reply is still being written", () => {
    /*
      A streaming reply has text from its first token. Adopting that would put a truncated turn into the
      session as though the model had stopped there, which is a worse outcome than waiting.
    */
    expect(finishedAssistantText([assistant("half a sen", null)])).toBeUndefined();
  });

  test("ignores the user message and reads the newest assistant one", () => {
    const messages = [
      { info: { role: "user", time: { completed: 1 } }, parts: [{ type: "text", text: "ask" }] },
      assistant("first", 2),
    ];
    expect(finishedAssistantText(messages)).toBe("first");
  });

  test("treats an empty finished reply as no answer", () => {
    expect(finishedAssistantText([assistant("   ", 1700)])).toBeUndefined();
  });
});

describe("run state", () => {
  test("is not settled while a variant is still running", () => {
    const r = withVariant(run(), 0, { status: "done", text: "x" });
    expect(runSettled(r)).toBe(false);
  });

  test("is settled when every variant is done or failed", () => {
    let r = withVariant(run(), 0, { status: "done", text: "x" });
    r = withVariant(r, 1, { status: "failed", error: "boom" });
    expect(runSettled(r)).toBe(true);
  });

  test("has no answer when every variant failed", () => {
    // A run where nothing succeeded is not a choice, and offering it as one would be a lie.
    let r = withVariant(run(), 0, { status: "failed" });
    r = withVariant(r, 1, { status: "failed" });
    expect(runHasAnswer(r)).toBe(false);
  });

  test("patches one variant without disturbing the others", () => {
    const r = withVariant(run(), 1, { sessionID: "ses_b", status: "running" });
    expect(r.variants[0]).toMatchObject({ index: 0, sessionID: null, status: "starting" });
    expect(r.variants[1]).toMatchObject({ index: 1, sessionID: "ses_b", status: "running" });
  });
});

describe("adoption", () => {
  test("discards every fork except the chosen one", () => {
    let r = withVariant(run(), 0, { sessionID: "ses_a", status: "done", text: "A" });
    r = withVariant(r, 1, { sessionID: "ses_b", status: "done", text: "B" });
    expect(discardedSessions(r, 1)).toEqual(["ses_a"]);
  });

  test("skips variants that never got a fork", () => {
    const r = withVariant(run(), 0, { sessionID: "ses_a", status: "done", text: "A" });
    expect(discardedSessions(r, 0)).toEqual([]);
  });
});
