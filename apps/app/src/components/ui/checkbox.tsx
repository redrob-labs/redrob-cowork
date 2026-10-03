import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "@/lib/utils"
import { CheckIcon, MinusIcon } from "lucide-react"

/**
 * The design system's Checkbox box and mark (`rr-choice__box`, `rr-choice__mark`).
 *
 * Base UI keeps the behaviour, which means the box is the focusable element and
 * its state is a `data-checked` / `data-indeterminate` attribute rather than a
 * native `:checked` the design system's sibling selector reads. So the box takes
 * the design system's classes for its resting look and the checked, focus and
 * disabled states are spelled with the same tokens here (`--primary` is
 * `--action-primary`). The mark is only mounted while checked, so it is shown.
 */
function Checkbox({ className, indeterminate, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      indeterminate={indeterminate}
      className={cn(
        "rr-choice__box peer relative mt-0 cursor-pointer outline-none after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary",
        "data-disabled:cursor-not-allowed data-disabled:border-border data-disabled:bg-muted",
        "aria-invalid:border-destructive group-has-disabled/field:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="contents">
        {indeterminate ? (
          <MinusIcon className="rr-choice__mark opacity-100" />
        ) : (
          <CheckIcon className="rr-choice__mark opacity-100" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
