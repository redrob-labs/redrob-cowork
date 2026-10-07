import * as React from "react";

import { computeBounds, getElectronBrowser, hasNativeBrowserOccluder, sameBounds } from "./utils";

type Bounds = { x: number; y: number; width: number; height: number };

/**
 * Lays Electron's native browser page over `contentRef` while `enabled`: shows it at the
 * element's bounds, follows them as they change, hides it under an open dialog, and hides it
 * when disabled or unmounted. Shared by the old panel's `BrowserPanelContent` and the Desk
 * panel's browser.
 */
export function useNativeBrowserBounds(contentRef: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const shownRef = React.useRef(false);
  const boundsFrameRef = React.useRef<number | null>(null);
  const lastBoundsRef = React.useRef<Bounds | null>(null);

  React.useLayoutEffect(() => {
    const browser = getElectronBrowser();
    const content = contentRef.current;
    if (!browser || !content || !enabled) {
      return;
    }

    const bounds = computeBounds(content);
    if (bounds.width < 1 || bounds.height < 1) {
      return;
    }

    browser.setBounds?.(bounds);
    lastBoundsRef.current = bounds;
  });

  React.useLayoutEffect(() => {
    const browser = getElectronBrowser();
    const content = contentRef.current;

    if (!browser || !content || !enabled) {
      browser?.hide?.();
      shownRef.current = false;
      lastBoundsRef.current = null;

      if (boundsFrameRef.current != null) {
        window.cancelAnimationFrame(boundsFrameRef.current);
        boundsFrameRef.current = null;
      }

      return;
    }

    let disposed = false;

    const resetNativeView = async () => {
      await browser.hide?.();

      if (disposed) {
        return;
      }

      shownRef.current = false;
      lastBoundsRef.current = null;
      boundsFrameRef.current = window.requestAnimationFrame(watchBounds);
    };

    const syncBounds = () => {
      const bounds = computeBounds(content);

      if (bounds.width < 1 || bounds.height < 1 || hasNativeBrowserOccluder()) {
        if (shownRef.current) {
          browser.hide?.();
          shownRef.current = false;
          lastBoundsRef.current = null;
        }

        return;
      }

      if (!shownRef.current) {
        browser.show?.(bounds);
        shownRef.current = true;
        lastBoundsRef.current = bounds;
        return;
      }

      if (!sameBounds(lastBoundsRef.current, bounds)) {
        browser.setBounds?.(bounds);
        lastBoundsRef.current = bounds;
      }
    };

    const watchBounds = () => {
      syncBounds();
      boundsFrameRef.current = window.requestAnimationFrame(watchBounds);
    };

    void resetNativeView();

    const observer = new ResizeObserver(syncBounds);

    observer.observe(content);
    window.addEventListener("resize", syncBounds);
    window.addEventListener("scroll", syncBounds, true);

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
      window.removeEventListener("scroll", syncBounds, true);

      if (boundsFrameRef.current != null) {
        window.cancelAnimationFrame(boundsFrameRef.current);
        boundsFrameRef.current = null;
      }

      browser.hide?.();
      shownRef.current = false;
      lastBoundsRef.current = null;
    };
  }, [contentRef, enabled]);
}
