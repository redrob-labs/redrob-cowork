import type { UIMessage } from "ai";
import { create } from "zustand";

/**
 * Round 7 C6: the deliverable being written, shown live in the side panel's Artifacts tab.
 *
 * The engine sends a `write` tool part with its WHOLE `content` once the call starts running (the
 * file body is not streamed in pieces), then settles it when the file is on disk - often within
 * milliseconds. So the panel cannot wait for the file: it takes the content from the tool part and
 * reveals it letter by letter (useSmoothReveal, the same 2x -> 1x pacing as the chat), and only
 * swaps to the real file once that reveal has finished AND the write has settled.
 */
export type LiveDraft = {
  /** The tool call that writes the file; a new call is a new draft. */
  callId: string;
  /** Workspace path the file is written to, as the tool received it. */
  path: string;
  /** The full file body the tool was given. */
  content: string;
  /** True once the write tool part has settled (the file exists or the write failed). */
  settled: boolean;
};

type ToolPartLike = { type: string; toolName?: unknown; toolCallId?: unknown; state?: unknown; input?: unknown };

/** The write tools whose input carries the whole file body (edit / apply_patch carry diffs). */
const FULL_WRITE_TOOL = /(^|[._:/-])write$/i;

function fullWriteOf(part: ToolPartLike): LiveDraft | null {
  if (part.type !== "dynamic-tool" || typeof part.toolName !== "string" || !FULL_WRITE_TOOL.test(part.toolName)) return null;
  if (part.state === "output-error") return null;
  const input = typeof part.input === "object" && part.input !== null ? (part.input as Record<string, unknown>) : null;
  const path = typeof input?.filePath === "string" ? input.filePath.trim() : "";
  const content = typeof input?.content === "string" ? input.content : "";
  if (!path || !content) return null;
  return {
    callId: typeof part.toolCallId === "string" ? part.toolCallId : path,
    path,
    content,
    settled: part.state === "output-available",
  };
}

/**
 * The newest full-file write in the turn that is running now: scans back from the end of the
 * transcript and stops at the person's message that opened the turn. Pure.
 */
export function latestLiveDraft(messages: readonly UIMessage[]): LiveDraft | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role === "user") return null;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      const draft = part ? fullWriteOf(part as ToolPartLike) : null;
      if (draft) return draft;
    }
  }
  return null;
}

/**
 * Whether an artifact path (normalized, workspace-relative) is the file a write tool targeted
 * (often absolute). Case-insensitive, slash-agnostic, suffix match on whole path segments.
 */
export function artifactPathMatches(artifactPath: string, writePath: string): boolean {
  const norm = (value: string) => value.trim().replace(/[\\]+/g, "/").replace(/^\.\//, "").toLowerCase();
  const a = norm(artifactPath);
  const w = norm(writePath);
  if (!a || !w) return false;
  return a === w || w.endsWith(`/${a}`) || a.endsWith(`/${w}`);
}

type LiveDraftState = {
  /** The live draft per side-panel session key; absent when nothing is being written. */
  drafts: Record<string, LiveDraft>;
  /** Tool calls already shown and handed over to the real file, per session key. */
  done: Record<string, string[]>;
  /** Publishes (or updates) the session's live draft. Ignored for a call already handed over. */
  publish(sessionKey: string, draft: LiveDraft): void;
  /** The panel finished revealing a draft and opened the real file: forget it. */
  finish(sessionKey: string, callId: string): void;
};

export const useLiveDraftStore = create<LiveDraftState>()((set, get) => ({
  drafts: {},
  done: {},
  publish: (sessionKey, draft) => {
    if (get().done[sessionKey]?.includes(draft.callId)) return;
    const current = get().drafts[sessionKey];
    if (current && current.callId === draft.callId && current.settled === draft.settled && current.content === draft.content) return;
    set((state) => ({ drafts: { ...state.drafts, [sessionKey]: draft } }));
  },
  finish: (sessionKey, callId) =>
    set((state) => {
      const { [sessionKey]: current, ...rest } = state.drafts;
      const drafts = current && current.callId === callId ? rest : state.drafts;
      const done = { ...state.done, [sessionKey]: [...(state.done[sessionKey] ?? []), callId].slice(-20) };
      return { drafts, done };
    }),
}));
