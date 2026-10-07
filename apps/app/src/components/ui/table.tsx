import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The design system's Table (`rr-table`): sunken header row in secondary ink,
 * hairline row rules, the table cell rhythm, a sunken hover row, and
 * `rr-table--num` for right-aligned tabular figures. The design system's framed
 * `rr-table-wrap` is opt-in through `framed`, because most of the app's tables
 * already sit inside a card or a bordered panel.
 */
function Table({
  className,
  framed = false,
  dense = false,
  ...props
}: React.ComponentProps<"table"> & { framed?: boolean; dense?: boolean }) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", framed && "rr-table-wrap")}
    >
      <table
        data-slot="table"
        className={cn("rr-table caption-bottom", dense && "rr-table--dense", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={className} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted font-medium", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("transition-colors has-aria-expanded:bg-muted data-[state=selected]:bg-muted", className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn("text-start align-middle whitespace-nowrap [&:has([role=checkbox])]:pe-0", className)}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("align-middle whitespace-nowrap [&:has([role=checkbox])]:pe-0", className)}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("caption-bottom", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
