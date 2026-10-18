// Ambient types for the vendored secure-connection-avatar web component.
//
// The JS is a self-contained, dependency-free IIFE that registers the custom
// element <secure-connection-avatar> as a side effect (no runtime exports), so
// the module only needs a side-effect declaration plus the JSX intrinsic type.
import type * as React from "react"

declare module "*/secure-connection-avatar.js" {
  // Side-effect only: importing the file defines the <secure-connection-avatar> custom element.
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      /**
       * The Secure-Connection "thinking" avatar: a self-contained animated web
       * component. Square and unmasked; apply a circular mask on a wrapper. The
       * `paused` attribute holds a still pose; it respects reduced motion and
       * suspends work while the document is hidden.
       */
      "secure-connection-avatar": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          /** Present for a still pose (no animation). */
          paused?: boolean
          /** Accessible name for the element. */
          "aria-label"?: string
        },
        HTMLElement
      >
    }
  }
}
