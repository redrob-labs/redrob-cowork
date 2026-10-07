import * as React from "react";
import { cn } from "@/lib/utils"

/**
 * The design system's Textarea control (`rr-control rr-textarea`): 96px tall at
 * rest, resizable vertically, and growing with its content where the browser
 * supports `field-sizing`.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn("rr-control rr-textarea field-sizing-content min-w-0", className)}
      {...props}
    />
  )
}

export { Textarea }
