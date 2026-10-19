import { useEffect, useMemo, useState, type Dispatch, type FocusEvent, type SetStateAction } from "react";

import { usePrefersReducedMotion } from "../../../lib/use-prefers-reduced-motion";

/** What a rotating collection needs to schedule its next step. */
export type AutoRotateOptions = {
  /** Number of entries in the rotating collection. */
  count: number;
  /** Time each entry remains visible. */
  ms: number;
  /** Whether interaction or an explicit control has paused rotation. */
  paused: boolean;
};

/** The current entry and a way for manual controls to pick one. */
export type AutoRotateState = {
  /** Current zero-based entry index. */
  index: number;
  /** Lets manual controls select a specific entry. */
  setIndex: Dispatch<SetStateAction<number>>;
};

/** Pure wraparound step used by every rotating surface. */
export function nextAutoRotateIndex(index: number, count: number): number {
  return count > 1 ? (index + 1) % count : 0;
}

/** Pure: whether the timer should run. Paused (interaction or a manual stop), a hidden document,
 *  reduced motion, or a single entry each hold the surface still. */
export function autoRotateRuns(state: { paused: boolean; hidden: boolean; reducedMotion: boolean; count: number }): boolean {
  return !state.paused && !state.hidden && !state.reducedMotion && state.count > 1;
}

/** Shared rotation timer with reduced-motion and hidden-document safeguards. */
export function useAutoRotate(options: AutoRotateOptions): AutoRotateState {
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setIndex((current) => (options.count > 0 ? current % options.count : 0));
  }, [options.count]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!autoRotateRuns({ paused: options.paused, hidden, reducedMotion, count: options.count })) return;
    const timer = window.setTimeout(
      () => setIndex((current) => nextAutoRotateIndex(current, options.count)),
      options.ms,
    );
    return () => window.clearTimeout(timer);
  }, [hidden, options.count, options.ms, options.paused, reducedMotion, index]);

  return { index, setIndex };
}

/** Pointer and focus handlers to spread on each element whose hover or focus should hold rotation. */
export type InteractionPauseHandlers = {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: (event: Pick<FocusEvent<HTMLElement>, "currentTarget" | "relatedTarget">) => void;
};

/** Pure: the pause handlers over two setters. Focus moving to a child of the same element is not leaving it. */
export function interactionPauseHandlers(
  setPointerInside: (inside: boolean) => void,
  setFocusInside: (inside: boolean) => void,
): InteractionPauseHandlers {
  return {
    onMouseEnter: () => setPointerInside(true),
    onMouseLeave: () => setPointerInside(false),
    onFocus: () => setFocusInside(true),
    onBlur: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false);
    },
  };
}

/**
 * Holds a rotating surface still while the pointer or keyboard focus is inside it, which is the
 * on-page pause for a surface with no visible pause control (WCAG 2.2.2). Focus moving between
 * children of the same element does not count as leaving it.
 */
export function useInteractionPause(): { paused: boolean; handlers: InteractionPauseHandlers } {
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const handlers = useMemo(() => interactionPauseHandlers(setPointerInside, setFocusInside), []);
  return { paused: pointerInside || focusInside, handlers };
}
