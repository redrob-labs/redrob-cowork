import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** Whether the operating system asks for less motion right now; false outside a browser. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.(QUERY).matches ?? false);
}

function subscribe(onChange: () => void): () => void {
  const media = typeof window !== "undefined" ? window.matchMedia?.(QUERY) : undefined;
  if (!media) return () => {};
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** The reduced-motion preference as live React state, updating when the OS setting changes. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
