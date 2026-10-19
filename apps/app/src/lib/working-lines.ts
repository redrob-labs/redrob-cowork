import * as React from "react"

import { t } from "@/i18n"
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion"

/**
 * The friendly lines a live run shows when nothing more specific is known (no tool in flight, no
 * thought yet). Half calm, half playful. Each line is its own static t() call so the
 * i18n audit can see every key; never build these keys from a template.
 */
const WORKING_LINES: ReadonlyArray<() => string> = [
  () => t("cowork.working_line_1"),
  () => t("cowork.working_line_2"),
  () => t("cowork.working_line_3"),
  () => t("cowork.working_line_4"),
  () => t("cowork.working_line_5"),
  () => t("cowork.working_line_6"),
  () => t("cowork.working_line_7"),
  () => t("cowork.working_line_8"),
  () => t("cowork.working_line_9"),
  () => t("cowork.working_line_10"),
]

/** How many friendly lines there are to rotate through. */
export const WORKING_LINE_COUNT = WORKING_LINES.length

/** How long each line stays before the next one fades in. */
export const WORKING_LINE_MS = 4500

/** The text of line `index` (wraps, so any integer is safe). */
export function workingLine(index: number): string {
  const size = WORKING_LINES.length
  const line = WORKING_LINES[((index % size) + size) % size]
  return line ? line() : t("cowork.thread_working")
}

/** A random line index that is never `previous`, so the same line never shows twice in a row. */
export function nextWorkingLineIndex(previous: number | null, count = WORKING_LINE_COUNT, random = Math.random): number {
  if (count <= 1) return 0
  if (previous === null || previous < 0 || previous >= count) return Math.floor(random() * count)
  // Pick from the other count-1 slots, then step over `previous`.
  const pick = Math.floor(random() * (count - 1))
  return pick >= previous ? pick + 1 : pick
}

/** Shared across mounts, so a remounted row does not reopen on the line just shown. */
let lastShown: number | null = null

/**
 * The current friendly line and its index (use the index as a React key to replay the fade).
 * Rotates every WORKING_LINE_MS while `active`; with reduced motion one line stays put.
 */
export function useWorkingLine(active = true): { index: number; text: string } {
  const reducedMotion = usePrefersReducedMotion()
  const [index, setIndex] = React.useState(() => {
    const first = nextWorkingLineIndex(lastShown)
    lastShown = first
    return first
  })
  React.useEffect(() => {
    if (!active || reducedMotion) return
    const id = window.setInterval(() => {
      setIndex((previous) => {
        const next = nextWorkingLineIndex(previous)
        lastShown = next
        return next
      })
    }, WORKING_LINE_MS)
    return () => window.clearInterval(id)
  }, [active, reducedMotion])
  return { index, text: workingLine(index) }
}
