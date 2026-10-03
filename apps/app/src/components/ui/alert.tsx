import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The design system's Alert (`rr-alert rr-alert--{info|success|warning|danger}`,
 * `rr-alert__title`, `rr-alert__text`): a message about the page, in place, on
 * its tone's tinted strip with the tone's edge.
 *
 * The app's variant names map onto the design system's tones - `default` is the
 * design system's `info`, `destructive` its `danger` - and `danger` alone takes
 * `role="alert"`, which interrupts a screen reader; every other tone is
 * `role="status"` and waits its turn. A call site's own `role` still wins.
 *
 * The app's alerts put a bare icon first rather than the design system's icon
 * span, so the grid below lays it out and the tone colours it.
 */
const TONE = {
  default: "info",
  info: "info",
  success: "success",
  warning: "warning",
  destructive: "danger",
} as const

const alertVariants = cva(
  "rr-alert group/alert relative grid w-full gap-1 text-start has-data-[slot=alert-action]:pe-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:mt-px *:[svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "rr-alert--info *:[svg]:text-info-ink",
        info: "rr-alert--info *:[svg]:text-info-ink",
        success: "rr-alert--success *:[svg]:text-success-ink",
        warning: "rr-alert--warning *:[svg]:text-warning-ink",
        destructive: "rr-alert--danger *:[svg]:text-destructive-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  const tone = TONE[variant ?? "default"]
  return (
    <div
      data-slot="alert"
      role={tone === "danger" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "rr-alert__title group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "rr-alert__text text-balance group-has-[>svg]/alert:col-start-2 md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-3 inset-e-3", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
