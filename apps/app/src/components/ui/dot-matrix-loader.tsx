import * as React from "react"

import { cn } from "@/lib/utils"

type DotMatrixLoaderProps = React.ComponentPropsWithoutRef<"span"> & {
  className?: string
  label: string
}

/**
 * The running-work mark, drawn as the design system's Loader at its small size
 * (`rr-loader rr-loader--sm`): three bars on the brand's 40 degree rake, passing
 * a highlight along, with a static hold under reduced motion. The design system
 * owns the animation in CSS, so nothing ticks in JavaScript.
 *
 * The label is the design system's visually hidden `rr-loader__sr` text plus a
 * `title`. It is not a live region: these marks sit on every running row of a
 * transcript or the sidebar, and a region per row would talk over the reader
 * each time one starts, which the design system's `live={false}` is for.
 *
 * A span rather than the design system's div, because the mark sits inline in a
 * line of text. The export keeps its name so call sites do not change.
 */
export function DotMatrixLoader({ className, label, ...rest }: DotMatrixLoaderProps) {
  return (
    <span
      {...rest}
      role="status"
      title={label}
      className={cn("rr-loader rr-loader--sm shrink-0", className)}
    >
      <span className="rr-loader__bars" aria-hidden="true">
        <span className="rr-loader__bar" />
        <span className="rr-loader__bar" />
        <span className="rr-loader__bar" />
      </span>
      <span className="rr-loader__sr">{label}</span>
    </span>
  )
}
