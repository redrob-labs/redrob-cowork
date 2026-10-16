import { useEffect, useEffectEvent } from "react";
import { useLocation } from "react-router";

import { subscribeSessionSyncEvents } from "../../domains/session/sync/session-sync";
import { getReactQueryClient } from "../../infra/query-client";
import { useFrameStore } from "../store/frame-store";
import { useCoworkPages } from "./cowork-pages";
import { coworkKeepAwake, runIsBusy } from "./keep-awake";
import { COWORK_FILES_QUERY_KEY, openChatIdFromPath, performRunEffects, runEffects } from "./run-effects";
import { EMPTY_RUN_EVENTS, reduceRunEvent } from "./run-events";

/**
 * Reads the engine's events as the session sync applies them, for every open workspace, and
 * moves the frame: a web step opens the browser, an answer marks the page done, a written
 * file refreshes Files. Whether any run is busy drives "Keep this computer awake during a
 * run". Mounted once, in `CoworkLayer`.
 */
export function useCoworkRunEvents() {
  const { pathname } = useLocation();
  const openChatId = useEffectEvent(() => openChatIdFromPath(pathname));

  useEffect(() => {
    let state = EMPTY_RUN_EVENTS;
    return subscribeSessionSyncEvents((_workspaceId, event) => {
      const result = reduceRunEvent(state, event);
      state = result.state;
      coworkKeepAwake().setBusy(runIsBusy(state));
      for (const emitted of result.emitted) {
        const frame = useFrameStore.getState();
        const pages = useCoworkPages.getState();
        const effects = runEffects(emitted, {
          openChatId: openChatId(),
          cowork: frame.browser.cowork,
          readingRun: pages.reading?.runId ?? null,
          now: Date.now(),
        });
        performRunEffects(effects, {
          frame,
          pages,
          invalidateFiles: () => void getReactQueryClient().invalidateQueries({ queryKey: COWORK_FILES_QUERY_KEY }),
        });
      }
    });
  }, []);
}
