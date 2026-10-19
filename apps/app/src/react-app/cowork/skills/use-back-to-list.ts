import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

import { useFrameStore } from "../store/frame-store";

/** What else may own Escape on a detail page. */
export type EscapeToListState = {
  /** Whether a frame modal currently owns Escape. */
  modalOpen: boolean;
  /** Whether a page dialog (e.g. scheduling) currently owns Escape. */
  scheduling: boolean;
};

/** Pure guard for when Escape may return from a detail page to the marketplace. */
export function shouldEscapeToList(
  event: { key: string; defaultPrevented: boolean; targetTag?: string; contentEditable?: boolean },
  state: EscapeToListState,
): boolean {
  if (event.key !== "Escape" || event.defaultPrevented || state.modalOpen || state.scheduling || event.contentEditable) return false;
  return !["INPUT", "TEXTAREA", "SELECT"].includes(event.targetTag ?? "");
}

/**
 * Back navigation for a skill or workflow page: steps back through history when the page was opened
 * from a list (so no duplicate entry is added), else replaces it with the Skills page carrying
 * `{ [restoreKey]: restoreValue }` so the list refocuses the originating tile. Bare Escape does the
 * same unless a modal, a `blocked` page dialog, or a text field owns it.
 */
export function useBackToList(options: {
  /** Location-state key the Skills page reads to refocus a tile: `fromSkill` or `fromWorkflow`. */
  restoreKey: "fromSkill" | "fromWorkflow";
  /** The skill name or workflow id to refocus. */
  restoreValue: string;
  /** Whether a page dialog currently owns Escape. */
  blocked?: boolean;
}): { backPath: string; back: () => void } {
  const navigate = useNavigate();
  const location = useLocation();
  const modalOpen = useFrameStore((state) => state.modal !== null);
  const fromPath = (location.state as { fromPath?: string } | null)?.fromPath;
  const backPath = fromPath ?? "/skills";
  const { restoreKey, restoreValue } = options;
  const back = useCallback(() => {
    if (fromPath) navigate(-1);
    else navigate(backPath, { replace: true, state: { [restoreKey]: restoreValue } });
  }, [backPath, fromPath, navigate, restoreKey, restoreValue]);
  const blocked = Boolean(options.blocked);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const escape = shouldEscapeToList(
        { key: event.key, defaultPrevented: event.defaultPrevented, targetTag: target?.tagName, contentEditable: Boolean(target?.isContentEditable || target?.closest("[contenteditable]")) },
        { modalOpen, scheduling: blocked },
      );
      if (escape) back();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [back, blocked, modalOpen]);

  return { backPath, back };
}
