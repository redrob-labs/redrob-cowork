/**
 * The design system's Menu, as class lists every menu-like popup shares: the
 * dropdown, the context menu, the Select popup and the desktop overlay's native
 * context menu window. One definition, so the four cannot drift.
 *
 * `rr-menu__list` is the design system's panel (border, radius, shadow, padding,
 * 200px minimum) and `rr-menu__item` its row. Base UI positions the popup, so the
 * design system's own absolute offsets are reset, and the panel takes the
 * design system's floating material (`--surface-material`, which falls back to a
 * solid surface under reduced transparency) with a blur behind it, the way the
 * design system describes menus and popovers that sit over content. The menu
 * follows the theme rather than forcing dark: the design system draws one menu.
 */
export const menuSurfaceClassName =
  "rr-menu__list top-auto left-auto z-50 max-h-(--available-height) origin-(--transform-origin) overflow-x-hidden overflow-y-auto bg-material backdrop-blur-xl backdrop-saturate-150 text-popover-foreground outline-none"

/**
 * A row. Base UI marks the keyboard-highlighted row with `data-highlighted`, where
 * the design system relies on `:hover`; both paint the sunken surface.
 */
export const menuItemClassName =
  "rr-menu__item relative cursor-default outline-hidden select-none data-highlighted:bg-accent data-disabled:pointer-events-none data-disabled:text-subtle-foreground data-inset:ps-9 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-muted-foreground"

/** The design system's danger row: its ink, with the icon following it. */
export const menuItemDangerClassName = "rr-menu__item--danger [&_svg]:text-current"

/** A row that carries a check or radio indicator at its end. */
export const menuIndicatorItemClassName = `${menuItemClassName} pe-8`

export const menuIndicatorClassName = "pointer-events-none absolute inset-e-2 flex items-center justify-center text-primary"

export const menuSeparatorClassName = "rr-menu__sep"

export const menuShortcutClassName = "rr-menu__shortcut ms-auto tracking-widest"

export const menuLabelClassName = "px-3 py-2 text-xs text-muted-foreground data-inset:ps-9"
