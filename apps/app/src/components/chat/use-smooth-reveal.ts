import * as React from "react"

/**
 * Letter-by-letter reveal pacing for streaming assistant text.
 *
 * A throttler can only ever reveal text the model has ALREADY emitted - it cannot outrun
 * generation. So "start at 2x Claude, settle to 1x Claude" is implemented as a constant
 * target reading rate with an opening burst: at the start of a turn the model's first
 * tokens land before the reveal catches up (a backlog), so we reveal at 2x the base rate
 * to drain that backlog and feel instantly responsive, then decay smoothly to 1x the base
 * rate - roughly Claude's sustained painted pace - so the reveal never stalls waiting for
 * tokens. When the model races far ahead a bounded extra catch-up keeps the lag from
 * growing without turning the reveal choppy; when streaming ends we snap to the full text.
 *
 * Under prefers-reduced-motion there is no paced reveal: the full text shows immediately.
 */

/** Base sustained reveal rate (chars/sec) ~= Claude's painted reading pace ("1x"). */
const BASE_CHARS_PER_SEC = 55
/** Opening burst multiplier ("2x Claude") that drains the first-token backlog. */
const BURST_MULTIPLIER = 2
/** Seconds over which the burst decays from 2x back to 1x. */
const BURST_DECAY_SECONDS = 1.2
/** Cap on how far ahead of the base pace we will catch up when the model races (chars/sec). */
const MAX_CATCHUP_CHARS_PER_SEC = BASE_CHARS_PER_SEC * 6
/** Backlog (chars not yet revealed) above which the bounded catch-up kicks in. */
const CATCHUP_BACKLOG_THRESHOLD = 240

/** What the reveal hook returns. */
export type SmoothReveal = {
  /** The prefix of `fullText` to render this frame. */
  revealed: string
  /** True while the reveal is actively behind the full text (drives the typing cursor). */
  revealing: boolean
}

/**
 * Pure reveal rate (chars/sec) for the current frame, given how far into the run we are and
 * how big the backlog of unrevealed text is. Exported for testing: it carries the whole 2x->1x
 * burst + bounded catch-up policy with no DOM or timers, so the realism can be asserted directly.
 *
 * - At `sinceStartSeconds = 0` the rate is BURST_MULTIPLIER x base (the "2x Claude" opening).
 * - By `BURST_DECAY_SECONDS` it has decayed to 1x base (Claude's sustained pace).
 * - A backlog over CATCHUP_BACKLOG_THRESHOLD raises the floor toward a bounded catch-up so a
 *   model that raced ahead does not leave the reveal permanently behind.
 */
export function computeRevealRate(sinceStartSeconds: number, backlog: number): number {
  const burstProgress = Math.min(1, Math.max(0, sinceStartSeconds) / BURST_DECAY_SECONDS)
  const burst = BURST_MULTIPLIER - (BURST_MULTIPLIER - 1) * burstProgress
  let rate = BASE_CHARS_PER_SEC * burst
  if (backlog > CATCHUP_BACKLOG_THRESHOLD) {
    rate = Math.max(rate, Math.min(MAX_CATCHUP_CHARS_PER_SEC, backlog / BURST_DECAY_SECONDS))
  }
  return rate
}

/** Round 9: seconds the leftover text takes to drain once the stream has ended. */
const DRAIN_SECONDS = 0.8

/**
 * Pure drain rate (chars/sec) after the stream has ended: whatever is left finishes in about
 * DRAIN_SECONDS, never slower than the bounded catch-up pace (so the tail does not crawl).
 */
export function drainRate(sinceStartSeconds: number, backlog: number): number {
  return Math.max(computeRevealRate(sinceStartSeconds, backlog), backlog / DRAIN_SECONDS, MAX_CATCHUP_CHARS_PER_SEC)
}

/** True when the OS asks for reduced motion (read once per hook instance, kept live). */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])
  return reduced
}

/**
 * Reveal `fullText` at a smooth, constant velocity with an opening burst while `streaming`
 * is true. Returns the revealed prefix and whether the reveal is still behind.
 *
 * Round 9: when the stream ends with text still unrevealed (the model often races far ahead of the
 * reading pace), the rest DRAINS over about DRAIN_SECONDS instead of snapping in at once. Measured
 * live before this change: a single 50ms frame jumped by 542 characters at the end of a turn,
 * which read as a block landing rather than writing.
 */
export function useSmoothReveal(fullText: string, streaming: boolean): SmoothReveal {
  const reducedMotion = usePrefersReducedMotion()
  // How many characters are currently revealed; fractional so <1 char/frame still averages right.
  const [revealedCount, setRevealedCount] = React.useState(0)
  // Bumped once a post-stream drain completes, so the hook re-renders out of the paced state.
  const [, setDrained] = React.useState(0)

  // Mutable frame state kept in a ref so the rAF loop reads fresh values without re-subscribing.
  const stateRef = React.useRef({
    // Fractional revealed length, the source of truth the integer state mirrors.
    revealed: 0,
    // Timestamp of the previous frame, for elapsed-time integration.
    lastFrame: 0,
    // When the current reveal run started, for the burst decay curve.
    startedAt: 0,
    // Latest full text, so the loop reads growth without being re-armed every token.
    text: fullText,
    // Whether the stream is still live (the loop drains faster once it is not).
    streaming,
    // This hook has paced a stream that has not been fully revealed yet.
    owesDrain: false,
  })
  stateRef.current.text = fullText
  stateRef.current.streaming = streaming
  if (streaming) stateRef.current.owesDrain = true

  // Drain after the stream ends: keep pacing until everything shown so far has been revealed.
  const draining = !streaming && stateRef.current.owesDrain && stateRef.current.revealed < fullText.length
  // Reduced motion, or no streaming and nothing owed: show everything immediately.
  const paced = (streaming || draining) && !reducedMotion

  React.useEffect(() => {
    if (!paced) {
      // Snap to full: either the stream ended or motion is reduced.
      stateRef.current.revealed = fullText.length
      setRevealedCount(fullText.length)
      return
    }

    let raf = 0
    stateRef.current.lastFrame = 0
    stateRef.current.startedAt = 0

    const tick = (now: number) => {
      const state = stateRef.current
      if (state.startedAt === 0) state.startedAt = now
      if (state.lastFrame === 0) state.lastFrame = now
      const deltaSeconds = Math.max(0, (now - state.lastFrame) / 1000)
      state.lastFrame = now

      const total = state.text.length
      const backlog = total - state.revealed

      if (backlog > 0) {
        // Shared 2x->1x burst + bounded catch-up policy (tested via computeRevealRate); once the
        // stream has ended, drainRate finishes the rest in about DRAIN_SECONDS.
        const sinceStart = (now - state.startedAt) / 1000
        const rate = state.streaming ? computeRevealRate(sinceStart, backlog) : drainRate(sinceStart, backlog)

        // Never reveal past what the model has emitted.
        state.revealed = Math.min(total, state.revealed + rate * deltaSeconds)
        setRevealedCount(Math.floor(state.revealed))
        if (!state.streaming && state.revealed >= total) {
          state.owesDrain = false
          setDrained((value) => value + 1)
        }
      } else if (!state.streaming) {
        // Drained: re-render so the hook settles to "not paced" and this loop stops.
        state.owesDrain = false
        setDrained((value) => value + 1)
      }

      raf = window.requestAnimationFrame(tick)
    }

    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
    // Re-arm only when the paced flag flips; growth of fullText is read via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paced])

  // When paced, mirror the fractional source of truth; otherwise show the whole text.
  const count = paced ? Math.min(revealedCount, fullText.length) : fullText.length
  const revealed = fullText.slice(0, count)
  const revealing = paced && count < fullText.length

  return { revealed, revealing }
}
