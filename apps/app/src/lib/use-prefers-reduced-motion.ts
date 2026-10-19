import * as React from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

/** Whether the OS asks for reduced motion right now (false where matchMedia is unavailable). */
function readReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches
}

/**
 * Whether the OS asks for reduced motion, read on the first render (so no animated frame shows
 * first) and kept live when the setting changes.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(readReducedMotion)
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const query = window.matchMedia(QUERY)
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])
  return reduced
}
