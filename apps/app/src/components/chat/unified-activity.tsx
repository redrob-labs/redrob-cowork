/** @jsxImportSource react */
import * as React from "react"
import { ChevronRight } from "lucide-react"

import { RedrobLiquidLoader } from "@/components/ui/redrob-liquid-loader/RedrobLiquidLoader"
import { FileChip } from "@/components/chat/file-chip"
import {
  getAggregateRowFile,
  getAggregateRowLabel,
  getAggregateSummary,
  type AnyToolPart,
} from "@/lib/tool-aggregate"
import { getToolActivityLabel, isToolPartInFlight } from "@/lib/tool-activity"
import { trackToolCallDuration } from "@/lib/tool-call-duration"
import { t } from "@/i18n"
import { cn } from "@/lib/utils"

const ROW_CAP = 10

/** Expansion persists per message while the session stays mounted (matches ToolAggregateGroup). */
const expandedByKey = new Map<string, boolean>()

type UnifiedActivityProps = {
  /** All of the running turn's tool parts, in order. */
  parts: AnyToolPart[]
  /** Accumulated reasoning text for this turn (shown as context, not as rows). */
  reasoning: string
  /** True while the turn is still streaming (drives the live loader + text). */
  isStreaming: boolean
  /** Stable key for persisting the expand state across re-renders. */
  activityKey: string
}

/** The first sentence of the reasoning, trimmed of markdown emphasis, for a short "thinking" line. */
function reasoningLead(reasoning: string): string | null {
  const text = reasoning.replace(/[*_`#>]+/g, "").trim()
  if (!text) return null
  const firstLine = text.split(/\n+/).find((line) => line.trim())?.trim()
  if (!firstLine) return null
  const sentence = firstLine.split(/(?<=[.!?])\s/)[0]?.trim() ?? firstLine
  return sentence.length > 80 ? `${sentence.slice(0, 79)}\u2026` : sentence
}

/** The live header text: the active tool's label, else the latest thinking lead, else "Working on it". */
function currentActivityLabel(parts: AnyToolPart[], reasoning: string): string {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]
    if (part && isToolPartInFlight(part)) return getToolActivityLabel(part)
  }
  return reasoningLead(reasoning) ?? t("cowork.thread_working")
}

function rowStatus(part: AnyToolPart): "running" | "failed" | "done" {
  if (isToolPartInFlight(part)) return "running"
  if (part.state === "output-error") return "failed"
  return "done"
}

/** mm:ss-ish elapsed: "34s" / "1m 23s", ticking while streaming. */
function useElapsed(active: boolean): string {
  const startRef = React.useRef<number>(Date.now())
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  const total = Math.max(0, Math.floor((now - startRef.current) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

/**
 * Round 4: the single in-place activity row for a running turn in the Cowork frame. Instead of a
 * stack of per-tool and per-thinking lines, all of the turn's work folds into one row: the liquid
 * loader + a label that updates in place to the current activity (Claude-style), with an elapsed
 * timer while it runs. Clicking the row expands a steps table (status, action, duration) like the
 * reference, with faint reasoning context at the top. When the turn ends the row stays, collapsed,
 * as the past-tense "what it did" summary (kept per the locked calibration).
 */
export function UnifiedActivity({ parts, reasoning, isStreaming, activityKey }: UnifiedActivityProps) {
  const [expanded, setExpandedState] = React.useState(() => expandedByKey.get(activityKey) ?? false)
  const setExpanded = (value: boolean) => {
    expandedByKey.set(activityKey, value)
    setExpandedState(value)
  }
  const elapsed = useElapsed(isStreaming)
  const lead = reasoningLead(reasoning)

  // Header: live current-activity label while streaming; past-tense summary once done.
  const header = isStreaming
    ? currentActivityLabel(parts, reasoning)
    : parts.length > 0
      ? getAggregateSummary(parts, "past")
      : (lead ?? t("activity.working"))

  const durations = parts.map((part) => trackToolCallDuration(part))
  const visible = expanded ? parts.slice(0, ROW_CAP) : []
  const hidden = parts.length - visible.length
  const failedCount = parts.filter((part) => part.state === "output-error").length

  return (
    <div className="w-full" data-unified-activity={activityKey}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="group flex min-w-0 max-w-full cursor-pointer items-center gap-2 text-start transition-colors"
      >
        {isStreaming ? (
          <RedrobLiquidLoader size={32} label={header} />
        ) : (
          <ChevronRight
            aria-hidden="true"
            className={cn("size-3.5 shrink-0 text-muted-foreground/70 transition-transform", expanded && "rotate-90")}
          />
        )}
        {/* Live label shimmers while streaming; a plain muted summary once done. */}
        <span className={cn("min-w-0 truncate text-sm", isStreaming ? "redrob-shimmer-text" : "text-muted-foreground group-hover:text-foreground")}>
          {header}
        </span>
        {isStreaming ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">{elapsed}</span>
        ) : null}
        {!isStreaming && failedCount > 0 ? (
          <span className="shrink-0 text-xs text-muted-foreground">{failedCount} failed</span>
        ) : null}
      </button>

      {expanded ? (
        <div className="mt-1.5 flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-2 ps-3">
          {lead ? <div className="text-xs italic text-muted-foreground/70">{lead}</div> : null}
          {visible.map((part, index) => {
            const status = rowStatus(part)
            const file = getAggregateRowFile(part)
            return (
              <div key={part.toolCallId} className="flex min-w-0 items-center gap-2 py-0.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    status === "running" ? "bg-primary animate-pulse" : status === "failed" ? "bg-destructive" : "bg-muted-foreground/40",
                  )}
                />
                {file ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0">{file.verb}</span>
                    <FileChip path={file.path} className="min-w-0" />
                  </span>
                ) : (
                  <span className="min-w-0 truncate">{getAggregateRowLabel(part)}</span>
                )}
                {durations[index] ? (
                  <span className="shrink-0 tabular-nums text-muted-foreground/60">{durations[index]}</span>
                ) : null}
              </div>
            )
          })}
          {hidden > 0 ? (
            <div className="text-2xs text-muted-foreground/60">{t("activity.more_count", { count: hidden })}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
