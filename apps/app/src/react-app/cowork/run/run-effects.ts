import type { BrowserCowork, FrameState } from "../store/frame-store";
import { coworkPage, type CoworkPage, type CoworkPagesState } from "./cowork-pages";
import type { CoworkRunEvent } from "./run-events";

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
 * (a new chat whose id is not in the address yet, or another Cowork screen) any run may, so a
 * first message that browses still opens the browser. A run in another chat never takes
 * the panel from the one the person is reading.
 */
export function runBelongsToFrame(runId: string, openChatId: string | null): boolean {
  return openChatId === null || openChatId === runId;
}

export type RunEffect =
  | { type: "open-browser" }
  | { type: "set-cowork"; cowork: BrowserCowork }
  | { type: "reading"; runId: string; url: string | null }
  | { type: "page-read"; page: CoworkPage }
  | { type: "invalidate-files" };

export type RunEffectContext = {
  openChatId: string | null;
  cowork: BrowserCowork;
  /** The run that last used the browser. */
  readingRun: string | null;
  now: number;
};

/**
 * What the frame does about one Cowork event. A web NAVIGATION step (a real page open/fetch)
 * opens the browser and Cowork reads, unless the person has taken the tab over; a bare web
 * SEARCH does not open the panel (item 7a). A web step with an address is a page read. An
 * answer marks the page done, only from reading and only for the run that read it. A written
 * file refreshes the Files list.
 */
export function runEffects(event: CoworkRunEvent, ctx: RunEffectContext): RunEffect[] {
  if (event.type === "file.written") return [{ type: "invalidate-files" }];
  if (event.type === "run.answered") {
    const ours = ctx.readingRun === null || ctx.readingRun === event.runId;
    return ctx.cowork === "reading" && ours ? [{ type: "set-cowork", cowork: "done" }] : [];
  }
  if (event.kind !== "web") return [];
  const effects: RunEffect[] = [];
  const page = event.url
    ? coworkPage({ url: event.url, chatId: event.runId, chatTitle: event.chatTitle, at: ctx.now })
    : null;
  if (page) effects.push({ type: "page-read", page });
  // A bare web SEARCH (a query with no address, not a browser/devtools/page tool) no longer opens
  // the browser panel; only a real navigation/fetch does (item 7a). A search can still record a
  // page above if the engine ever gives it a result url.
  if (!event.navigation) return effects;
  if (!runBelongsToFrame(event.runId, ctx.openChatId)) return effects;
  effects.push({ type: "open-browser" });
  // A click or a snapshot names no address: Cowork is still on the page its run opened.
  if (event.url || ctx.readingRun !== event.runId) {
    effects.push({ type: "reading", runId: event.runId, url: event.url ?? null });
  }
  if (ctx.cowork !== "you") effects.push({ type: "set-cowork", cowork: "reading" });
  return effects;
}

export type RunEffectTargets = {
  frame: Pick<FrameState, "openPanel" | "setCowork" | "setBrowserTab">;
  pages: Pick<CoworkPagesState, "record" | "setReading">;
  invalidateFiles: () => void;
};

export function performRunEffects(effects: readonly RunEffect[], targets: RunEffectTargets) {
  for (const effect of effects) {
    if (effect.type === "open-browser") targets.frame.openPanel("browser");
    else if (effect.type === "set-cowork") targets.frame.setCowork(effect.cowork);
    else if (effect.type === "page-read") targets.pages.record(effect.page);
    else if (effect.type === "invalidate-files") targets.invalidateFiles();
    else {
      // A new address may be a new tab: let the panel find Cowork's tab again.
      if (effect.url) targets.frame.setBrowserTab(null);
      targets.pages.setReading({ runId: effect.runId, url: effect.url });
    }
  }
}

/** The Files list's queries, every workspace scope. */
export const COWORK_FILES_QUERY_KEY: readonly string[] = ["cowork-files"];
