import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

/**
 * The design system's Switch track and thumb (`rr-switch__track`,
 * `rr-switch__thumb`): 40x24 with a 20px thumb, or 32x20 with 16px at `sm`.
 *
 * Base UI keeps the behaviour, so the track is the focusable `role="switch"`
 * element and its state is `data-checked`; the design system reads a native
 * `:checked` sibling instead, so the on state, the thumb's travel and focus are
 * spelled here with the same tokens and the same 16px / 12px travel.
 */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  const small = size === "sm"
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "rr-switch__track peer inline-block cursor-pointer outline-none after:absolute after:-inset-x-3 after:-inset-y-2",
        small && "h-5 w-8",
        "data-checked:bg-primary",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "aria-invalid:outline-2 aria-invalid:outline-destructive",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "rr-switch__thumb pointer-events-none",
          small && "size-4",
          small
            ? "data-checked:translate-x-3 rtl:data-checked:-translate-x-3"
            : "data-checked:translate-x-4 rtl:data-checked:-translate-x-4"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
