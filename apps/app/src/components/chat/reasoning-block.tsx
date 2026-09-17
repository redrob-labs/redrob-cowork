"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { MessageContent } from "@/components/ui/message"
import { reasoningDigest } from "@/components/chat/reasoning-digest"
import { cn } from "@/lib/utils"
import { t } from "@/i18n"

type ReasoningBlockProps = {
  text: string
  isStreaming: boolean
  className?: string
}

/**
 * Thinking is collapsed by default — a single "Thinking… / Thought"
 * line with a chevron; the full reasoning renders as markdown only
 * when the user opens it.
 */
export function ReasoningBlock({ text, isStreaming, className }: ReasoningBlockProps) {
  const [open, setOpen] = useState(false)
  /*
   * What the thinking is about, beside the label.
   *
   * The trigger used to read "Thinking…" and nothing else, so the only way to learn whether a run was on
   * the right track was to open it and read a trace written for the model, not for the reader. This puts
   * the model's own latest readable sentence on the line -- derived from the text that already arrived, so
   * it costs nothing and cannot disagree with the trace the way a second summarising call could.
   *
   * null when the trace has no prose in it yet (all code, or still only a few tokens in). The bare label
   * is the honest render for that; describing work we did not read would be worse than saying less.
   */
  const digest = reasoningDigest(text)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("w-full", className)} data-reasoning-block="">
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <span className={cn("shrink-0", isStreaming && "animate-pulse")}>
          {isStreaming ? t("session.assistant_thinking") : t("session.assistant_thought")}
        </span>
        {digest ? (
          // Dimmer than the label and truncating: it is context for the label, and must never push the
          // chevron off the row on a narrow window.
          <span className="min-w-0 flex-1 truncate text-left text-muted-foreground/70" data-reasoning-digest="">
            {digest}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 group-data-panel-open:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out data-starting-style:h-0 data-ending-style:h-0 [&[hidden]:not([hidden='until-found'])]:hidden">
        <MessageContent
          markdown
          isStreaming={isStreaming}
          className="text-muted-foreground prose mt-1 w-full min-w-0 rounded-lg bg-transparent p-0 text-sm"
        >
          {text}
        </MessageContent>
      </CollapsibleContent>
    </Collapsible>
  )
}
