import { Button as ButtonPrimitive } from "@base-ui/react/button"
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Button, rendered as the Redrob Group Design System 2026's Button and IconButton
 * (`@redrob-labs/ui`): the same element, the same `rr-btn` / `rr-iconbtn` classes
 * and the same children structure, which `tests/ui/button.parity.test.tsx` checks
 * against the package's own components. Base UI keeps the behaviour (focus,
 * `render`, `nativeButton`), so call sites keep their props.
 *
 * The app's variant and size names map onto the design system's:
 *
 *   variant      ->  design system        size                 ->  design system
 *   default          primary              xs / sm                  sm (32px)
 *   outline          secondary            default                  md (40px)
 *   secondary        secondary            lg                       lg (48px)
 *   ghost            ghost                icon-xs / icon-sm        IconButton sm
 *   destructive      danger               icon                     IconButton md
 *   link             ghost, as a link     icon-lg                  IconButton lg
 *
 * One `primary` per view: it names the action the screen is about.
 */
type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"
type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"
type DesignSystemVariant = "primary" | "secondary" | "ghost" | "danger"
type DesignSystemSize = "sm" | "md" | "lg"

const VARIANT: Record<ButtonVariant, DesignSystemVariant> = {
  default: "primary",
  outline: "secondary",
  secondary: "secondary",
  ghost: "ghost",
  destructive: "danger",
  link: "ghost",
}

const SIZE: Record<ButtonSize, DesignSystemSize> = {
  default: "md",
  xs: "sm",
  sm: "sm",
  lg: "lg",
  icon: "md",
  "icon-xs": "sm",
  "icon-sm": "sm",
  "icon-lg": "lg",
}

/**
 * Glyphs inside a button: lucide draws at 24px by default, so an icon without a
 * size of its own takes 16px, and none of them takes the pointer.
 */
const GLYPHS = "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

/** A link reads as text: the ghost button's brand ink, without its box. */
const LINK_CLASSES = "h-auto px-0 underline-offset-4 hover:underline hover:bg-transparent"

type ButtonStyleOptions = {
  variant?: ButtonVariant | null
  size?: ButtonSize | null
  /** `pill` is fully rounded; one prominent action per view. */
  shape?: "rounded" | "pill"
  /** Soft brand halo around the one action a view is about. */
  emphasis?: boolean
  fullWidth?: boolean
  className?: string
}

function isIconSize(size: ButtonSize): boolean {
  return size.startsWith("icon")
}

/** The design system's class list for a button, for elements that only borrow its look. */
function buttonVariants({
  variant,
  size,
  shape,
  emphasis,
  fullWidth,
  className,
}: ButtonStyleOptions = {}): string {
  const appSize = size ?? "default"
  // The design system's IconButton defaults to ghost, because icon buttons sit
  // in dense rows where framed ones read as a wall. An explicit variant wins.
  const appVariant = variant ?? (isIconSize(appSize) ? "ghost" : "default")
  const tone = VARIANT[appVariant]
  const scale = SIZE[appSize]
  if (isIconSize(appSize)) {
    return cn(
      GLYPHS,
      "rr-iconbtn",
      `rr-iconbtn--${tone}`,
      `rr-iconbtn--${scale}`,
      shape === "pill" && "rr-iconbtn--round",
      // The design system draws no danger icon button; the glyph carries it.
      appVariant === "destructive" && "text-destructive",
      className,
    )
  }
  return cn(
    GLYPHS,
    "shrink-0 whitespace-nowrap select-none",
    "rr-btn",
    `rr-btn--${tone}`,
    `rr-btn--${scale}`,
    shape === "pill" && "rr-btn--pill",
    emphasis && "rr-btn--emphasis",
    fullWidth && "rr-btn--block",
    appVariant === "link" && LINK_CLASSES,
    className,
  )
}

type IconMarker = { "data-icon"?: string }

function iconSide(child: React.ReactNode): string | undefined {
  if (!React.isValidElement<IconMarker>(child)) return undefined
  return child.props["data-icon"]
}

/**
 * The design system's children: a leading icon (or a spinner while loading), the
 * label in its own span, then a trailing icon. A child marked
 * `data-icon="inline-start|inline-end"` takes an icon slot; text runs make the label.
 */
function buttonChildren(
  children: React.ReactNode,
  { loading, iconLeft, iconRight }: { loading?: boolean; iconLeft?: React.ReactNode; iconRight?: React.ReactNode },
): React.ReactNode[] {
  const leading: React.ReactNode[] = []
  const trailing: React.ReactNode[] = []
  const label: React.ReactNode[] = []
  for (const child of React.Children.toArray(children)) {
    const side = iconSide(child)
    if (side === "inline-start") leading.push(child)
    else if (side === "inline-end") trailing.push(child)
    else label.push(child)
  }
  const start = iconLeft ?? (leading.length > 0 ? leading : null)
  const end = iconRight ?? (trailing.length > 0 ? trailing : null)
  const textOnly = label.every((child) => typeof child === "string" || typeof child === "number")
  const out: React.ReactNode[] = []
  if (loading) out.push(<span className="rr-spinner" key="spin" />)
  else if (start) out.push(<span className="rr-btn__icon" key="il">{start}</span>)
  // A text label is the design system's plain span. A label that mixes an
  // unmarked glyph with text keeps the span but lays its parts out as the
  // button's own flex items, so the glyph keeps the button's gap.
  if (label.length > 0) {
    out.push(textOnly ? <span key="label">{label}</span> : <span className="contents" key="label">{label}</span>)
  }
  if (end && !loading) out.push(<span className="rr-btn__icon" key="ir">{end}</span>)
  return out
}

type ButtonProps = Omit<ButtonPrimitive.Props, "className"> &
  Omit<ButtonStyleOptions, "className"> & {
    className?: string
    /** Disables the button, swaps the leading icon for a spinner and keeps the label. */
    loading?: boolean
    iconLeft?: React.ReactNode
    iconRight?: React.ReactNode
    /** An icon button's name: its `aria-label` and its `title`, as the design system's IconButton. */
    label?: string
  }

function Button({
  className,
  variant,
  size = "default",
  shape,
  emphasis,
  fullWidth,
  loading,
  iconLeft,
  iconRight,
  label,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const appSize = size ?? "default"
  const iconOnly = isIconSize(appSize)
  return (
    <ButtonPrimitive
      data-slot="button"
      type={type ?? "button"}
      className={buttonVariants({ variant, size, shape, emphasis, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading ? "true" : undefined}
      aria-label={iconOnly && label ? label : props["aria-label"]}
      title={iconOnly && label ? label : props.title}
      {...props}
    >
      {iconOnly ? (
        <span className="rr-btn__icon" style={{ fontSize: SIZE[appSize] === "sm" ? "14px" : "18px" }}>
          {children}
        </span>
      ) : (
        buttonChildren(children, { loading, iconLeft, iconRight })
      )}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
export type { ButtonProps, ButtonSize, ButtonVariant }
