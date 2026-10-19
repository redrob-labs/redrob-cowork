import * as React from "react"

import { getResolvedThemeMode, subscribeToTheme } from "@/app/theme"
import { cn } from "@/lib/utils"
// The engine is a vendored, dependency-free Canvas-2D ES module; its sibling .d.ts supplies the types.
import { createLiquidLoader, type LiquidLoader } from "./vendor/liquid-loader-engine.js"

/** Used only when the brand token cannot be read (no stylesheet, e.g. a test render). */
const FALLBACK_COLOR = "#2B52FF"

/** The brand blue as the current theme defines it, read from the canvas's computed style. */
function brandColor(canvas: HTMLCanvasElement): string {
  return getComputedStyle(canvas).getPropertyValue("--action-primary").trim() || FALLBACK_COLOR
}

/** Props for the in-chat liquid loader. */
export type RedrobLiquidLoaderProps = {
  /** Square size in CSS px. Brand minimum for the animated symbol is 96; default 96 for the thinking row. */
  size?: number
  /** Fill color. Defaults to the theme's brand blue (`--action-primary`); pass #FFFFFF on a dark/brand ground. */
  color?: string
  /** Accessible label announced once (role=status). Always pass something real. */
  label: string
  /** Extra classes on the wrapping span. */
  className?: string
}

/**
 * The Redrob Liquid Loader: the brand mark melts into a drop, splits into three balls,
 * stretches into the three raked Loader bars, runs three light passes, then flows back.
 * 8.64 s seamless loop, deterministic, ~1 ms/frame. Used for the primary "assistant is
 * thinking" moment only; small inline tool rows keep the DS three-bar `DotMatrixLoader`.
 *
 * The engine owns the animation on a canvas; nothing ticks in React. It follows the OS
 * reduced-motion setting by default and pauses itself while the document is hidden. The
 * canvas is `aria-hidden`; the visually hidden label carries the meaning for a reader.
 */
export function RedrobLiquidLoader({ size = 96, color, label, className }: RedrobLiquidLoaderProps) {
  // The canvas the engine draws into.
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  // The live engine handle, so size/color updates go through its methods, not a remount.
  const loaderRef = React.useRef<LiquidLoader | null>(null)
  // The resolved light/dark mode, so the default colour is re-read from the theme when it changes.
  const theme = React.useSyncExternalStore(subscribeToTheme, getResolvedThemeMode, getResolvedThemeMode)

  // Create once on mount; the engine reads devicePixelRatio and follows reduced motion itself.
  React.useEffect(() => {
    if (!canvasRef.current) return
    loaderRef.current = createLiquidLoader(canvasRef.current, { size, color: color ?? brandColor(canvasRef.current), reducedMotion: "auto" })
    return () => {
      loaderRef.current?.destroy()
      loaderRef.current = null
    }
    // Created once; size and color are pushed in place by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resize in place when the size prop changes (re-reads devicePixelRatio).
  React.useEffect(() => {
    loaderRef.current?.resize(size)
  }, [size])

  // Recolor in place when the color prop or the theme changes; no prop means the theme's brand blue.
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) loaderRef.current?.setColor(color ?? brandColor(canvas))
  }, [color, theme])

  return (
    <span role="status" title={label} className={cn("inline-flex items-center", className)}>
      <canvas ref={canvasRef} aria-hidden="true" className="block" />
      {/* Visually hidden label: announced once for a reader; matches DotMatrixLoader's rr-loader__sr. */}
      <span className="sr-only">{label}</span>
    </span>
  )
}
