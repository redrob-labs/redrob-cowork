import { beforeEach, describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { artifactPathMatches, latestLiveDraft, useLiveDraftStore } from "../src/react-app/cowork/panel/live-draft";

// Round 7 C6: the file being written is shown live in the Artifacts panel.

const write = (state: string, filePath = "/w/reports/outlook.md", content = "# Outlook\n\nBody", id = "w1"): UIMessage["parts"][number] =>
  ({ type: "dynamic-tool", toolName: "write", toolCallId: id, state, input: { filePath, content } }) as unknown as UIMessage["parts"][number];
const text = (value: string): UIMessage["parts"][number] => ({ type: "text", text: value }) as UIMessage["parts"][number];
const assistant = (parts: UIMessage["parts"], id = "a"): UIMessage => ({ id, role: "assistant", parts });
const user = (value: string): UIMessage => ({ id: "u", role: "user", parts: [text(value)] });

describe("latestLiveDraft", () => {
  test("takes the newest full write of the running turn, in flight or settled", () => {
    expect(latestLiveDraft([user("go"), assistant([text("ok"), write("input-streaming")])])).toEqual({
      callId: "w1", path: "/w/reports/outlook.md", content: "# Outlook\n\nBody", settled: false,
    });
    expect(latestLiveDraft([user("go"), assistant([write("output-available")])])?.settled).toBe(true);
    const two = latestLiveDraft([user("go"), assistant([write("output-available", "/w/a.md", "A", "w1"), write("input-streaming", "/w/b.md", "B", "w2")])]);
    expect(two?.path).toBe("/w/b.md");
  });

  test("ignores earlier turns, failed writes, edits and empty bodies", () => {
    expect(latestLiveDraft([assistant([write("output-available")]), user("next")])).toBeNull();
    expect(latestLiveDraft([user("go"), assistant([write("output-error")])])).toBeNull();
    expect(latestLiveDraft([user("go"), assistant([write("input-streaming", "/w/a.md", "")])])).toBeNull();
    const edit = { type: "dynamic-tool", toolName: "edit", toolCallId: "e", state: "input-streaming", input: { filePath: "/w/a.md", content: "x" } } as unknown as UIMessage["parts"][number];
    expect(latestLiveDraft([user("go"), assistant([edit])])).toBeNull();
  });
});

describe("artifactPathMatches", () => {
  test("matches a workspace-relative artifact to the absolute path the tool wrote", () => {
    expect(artifactPathMatches("reports/outlook.md", "C:\\Users\\kim\\ws\\reports\\outlook.md")).toBe(true);
    expect(artifactPathMatches("./reports/Outlook.md", "reports/outlook.md")).toBe(true);
    expect(artifactPathMatches("outlook.md", "/w/reports/other-outlook.md")).toBe(false);
    expect(artifactPathMatches("", "/w/a.md")).toBe(false);
  });
});

describe("useLiveDraftStore", () => {
  beforeEach(() => useLiveDraftStore.setState({ drafts: {}, done: {} }));
  const draft = { callId: "w1", path: "/w/a.md", content: "A", settled: false };

  test("publish, update to settled, then finish hands the draft over for good", () => {
    const store = useLiveDraftStore.getState();
    store.publish("s1", draft);
    store.publish("s1", { ...draft, settled: true });
    expect(useLiveDraftStore.getState().drafts.s1?.settled).toBe(true);
    useLiveDraftStore.getState().finish("s1", "w1");
    expect(useLiveDraftStore.getState().drafts.s1).toBeUndefined();
    // A later publish of the same call (a re-render) does not bring it back.
    useLiveDraftStore.getState().publish("s1", { ...draft, settled: true });
    expect(useLiveDraftStore.getState().drafts.s1).toBeUndefined();
  });

  test("sessions are kept apart", () => {
    useLiveDraftStore.getState().publish("s1", draft);
    expect(useLiveDraftStore.getState().drafts.s2).toBeUndefined();
  });
});
