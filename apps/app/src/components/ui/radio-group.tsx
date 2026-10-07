import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { cn } from "@/lib/utils"

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid w-full gap-3", className)}
      {...props}
    />
  )
}

/**
 * The design system's Radio box and dot (`rr-choice__box rr-choice__box--radio`,
 * `rr-choice__dot`). As with Checkbox, Base UI owns the state as `data-checked`,
 * so the selected fill and focus ring are spelled with the design system's
 * tokens; the dot is only mounted while checked, so it is shown, in the box's
 * on-brand ink.
 */
function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "rr-choice__box rr-choice__box--radio peer relative mt-0 cursor-pointer outline-none after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-checked:border-primary data-checked:bg-primary",
        "data-disabled:cursor-not-allowed data-disabled:border-border data-disabled:bg-muted",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator data-slot="radio-group-indicator" className="rr-choice__dot opacity-100" />
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
