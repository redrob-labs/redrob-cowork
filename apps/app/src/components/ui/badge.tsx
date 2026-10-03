import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The design system's Badge (`rr-badge rr-badge--{subtle|solid|outline}
 * rr-badge--{tone} rr-badge--{sm|md}`): a short piece of state on something
 * else. The app's variant names map onto the design system's style and tone:
 *
 *   default -> solid brand       secondary -> subtle neutral
 *   destructive -> subtle danger outline -> outline neutral
 *   success / warning / info -> subtle in that tone
 *
 * `ghost` and `link` are not the design system's: they keep the badge's shape
 * and size and add no fill.
 */
const badgeVariants = cva(
  "rr-badge group/badge w-fit shrink-0 justify-center overflow-hidden transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "rr-badge--solid rr-badge--brand",
        secondary: "rr-badge--subtle rr-badge--neutral",
        destructive: "rr-badge--subtle rr-badge--danger",
        outline: "rr-badge--outline rr-badge--neutral",
        success: "rr-badge--subtle rr-badge--success",
        warning: "rr-badge--subtle rr-badge--warning",
        info: "rr-badge--subtle rr-badge--info",
        ghost: "text-muted-foreground hover:bg-muted",
        link: "text-primary-ink underline-offset-4 hover:underline",
      },
      size: {
        sm: "rr-badge--sm",
        md: "rr-badge--md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "sm",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
