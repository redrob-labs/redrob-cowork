import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The design system's Tabs (`rr-tabs`, `rr-tabs__list`, `rr-tab`): `line`
 * underlines the selected tab in the action colour on a hairline, and the
 * default is the design system's `pill`, a filled pill for the selected tab.
 * Base UI keeps the roving focus, `role="tab"` and `aria-selected`, which is the
 * attribute the design system styles the selection by.
 */
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("rr-tabs group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

// The variant class sits on the list, so the design system's
// `.rr-tabs--line .rr-tab` rules reach the tabs inside it; the line's own
// hairline is drawn here because that rule targets a list inside the variant.
const tabsListVariants = cva(
  "rr-tabs__list group/tabs-list w-fit items-center group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "rr-tabs--pill",
        line: "rr-tabs--line gap-5 border-b border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "rr-tab whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
