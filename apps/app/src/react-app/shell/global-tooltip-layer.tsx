/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Global tooltip layer: upgrades every native `title=` control to the design-system tooltip bubble
 * (`rr-tooltip__bubble`), app-wide, without touching the ~99 files that set `title=` or the external
 * `@redrob-labs/ui` IconButton (which renders its `label` as a native `title`). The "Change model"
 * control already used the DS tooltip directly; this makes the rest match it (round 2, item C).
 *
 * How it works: one delegated listener. On pointer/focus over an element that carries a `title`, we
 * stash and REMOVE the attribute (so the browser's own grey tooltip never shows), remember the text,
 * and render the DS bubble positioned over the element. On leave/blur/scroll/press we restore the
 * `title` and hide the bubble. Removing `title` on hover is the standard way to suppress the native
 * tooltip while keeping the attribute for the accessibility tree the rest of the time.
 *
 * Respects reduced-motion via the bubble's own CSS transition. Pointer events pass through (the
 * bubble is `pointer-events: none`). SVG elements expose `title` as a child element, not an
 * attribute, so they are untouched; this only acts on the HTML `title` attribute.
 */

const SHOW_DELAY_MS = 350;

type Shown = {
  text: string;
  rect: { top: number; left: number; width: number; height: number };
};

/** Walk up from the event target to the nearest element that carries a non-empty `title`. */
function titleHost(start: EventTarget | null): HTMLElement | null {
  let node = start instanceof HTMLElement ? start : null;
  while (node) {
    const title = node.getAttribute?.("title");
    if (title && title.trim()) return node;
    node = node.parentElement;
  }
  return null;
}

export function GlobalTooltipLayer() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    // The element whose `title` we have temporarily removed, and the text we took, so we can both
    // render the bubble and put the attribute back when the pointer leaves.
    let host: HTMLElement | null = null;
    let stashed: string | null = null;
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const restore = () => {
      clearTimer();
      if (host && stashed !== null) host.setAttribute("title", stashed);
      host = null;
      stashed = null;
      setShown(null);
    };

    const open = (el: HTMLElement) => {
      const title = el.getAttribute("title");
      if (!title || !title.trim()) return;
      host = el;
      stashed = title;
      // Remove the attribute so the browser's native tooltip never appears while ours is up.
      el.removeAttribute("title");
      const show = () => {
        if (host !== el) return;
        const r = el.getBoundingClientRect();
        setShown({ text: title, rect: { top: r.top, left: r.left, width: r.width, height: r.height } });
      };
      clearTimer();
      timer = window.setTimeout(show, SHOW_DELAY_MS);
    };

    const onOver = (event: PointerEvent) => {
      const el = titleHost(event.target);
      if (!el) return;
      if (el === host) return;
      restore();
      open(el);
    };
    const onOut = (event: PointerEvent) => {
      if (!host) return;
      // Leaving the host (or any child) and not entering the host again -> close.
      const to = event.relatedTarget;
      if (to instanceof Node && host.contains(to)) return;
      restore();
    };
    const onFocusIn = (event: FocusEvent) => {
      const el = titleHost(event.target);
      if (el && el !== host) {
        restore();
        open(el);
      }
    };
    const hideNow = () => restore();

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", hideNow, true);
    // Any scroll, press, or key hides it: the stored rect would otherwise drift.
    document.addEventListener("pointerdown", hideNow, true);
    document.addEventListener("keydown", hideNow, true);
    window.addEventListener("scroll", hideNow, true);
    window.addEventListener("blur", hideNow);

    return () => {
      restore();
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", hideNow, true);
      document.removeEventListener("pointerdown", hideNow, true);
      document.removeEventListener("keydown", hideNow, true);
      window.removeEventListener("scroll", hideNow, true);
      window.removeEventListener("blur", hideNow);
    };
  }, []);

  if (!shown) return null;

  // Centered above the host, clamped to the viewport. The bubble carries the DS class so it inherits
  // the Redrob-Black / white-ink styling (inverted on dark) from the design-system CSS.
  const centerX = shown.rect.left + shown.rect.width / 2;
  const top = shown.rect.top;
  return createPortal(
    <div
      className="rr-tooltip__bubble rr-tooltip--open"
      role="tooltip"
      style={{
        position: "fixed",
        top: Math.max(8, top - 8),
        left: Math.min(Math.max(8, centerX), window.innerWidth - 8),
        transform: "translate(-50%, -100%)",
        zIndex: 2147483000,
        opacity: 1,
        pointerEvents: "none",
        maxWidth: "min(20rem, calc(100vw - 16px))",
        whiteSpace: "normal",
      }}
    >
      {shown.text}
    </div>,
    document.body,
  );
}
