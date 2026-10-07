import type { OpencodeEvent } from "../../../app/types";

/**
 * The engine's events, read as the Desk's own: a step started, a run answered, a file was
 * written. Pure, so the stream can be replayed in a test; `desk-run-events.tsx` applies them.
 */

export type StepKind = "web" | "files" | "model" | "approval";

export type StepInfo = { kind: StepKind; label: string; url?: string };

export type DeskRunEvent =
  | { type: "step.started"; runId: string; label: string; kind: StepKind; url?: string; chatTitle?: string }
  | { type: "run.answered"; runId: string }
  | { type: "file.written"; name: string; chatId: string };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: UnknownRecord | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordField(record: UnknownRecord | undefined, key: string): UnknownRecord | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

/** Tools that write a file the Files list should show. */
const FILE_TOOLS = new Set(["write", "edit", "multiedit", "patch", "apply_patch"]);

/** Tools that read the web without the built-in browser. */
const FETCH_TOOLS = new Set(["webfetch", "websearch", "web_fetch", "web_search"]);

/** A chrome-devtools MCP tool (`chrome-devtools_navigate_page`, `chrome_devtools_click`, ...). */
const DEVTOOLS_TOOL = /chrome[-_]?devtools/;

/** Page tools by their own name, whatever server prefixes them. */
const PAGE_TOOL = /(^|_)(navigate_page|new_page|select_page|take_snapshot|take_screenshot)$/;

/** The input of a tool part, or nothing for any other part. */
function toolInput(part: UnknownRecord): UnknownRecord | undefined {
  return recordField(recordField(part, "state"), "input");
}

function isWebTool(tool: string, input: UnknownRecord | undefined): boolean {
  if (tool.endsWith("redrob_execute")) return stringField(input, "id")?.startsWith("browser.") ?? false;
  return tool.startsWith("browser_") || DEVTOOLS_TOOL.test(tool) || PAGE_TOOL.test(tool) || FETCH_TOOLS.has(tool);
}

function webUrl(input: UnknownRecord | undefined): string | undefined {
  const url = stringField(input, "url") ?? stringField(recordField(input, "args"), "url");
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/**
 * What kind of step a tool part is. `web` is any browser tool: `redrob_execute` on a
 * `browser.*` capability, the `browser_*` and chrome-devtools tools, and web fetch and
 * search. `files` is write, edit and patch. Everything else is the model working. Not a
 * tool part: null. Approval is not a tool part; `reduceRunEvent` reads it from
 * `permission.asked`.
 */
export function classifyStep(part: unknown): StepInfo | null {
  if (!isRecord(part) || part.type !== "tool") return null;
  const tool = stringField(part, "tool")?.toLowerCase();
  if (!tool) return null;
  const input = toolInput(part);
  const label = stringField(recordField(part, "state"), "title") ?? stringField(input, "id") ?? tool;
  if (isWebTool(tool, input)) {
    const url = webUrl(input);
    return url ? { kind: "web", label, url } : { kind: "web", label };
  }
  if (FILE_TOOLS.has(tool)) return { kind: "files", label };
  return { kind: "model", label };
}

/** The file name a write or edit names, without its folders. */
export function writtenFileName(part: unknown): string | null {
  if (!isRecord(part)) return null;
  const input = toolInput(part);
  const path = stringField(input, "filePath") ?? stringField(input, "file_path") ?? stringField(input, "path");
  const name = path?.split(/[\\/]/).filter(Boolean).pop();
  return name ?? null;
}

export type RunEventsState = {
  /** Tool parts seen, by part id: started once, written once. */
  steps: Record<string, "started" | "written">;
  /** Sessions with a run under way that has not answered yet. */
  live: Record<string, true>;
  /** Chat titles, as session events name them. */
  titles: Record<string, string>;
};

export const EMPTY_RUN_EVENTS: RunEventsState = { steps: {}, live: {}, titles: {} };

export type RunEventsResult = { state: RunEventsState; emitted: DeskRunEvent[] };

function started(state: RunEventsState, runId: string, step: StepInfo): DeskRunEvent {
  const title = state.titles[runId];
  return {
    type: "step.started",
    runId,
    label: step.label,
    kind: step.kind,
    ...(step.url ? { url: step.url } : {}),
    ...(title ? { chatTitle: title } : {}),
  };
}

function answered(state: RunEventsState, runId: string): RunEventsResult {
  if (!state.live[runId]) return { state, emitted: [] };
  const live = { ...state.live };
  delete live[runId];
  return { state: { ...state, live }, emitted: [{ type: "run.answered", runId }] };
}

function markLive(state: RunEventsState, runId: string): RunEventsState {
  return state.live[runId] ? state : { ...state, live: { ...state.live, [runId]: true } };
}

function partEvent(state: RunEventsState, part: UnknownRecord): RunEventsResult {
  const step = classifyStep(part);
  const id = stringField(part, "id");
  const runId = stringField(part, "sessionID");
  if (!step || !id || !runId) return { state, emitted: [] };
  const status = stringField(recordField(part, "state"), "status");
  // A pending part's input is still streaming, so it cannot say yet what the step is.
  if (status === "pending") return { state: markLive(state, runId), emitted: [] };
  const emitted: DeskRunEvent[] = [];
  let next = markLive(state, runId);
  let seen = next.steps[id];
  if (!seen) {
    emitted.push(started(next, runId, step));
    seen = "started";
  }
  if (status === "completed" && step.kind === "files" && seen !== "written") {
    const name = writtenFileName(part);
    if (name) emitted.push({ type: "file.written", name, chatId: runId });
    seen = "written";
  }
  if (next.steps[id] !== seen) next = { ...next, steps: { ...next.steps, [id]: seen } };
  return { state: next, emitted };
}

/**
 * One engine event in, the Desk events it means out. A tool part starts its step once,
 * however many updates it gets; a write or edit that completes writes its file once; a run
 * answers once, when its session goes idle after being busy or its assistant message
 * finishes with an answer rather than more tool calls.
 */
export function reduceRunEvent(state: RunEventsState, event: OpencodeEvent): RunEventsResult {
  const props = isRecord(event.properties) ? event.properties : undefined;

  if (event.type === "message.part.updated") {
    const part = recordField(props, "part");
    return part ? partEvent(state, part) : { state, emitted: [] };
  }

  if (event.type === "session.status") {
    const runId = stringField(props, "sessionID");
    const status = stringField(recordField(props, "status"), "type");
    if (!runId || !status) return { state, emitted: [] };
    if (status === "idle") return answered(state, runId);
    return { state: markLive(state, runId), emitted: [] };
  }

  if (event.type === "session.idle") {
    const runId = stringField(props, "sessionID");
    return runId ? answered(state, runId) : { state, emitted: [] };
  }

  if (event.type === "message.updated") {
    const info = recordField(props, "info");
    const runId = stringField(info, "sessionID");
    const finish = stringField(info, "finish");
    const completed = recordField(info, "time")?.completed;
    if (!runId || info?.role !== "assistant" || typeof completed !== "number") return { state, emitted: [] };
    if (!finish || finish === "tool-calls" || finish === "unknown") return { state, emitted: [] };
    return answered(state, runId);
  }

  if (event.type === "permission.asked" || event.type === "permission.v2.asked") {
    const runId = stringField(props, "sessionID");
    if (!runId) return { state, emitted: [] };
    const label = stringField(props, "title") ?? stringField(props, "permission") ?? "permission";
    return { state: markLive(state, runId), emitted: [started(state, runId, { kind: "approval", label })] };
  }

  if (event.type === "session.created" || event.type === "session.updated") {
    const info = recordField(props, "info");
    const runId = stringField(info, "id") ?? stringField(props, "sessionID");
    const title = stringField(info, "title");
    if (!runId || !title || state.titles[runId] === title) return { state, emitted: [] };
    return { state: { ...state, titles: { ...state.titles, [runId]: title } }, emitted: [] };
  }

  return { state, emitted: [] };
}
