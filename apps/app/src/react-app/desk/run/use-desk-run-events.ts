import { useEffect, useEffectEvent } from "react";
import { useLocation } from "react-router";

import { subscribeSessionSyncEvents } from "../../domains/session/sync/session-sync";
import { getReactQueryClient } from "../../infra/query-client";
import { useFrameStore } from "../store/frame-store";
import { useDeskPages } from "./desk-pages";
import { DESK_FILES_QUERY_KEY, openChatIdFromPath, performRunEffects, runEffects } from "./run-effects";
import { EMPTY_RUN_EVENTS, reduceRunEvent } from "./run-events";

/**
 * Reads the engine's events as the session sync applies them, for every open workspace, and
 * moves the frame: a web step opens the browser, an answer marks the page done, a written
 * file refreshes Files. Mounted once, in `DeskLayer`.
 */
export function useDeskRunEvents() {
  const { pathname } = useLocation();
  const openChatId = useEffectEvent(() => openChatIdFromPath(pathname));

  useEffect(() => {
    let state = EMPTY_RUN_EVENTS;
    return subscribeSessionSyncEvents((_workspaceId, event) => {
      const result = reduceRunEvent(state, event);
      state = result.state;
      for (const emitted of result.emitted) {
        const frame = useFrameStore.getState();
        const pages = useDeskPages.getState();
        const effects = runEffects(emitted, {
          openChatId: openChatId(),
          desk: frame.browser.desk,
          readingRun: pages.reading?.runId ?? null,
          now: Date.now(),
        });
        performRunEffects(effects, {
          frame,
          pages,
          invalidateFiles: () => void getReactQueryClient().invalidateQueries({ queryKey: DESK_FILES_QUERY_KEY }),
        });
      }
    });
  }, []);
}
