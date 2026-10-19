import * as React from "react"

/** Seconds as the run timers show them: "34s" under a minute, "1m 23s" after. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

/**
 * Elapsed time since `startedAt` (ms), ticking once a second while `active`. Anchored to the run's
 * server start when given, so a remounted row keeps counting instead of resetting; falls back to
 * this hook's first mount.
 */
export function useElapsed(active: boolean, startedAt?: number | null): string {
  const firstMountRef = React.useRef<number>(Date.now())
  const anchor = startedAt ?? firstMountRef.current
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return formatElapsed((now - anchor) / 1000)
}
