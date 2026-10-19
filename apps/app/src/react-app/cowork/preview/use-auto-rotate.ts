import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export type AutoRotateOptions = {
  /** Number of entries in the rotating collection. */
  count: number;
  /** Time each entry remains visible. */
  ms: number;
  /** Whether interaction or an explicit control has paused rotation. */
  paused: boolean;
};

export type AutoRotateState = {
  /** Current zero-based entry index. */
  index: number;
  /** Lets manual controls select a specific entry. */
  setIndex: Dispatch<SetStateAction<number>>;
  /** True when the operating system asks for less motion. */
  reducedMotion: boolean;
};

/** Pure wraparound step used by every rotating surface. */
export function nextAutoRotateIndex(index: number, count: number): number {
  return count > 1 ? (index + 1) % count : 0;
}

/** Shared rotation timer with reduced-motion and hidden-document safeguards. */
export function useAutoRotate(options: AutoRotateOptions): AutoRotateState {
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false),
  );

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
    if (typeof window === "undefined") return;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (options.paused || hidden || reducedMotion || options.count <= 1) return;
    const timer = window.setTimeout(
      () => setIndex((current) => nextAutoRotateIndex(current, options.count)),
      options.ms,
    );
    return () => window.clearTimeout(timer);
  }, [hidden, options.count, options.ms, options.paused, reducedMotion, index]);

  return { index, setIndex, reducedMotion };
}
