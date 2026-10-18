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
 * The storm artwork is ALWAYS shown AND ALWAYS animated, including under the OS reduced-motion
 * preference. The vendored component normally self-suppresses motion under reduced-motion, but
 * per product direction (round 3) its internal reduced-motion check is neutralized in the
 * vendored .js (search `redrob-always-animate`) so the particle flurry keeps running regardless.
 * It still pauses while the document is hidden. The neutral `User` glyph remains only as the
 * fallback for a runtime without custom-element support or a load failure.
 *
 * The component class extends `HTMLElement`, so it must only be evaluated in the browser.
 * It is registered via a browser-guarded dynamic import inside an effect rather than a
 * top-level side-effect import, so non-DOM test environments never touch `HTMLElement`.
 */
export function SecureConnectionAvatar({ label }: SecureConnectionAvatarProps) {
  // True only once the custom element is actually defined, so an unsupported runtime falls back.
  const [ready, setReady] = useState(false)

  useEffect(() => {
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
    }
  }, [])

  // Fallback only when the custom element is unavailable (unsupported runtime / load failure).
  // Reduced motion does NOT fall back here and does not stop the animation (see the JS patch).
  if (!ready) {
    return <User size={16} strokeWidth={2} aria-hidden="true" />
  }

  // The element fills the 32x32 circular placeholder; the frame clips it to a circle. It animates
  // The element fills the 32x32 circular placeholder; the frame clips it to a circle. It animates
  // regardless of the OS reduced-motion setting, by product direction (round 3).
  return (
    <secure-connection-avatar
      aria-label={label}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  )
}
