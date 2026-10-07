/** @jsxImportSource react */
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@redrob-labs/ui";

import { t } from "../../../i18n";

/** What can take focus inside a dialog, in document order. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

type Focusable = { focus(): void };
type DialogKey = { key: string; shiftKey: boolean; preventDefault(): void; stopPropagation(): void };

/**
 * Keeps Tab inside the dialog. Returns the element focus should wrap to, or null to let the
 * browser move it. Focus that has left the list goes back in at the end Tab was heading for.
 */
export function trapTabTarget<T>(focusables: readonly T[], active: unknown, backwards: boolean): T | null {
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (first === undefined || last === undefined) return null;
  const index = focusables.findIndex((item) => item === active);
  if (index === -1) return backwards ? last : first;
  if (backwards && index === 0) return last;
  if (!backwards && index === focusables.length - 1) return first;
  return null;
}

/** Esc closes; Tab and Shift+Tab cycle within the dialog. */
export function handleDialogKey(
  event: DialogKey,
  context: { focusables: readonly Focusable[]; active: unknown; onClose: () => void },
) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    context.onClose();
    return;
  }
  if (event.key !== "Tab") return;
  const target = trapTabTarget(context.focusables, context.active, event.shiftKey);
  // With nothing focusable, Tab stays put rather than escaping behind the dialog.
  if (target || context.focusables.length === 0) event.preventDefault();
  target?.focus();
}

/**
 * Remembers what had focus when a dialog opened and gives it back when the dialog goes,
 * unless that element has since left the page.
 */
export function rememberFocus(active: unknown): () => void {
  return () => {
    if (!(typeof active === "object" && active !== null && "focus" in active)) return;
    if ("isConnected" in active && active.isConnected === false) return;
    if (typeof active.focus === "function") active.focus();
  };
}

export type DeskDialogProps = {
  open: boolean;
  title: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number | string;
  children?: ReactNode;
};

function focusablesIn(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
}

/**
 * The design system's `Modal`, made a real dialog: drawn over the page from `document.body`,
 * holding focus while it is open, closing on Esc, and handing focus back when it closes.
 * The `role="dialog"` panel inside is what tells the native browser view to hide
 * (`hasNativeBrowserOccluder`), since that view draws above the page.
 *
 * Without a document (a static render) it renders in place.
 */
export function DeskDialog(props: DeskDialogProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!props.open) return;
    const restore = rememberFocus(document.activeElement);
    focusablesIn(rootRef.current)[0]?.focus();
    return restore;
  }, [props.open]);

  if (!props.open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) =>
    handleDialogKey(event, {
      focusables: focusablesIn(rootRef.current),
      active: document.activeElement,
      onClose: props.onClose,
    });

  const dialog = (
    <div className="desk-dialog" ref={rootRef} onKeyDown={onKeyDown}>
      <Modal
        open
        title={props.title}
        footer={props.footer}
        onClose={props.onClose}
        closeLabel={t("desk.dialog_close")}
        width={props.width}
      >
        {props.children}
      </Modal>
    </div>
  );
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
