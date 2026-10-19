/** @jsxImportSource react */
import { useEffect, useState } from "react"
import { User } from "lucide-react"

/** Props for the sidebar account avatar. */
export type SecureConnectionAvatarProps = {
  /** Accessible name announced for the avatar. */
  label: string
}

/**
 * The sidebar account avatar: the Secure-Connection "thinking" globe, a self-contained
 * animated web component (no deps/network, own shadow root). It is square and unmasked,
 * so the surrounding `.cowork-account__avatar-placeholder` supplies the 32x32 circular
 * frame and the `var(--surface-sunken)` background (unchanged from before). The globe asset is
 * designed FOR 32px (larger high-contrast grains, particles kept within a 326/768 radius so the
 * circular mask leaves room) - it reads clearly at avatar size and fills the circle edge to edge.
 *
 * The globe artwork is ALWAYS shown AND ALWAYS animated, including under the OS reduced-motion
 * preference. This is a deliberate product exception to the reduced-motion rule: the vendored
 * component's own reduced-motion check is neutralized in its .js (search `redrob-always-animate`)
 * so the particle sweep keeps running regardless.
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
      import("./vendor/secure-connection-avatar-element.js")
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

  // The element fills the 32x32 circular placeholder edge to edge; the frame clips it to a circle.
  // The vendored custom element's shadow :host hard-codes width:128px with aspect-ratio:1, so we
  // override with an explicit 100% width AND height (not just width) - width alone let aspect-ratio
  // keep the old 128px height, which centred a smaller square and left the top/bottom/side gaps.
  // It animates regardless of the OS reduced-motion setting: a deliberate product exception.
  return (
    <secure-connection-avatar
      aria-label={label}
      style={{ width: "100%", height: "100%", display: "block", aspectRatio: "auto" }}
    />
  )
}
