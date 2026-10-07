import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

/**
 * The design system's control (`rr-control rr-control--{sm|md|lg}`), the element
 * its Input renders inside its field frame. Label, hint and error belong to
 * `Field`; this is the box. `controlSize` rather than `size`, because `size` is
 * the input element's own attribute.
 */
function Input({
  className,
  type,
  controlSize = "md",
  ...props
}: React.ComponentProps<"input"> & { controlSize?: "sm" | "md" | "lg" }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "rr-control",
        `rr-control--${controlSize}`,
        "min-w-0 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input }
