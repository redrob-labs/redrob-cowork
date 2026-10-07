import * as React from "react";
import { cn } from "@/lib/utils"

/** The design system's field label (`rr-field__label`): 13/18 semibold, primary ink. */
function Label({ className, htmlFor, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      htmlFor={htmlFor}
      data-slot="label"
      className={cn(
        "rr-field__label flex items-center gap-2 select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
