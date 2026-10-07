import type { BrowserDesk, FrameState } from "../store/frame-store";
import { deskPage, type DeskPage, type DeskPagesState } from "./desk-pages";
import type { DeskRunEvent } from "./run-events";

/** The chat the frame has open, from the route: `/chat/<id>` or a workspace session route. */
export function openChatIdFromPath(pathname: string): string | null {
  const match = /^\/(?:chat|workspace\/[^/]+\/session)\/([^/]+)/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Whether a run's step may move the panel. A run in the open chat may; with no chat open
 * (a new chat whose id is not in the address yet, or another Desk screen) any run may, so a
 * first message that browses still opens the browser. A run in another chat never takes
 * the panel from the one the person is reading.
 */
export function runBelongsToFrame(runId: string, openChatId: string | null): boolean {
  return openChatId === null || openChatId === runId;
}

export type RunEffect =
  | { type: "open-browser" }
  | { type: "set-desk"; desk: BrowserDesk }
  | { type: "reading"; runId: string; url: string | null }
  | { type: "page-read"; page: DeskPage }
  | { type: "invalidate-files" };

export type RunEffectContext = {
  openChatId: string | null;
  desk: BrowserDesk;
  /** The run that last used the browser. */
  readingRun: string | null;
  now: number;
};

/**
 * What the frame does about one Desk event. A web step opens the browser and Desk reads,
 * unless the person has taken the tab over; every web step with an address is a page read
 * today. An answer marks the page done, only from reading and only for the run that read
 * it. A written file refreshes the Files list.
 */
export function runEffects(event: DeskRunEvent, ctx: RunEffectContext): RunEffect[] {
  if (event.type === "file.written") return [{ type: "invalidate-files" }];
  if (event.type === "run.answered") {
    const ours = ctx.readingRun === null || ctx.readingRun === event.runId;
    return ctx.desk === "reading" && ours ? [{ type: "set-desk", desk: "done" }] : [];
  }
  if (event.kind !== "web") return [];
  const effects: RunEffect[] = [];
  const page = event.url
    ? deskPage({ url: event.url, chatId: event.runId, chatTitle: event.chatTitle, at: ctx.now })
    : null;
  if (page) effects.push({ type: "page-read", page });
  if (!runBelongsToFrame(event.runId, ctx.openChatId)) return effects;
  effects.push({ type: "open-browser" });
  // A click or a snapshot names no address: Desk is still on the page its run opened.
  if (event.url || ctx.readingRun !== event.runId) {
    effects.push({ type: "reading", runId: event.runId, url: event.url ?? null });
  }
  if (ctx.desk !== "you") effects.push({ type: "set-desk", desk: "reading" });
  return effects;
}

export type RunEffectTargets = {
  frame: Pick<FrameState, "openPanel" | "setDesk" | "setBrowserTab">;
  pages: Pick<DeskPagesState, "record" | "setReading">;
  invalidateFiles: () => void;
};

export function performRunEffects(effects: readonly RunEffect[], targets: RunEffectTargets) {
  for (const effect of effects) {
    if (effect.type === "open-browser") targets.frame.openPanel("browser");
    else if (effect.type === "set-desk") targets.frame.setDesk(effect.desk);
    else if (effect.type === "page-read") targets.pages.record(effect.page);
    else if (effect.type === "invalidate-files") targets.invalidateFiles();
    else {
      // A new address may be a new tab: let the panel find Desk's tab again.
      if (effect.url) targets.frame.setBrowserTab(null);
      targets.pages.setReading({ runId: effect.runId, url: effect.url });
    }
  }
}

/** The Files list's queries, every workspace scope. */
export const DESK_FILES_QUERY_KEY: readonly string[] = ["desk-files"];
