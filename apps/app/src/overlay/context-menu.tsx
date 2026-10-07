/** @jsxImportSource react */
import * as React from "react";

import {
  menuItemClassName,
  menuItemDangerClassName,
  menuSeparatorClassName,
  menuShortcutClassName,
  menuSurfaceClassName,
} from "../components/ui/menu-surface";
import { cn } from "../lib/utils";

/**
 * The desktop overlay's context menu: the same design-system Menu the in-app
 * menus draw, in a separate transparent window. That window keeps its dark theme
 * on its root (`overlay/index.tsx`), where it reads as the platform's own menu.
 */
function ContextMenuContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="context-menu-content"
      data-open=""
      data-side="bottom"
      className={cn(menuSurfaceClassName, className)}
      {...props}
    />
  );
}

function ContextMenuItem({
  className,
  disabled,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<"button"> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      type="button"
      data-slot="context-menu-item"
      data-inset={inset ? "" : undefined}
      data-variant={variant}
      data-disabled={disabled ? "" : undefined}
      disabled={disabled}
      className={cn(
        menuItemClassName,
        // A plain button, so focus is the keyboard's highlight here.
        "focus:bg-accent",
        variant === "destructive" && menuItemDangerClassName,
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="context-menu-separator"
      role="separator"
      className={cn(menuSeparatorClassName, className)}
      {...props}
    />
  );
}

function ContextMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="context-menu-shortcut" className={cn(menuShortcutClassName, className)} {...props} />;
}

export { ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut };
