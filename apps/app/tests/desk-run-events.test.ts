import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { OpencodeEvent } from "../src/app/types";
import { addDeskPage, createDeskPagesStore, pagesToday, type DeskPage } from "../src/react-app/desk/run/desk-pages";
import {
  DESK_FILES_QUERY_KEY,
  openChatIdFromPath,
  performRunEffects,
  runBelongsToFrame,
  runEffects,
  type RunEffectContext,
} from "../src/react-app/desk/run/run-effects";
import {
  classifyStep,
  EMPTY_RUN_EVENTS,
  reduceRunEvent,
  writtenFileName,
  type DeskRunEvent,
  type RunEventsState,
} from "../src/react-app/desk/run/run-events";
import { createFrameStore } from "../src/react-app/desk/store/frame-store";

type ToolStatus = "pending" | "running" | "completed" | "error";

function toolPart(tool: string, input: Record<string, unknown>, status: ToolStatus = "running", id = "part-1", sessionID = "chat-1") {
  return { id, sessionID, messageID: "msg-1", type: "tool", callID: `call-${id}`, tool, state: { status, input } };
}

const partEvent = (part: ReturnType<typeof toolPart>): OpencodeEvent => ({ type: "message.part.updated", properties: { part } });
const statusEvent = (sessionID: string, type: "busy" | "idle"): OpencodeEvent => ({
  type: "session.status",
  properties: { sessionID, status: { type } },
});

/** Every Desk event a recorded sequence of engine events emits. */
function replay(events: OpencodeEvent[], start: RunEventsState = EMPTY_RUN_EVENTS) {
  let state = start;
  const emitted: DeskRunEvent[] = [];
  for (const event of events) {
    const result = reduceRunEvent(state, event);
    state = result.state;
    emitted.push(...result.emitted);
  }
  return { state, emitted };
}

describe("classifyStep", () => {
  test("redrob_execute on a browser capability is web, with its url", () => {
    expect(classifyStep(toolPart("redrob_execute", { id: "browser.open_url", args: { url: "https://law.go.kr/x" } }))).toEqual({
      kind: "web",
      label: "browser.open_url",
      url: "https://law.go.kr/x",
    });
    expect(classifyStep(toolPart("redrob_execute", { id: "settings.panel.open" }))?.kind).toBe("model");
  });

  test("chrome-devtools and browser_* tools are web, by whatever name the server gives them", () => {
    expect(classifyStep(toolPart("chrome-devtools_navigate_page", { url: "https://scourt.go.kr" }))).toMatchObject({
      kind: "web",
      url: "https://scourt.go.kr",
    });
    expect(classifyStep(toolPart("chrome_devtools_click", { uid: "1" }))).toMatchObject({ kind: "web" });
    expect(classifyStep(toolPart("browser_snapshot", {}))).toMatchObject({ kind: "web" });
    expect(classifyStep(toolPart("navigate_page", { url: "https://a.example" }))?.kind).toBe("web");
  });

  test("web fetch and search are web; a url that is not a web address is dropped", () => {
    expect(classifyStep(toolPart("webfetch", { url: "https://federalreserve.gov/rates" }))).toMatchObject({
      kind: "web",
      url: "https://federalreserve.gov/rates",
    });
    expect(classifyStep(toolPart("websearch", { query: "court holidays" }))).toEqual({ kind: "web", label: "websearch" });
    expect(classifyStep(toolPart("webfetch", { url: "file:///etc/passwd" }))?.url).toBeUndefined();
  });

  test("write, edit and patch are files; anything else is the model", () => {
    expect(classifyStep(toolPart("write", { filePath: "/w/Notice.docx" }))?.kind).toBe("files");
    expect(classifyStep(toolPart("edit", { filePath: "/w/a.md" }))?.kind).toBe("files");
    expect(classifyStep(toolPart("patch", {}))?.kind).toBe("files");
    expect(classifyStep(toolPart("bash", { command: "ls" }))?.kind).toBe("model");
    expect(classifyStep(toolPart("read", { filePath: "/w/a.md" }))?.kind).toBe("model");
  });

  test("the tool's title is the label when it has one; a part that is not a tool is no step", () => {
    const part = { ...toolPart("webfetch", { url: "https://a.example" }), state: { status: "completed", input: {}, title: "Read a.example" } };
    expect(classifyStep(part)?.label).toBe("Read a.example");
    expect(classifyStep({ id: "t", type: "text", text: "hi" })).toBeNull();
    expect(classifyStep(null)).toBeNull();
  });

  test("the written file is its name, never its folders", () => {
    expect(writtenFileName(toolPart("write", { filePath: "/Users/kim/Seorin/Notice.docx" }))).toBe("Notice.docx");
    expect(writtenFileName(toolPart("edit", { file_path: "C:\\Users\\kim\\Plan.md" }))).toBe("Plan.md");
    expect(writtenFileName(toolPart("write", {}))).toBeNull();
  });
});

describe("reduceRunEvent", () => {
  test("a recorded run: one step.started per step, file.written by name, run.answered once", () => {
    const open = { id: "browser.open_url", args: { url: "https://law.go.kr/lsInfoP.do?lsiSeq=1" } };
    const write = { filePath: "/Users/kim/Seorin MSA/Notice.docx", content: "..." };
    const { emitted } = replay([
      { type: "session.updated", properties: { info: { id: "chat-1", title: "Notice by email - valid?" } } },
      statusEvent("chat-1", "busy"),
      partEvent(toolPart("redrob_execute", {}, "pending", "p1")),
      partEvent(toolPart("redrob_execute", open, "running", "p1")),
      partEvent(toolPart("redrob_execute", open, "running", "p1")),
      partEvent(toolPart("redrob_execute", open, "completed", "p1")),
      partEvent(toolPart("write", write, "pending", "p2")),
      partEvent(toolPart("write", write, "running", "p2")),
      partEvent(toolPart("write", write, "completed", "p2")),
      partEvent(toolPart("write", write, "completed", "p2")),
      {
        type: "message.updated",
        properties: { info: { id: "msg-1", sessionID: "chat-1", role: "assistant", time: { created: 1, completed: 2 }, finish: "tool-calls" } },
      },
      {
        type: "message.updated",
        properties: { info: { id: "msg-2", sessionID: "chat-1", role: "assistant", time: { created: 3, completed: 4 }, finish: "stop" } },
      },
      statusEvent("chat-1", "idle"),
      { type: "session.idle", properties: { sessionID: "chat-1" } },
    ]);
    expect(emitted).toEqual([
      {
        type: "step.started",
        runId: "chat-1",
        label: "browser.open_url",
        kind: "web",
        url: "https://law.go.kr/lsInfoP.do?lsiSeq=1",
        chatTitle: "Notice by email - valid?",
      },
      { type: "step.started", runId: "chat-1", label: "write", kind: "files", chatTitle: "Notice by email - valid?" },
      { type: "file.written", name: "Notice.docx", chatId: "chat-1" },
      { type: "run.answered", runId: "chat-1" },
    ]);
  });

  test("busy then idle answers once, and an idle with no run before it answers nothing", () => {
    expect(replay([statusEvent("a", "idle")]).emitted).toEqual([]);
    expect(replay([statusEvent("a", "busy"), statusEvent("a", "idle"), statusEvent("a", "idle")]).emitted).toEqual([
      { type: "run.answered", runId: "a" },
    ]);
    // A second run in the same chat answers again.
    const twice = replay([statusEvent("a", "busy"), statusEvent("a", "idle"), statusEvent("a", "busy"), { type: "session.idle", properties: { sessionID: "a" } }]);
    expect(twice.emitted.filter((event) => event.type === "run.answered")).toHaveLength(2);
  });

  test("an edit that fails writes no file; a fast tool seen only completed still starts its step", () => {
    expect(replay([partEvent(toolPart("edit", { filePath: "/w/a.md" }, "error", "e1"))]).emitted).toEqual([
      { type: "step.started", runId: "chat-1", label: "edit", kind: "files" },
    ]);
    expect(replay([partEvent(toolPart("webfetch", { url: "https://a.example" }, "completed", "w1"))]).emitted).toEqual([
      { type: "step.started", runId: "chat-1", label: "webfetch", kind: "web", url: "https://a.example" },
    ]);
  });

  test("a permission request is an approval step", () => {
    const { emitted } = replay([{ type: "permission.asked", properties: { id: "perm", sessionID: "b", permission: "edit" } }]);
    expect(emitted).toEqual([{ type: "step.started", runId: "b", label: "edit", kind: "approval" }]);
  });

  test("events it does not read change nothing", () => {
    const result = reduceRunEvent(EMPTY_RUN_EVENTS, { type: "lsp.updated", properties: {} });
    expect(result.state).toBe(EMPTY_RUN_EVENTS);
    expect(result.emitted).toEqual([]);
  });
});

describe("the frame's response to Desk events", () => {
  const ctx = (patch: Partial<RunEffectContext> = {}): RunEffectContext => ({
    openChatId: "chat-1",
    desk: "done",
    readingRun: null,
    now: Date.UTC(2026, 8, 28, 10),
    ...patch,
  });
  const web: DeskRunEvent = { type: "step.started", runId: "chat-1", label: "open", kind: "web", url: "https://law.go.kr/a/b", chatTitle: "Notice" };

  function targets() {
    const frame = createFrameStore({ storage: () => null });
    const pages = createDeskPagesStore();
    const queryClient = new QueryClient();
    const invalidated: unknown[][] = [];
    const run = (event: DeskRunEvent, patch: Partial<RunEffectContext> = {}) => {
      const effects = runEffects(event, {
        ...ctx(patch),
        desk: frame.getState().browser.desk,
        readingRun: pages.getState().reading?.runId ?? null,
      });
      performRunEffects(effects, {
        frame: frame.getState(),
        pages: pages.getState(),
        invalidateFiles: () => {
          invalidated.push([...DESK_FILES_QUERY_KEY]);
          void queryClient.invalidateQueries({ queryKey: DESK_FILES_QUERY_KEY });
        },
      });
    };
    return { frame, pages, queryClient, invalidated, run };
  }

  test("a web step opens the panel on the browser with Desk reading, and records the page", () => {
    const { frame, pages, run } = targets();
    run(web);
    expect(frame.getState().panel).toMatchObject({ open: true, tab: "browser" });
    expect(frame.getState().browser.desk).toBe("reading");
    expect(pages.getState().reading).toEqual({ runId: "chat-1", url: "https://law.go.kr/a/b" });
    expect(pages.getState().pages).toMatchObject([{ host: "law.go.kr", chatId: "chat-1", chatTitle: "Notice" }]);
  });

  test("a step in another chat records its page but leaves the panel alone", () => {
    const { frame, pages, run } = targets();
    run({ ...web, runId: "chat-2" });
    expect(frame.getState().panel.open).toBe(false);
    expect(frame.getState().browser.desk).toBe("done");
    expect(pages.getState().pages).toHaveLength(1);
    expect(runBelongsToFrame("chat-2", null)).toBe(true);
    expect(runBelongsToFrame("chat-2", "chat-1")).toBe(false);
  });

  test("a web step while the person has the tab does not take it back", () => {
    const { frame, run } = targets();
    frame.getState().setDesk("you");
    run(web);
    expect(frame.getState().browser.desk).toBe("you");
  });

  test("an answer marks the page done, only from reading and only for the run that read it", () => {
    const { frame, run } = targets();
    run({ type: "run.answered", runId: "chat-1" });
    expect(frame.getState().browser.desk).toBe("done");
    run(web);
    run({ type: "run.answered", runId: "chat-2" });
    expect(frame.getState().browser.desk).toBe("reading");
    run({ type: "run.answered", runId: "chat-1" });
    expect(frame.getState().browser.desk).toBe("done");
    frame.getState().setDesk("you");
    run({ type: "run.answered", runId: "chat-1" });
    expect(frame.getState().browser.desk).toBe("you");
  });

  test("a written file invalidates the Files list's query", async () => {
    const { queryClient, invalidated, run } = targets();
    queryClient.setQueryData(["desk-files", "ws-1"], { data: [] });
    run({ type: "file.written", name: "Notice.docx", chatId: "chat-1" });
    expect(invalidated).toEqual([["desk-files"]]);
    expect(queryClient.getQueryState(["desk-files", "ws-1"])?.isInvalidated).toBe(true);
  });

  test("the open chat comes from the route", () => {
    expect(openChatIdFromPath("/chat/abc")).toBe("abc");
    expect(openChatIdFromPath("/workspace/w1/session/ses%201")).toBe("ses 1");
    expect(openChatIdFromPath("/chat")).toBeNull();
    expect(openChatIdFromPath("/projects")).toBeNull();
  });
});

describe("pages Desk read today", () => {
  const page = (url: string, chatId: string, at: number): DeskPage => ({ url, host: new URL(url).hostname, chatId, chatTitle: null, at });

  test("newest first, the same page for the same chat once", () => {
    const a = page("https://a.example/1", "c1", 1);
    const b = page("https://b.example/1", "c1", 2);
    expect(addDeskPage(addDeskPage(addDeskPage([], a), b), { ...a, at: 3 }).map((entry) => entry.url)).toEqual([
      "https://a.example/1",
      "https://b.example/1",
    ]);
  });

  test("only today's", () => {
    const now = new Date(2026, 8, 28, 15).getTime();
    const today = page("https://a.example", "c1", new Date(2026, 8, 28, 9).getTime());
    const yesterday = page("https://b.example", "c1", new Date(2026, 8, 27, 23).getTime());
    expect(pagesToday([today, yesterday], now)).toEqual([today]);
  });
});
