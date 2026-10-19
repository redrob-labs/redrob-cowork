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
    if (options.paused || hidden || reducedMotion || options.count <= 1) return;
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
  onBlur: (event: FocusEvent<HTMLElement>) => void;
};

/**
 * Holds a rotating surface still while the pointer or keyboard focus is inside it, which is the
 * on-page pause for a surface with no visible pause control (WCAG 2.2.2). Focus moving between
 * children of the same element does not count as leaving it.
 */
export function useInteractionPause(): { paused: boolean; handlers: InteractionPauseHandlers } {
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const handlers = useMemo<InteractionPauseHandlers>(() => ({
    onMouseEnter: () => setPointerInside(true),
    onMouseLeave: () => setPointerInside(false),
    onFocus: () => setFocusInside(true),
    onBlur: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false);
    },
  }), []);
  return { paused: pointerInside || focusInside, handlers };
}
