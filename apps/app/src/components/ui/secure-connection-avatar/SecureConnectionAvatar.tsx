/** @jsxImportSource react */
import { useEffect, useState } from "react"
import { User } from "lucide-react"

/** Props for the sidebar account avatar. */
export type SecureConnectionAvatarProps = {
  /** Accessible name announced for the avatar. */
  label: string
}

/**
 * The sidebar account avatar: the Secure-Connection "thinking" storm, a self-contained
 * animated web component (no deps/network, own shadow root). It is square and unmasked,
 * so the surrounding `.cowork-account__avatar-placeholder` supplies the 32x32 circular
 * frame and the `var(--surface-sunken)` background (unchanged from before).
 *
 * The component respects reduced motion and pauses while the document is hidden on its
 * own. We additionally keep the neutral `User` glyph as the fallback for the OS
 * reduced-motion preference (a still glyph is calmer than a paused 3D still) and for a
 * runtime without custom-element support.
 *
 * The component class extends `HTMLElement`, so it must only be evaluated in the browser.
 * It is registered via a browser-guarded dynamic import inside an effect rather than a
 * top-level side-effect import, so non-DOM test environments never touch `HTMLElement`.
 */
export function SecureConnectionAvatar({ label }: SecureConnectionAvatarProps) {
  // True when the OS asks for reduced motion; we then show the still glyph instead of the loop.
  const [reduceMotion, setReduceMotion] = useState(false)
  // True only once the custom element is actually defined, so an unsupported runtime falls back.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduceMotion(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches)
    query.addEventListener("change", onChange)

    let cancelled = false
    // Browser-only dynamic import: registers <secure-connection-avatar> as a side effect.
    if (typeof window.customElements !== "undefined") {
      import("./secure-connection-avatar.js")
        .then(() => window.customElements.whenDefined("secure-connection-avatar"))
        .then(() => {
          if (!cancelled) setReady(true)
        })
        .catch(() => {
          /* Unsupported or failed to load: keep the glyph fallback. */
        })
    }
    return () => {
      cancelled = true
      query.removeEventListener("change", onChange)
    }
  }, [])

  // Fallback: the neutral person glyph, matching the prior placeholder exactly.
  if (reduceMotion || !ready) {
    return <User size={16} strokeWidth={2} aria-hidden="true" />
  }

  // The element fills the 32x32 circular placeholder; the frame clips it to a circle.
  return (
    <secure-connection-avatar
      aria-label={label}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  )
}
