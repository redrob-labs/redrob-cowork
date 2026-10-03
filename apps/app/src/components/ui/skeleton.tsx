import { cn } from "@/lib/utils"

/**
 * The design system's Skeleton (`rr-skeleton rr-skeleton--{text|rect|circle}`):
 * the sunken surface with a shimmer, hidden from assistive technology. `rect` by
 * default because the app's call sites size their own blocks; the design
 * system's 120px default height yields to theirs.
 */
function Skeleton({
  className,
  variant = "rect",
  ...props
}: React.ComponentProps<"div"> & { variant?: "text" | "rect" | "circle" }) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rr-skeleton", `rr-skeleton--${variant}`, className)}
      {...props}
    />
  )
}

export { Skeleton }
