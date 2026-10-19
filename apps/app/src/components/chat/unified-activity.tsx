/** @jsxImportSource react */
import * as React from "react"
import { ChevronRight, Globe } from "lucide-react"

import { RedrobLiquidLoader } from "@/components/ui/redrob-liquid-loader/RedrobLiquidLoader"
import { FileChip } from "@/components/chat/file-chip"
import {
  getAggregateRowFile,
  getAggregateRowLabel,
  getAggregateSummary,
  type AnyToolPart,
} from "@/lib/tool-aggregate"
import { getToolActivityLabel, isToolPartInFlight } from "@/lib/tool-activity"
import { isWebFetchToolPart, isWebSearchToolPart } from "@/lib/build-in-tools"
import { trackToolCallDuration } from "@/lib/tool-call-duration"
import { useWorkingLine } from "@/lib/working-lines"
import { t } from "@/i18n"
import { cn } from "@/lib/utils"

/** Most step rows the expanded table lists; the rest fold into a "+N more" line. */
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
  /**
   * Server timestamp (ms) when the run started, so the elapsed timer counts the WHOLE turn
   * continuously instead of resetting each time a new tool part remounts the row. Falls back to
   * first-mount time when not given.
   */
  startedAt?: number | null
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

/**
 * Round 8 (M2): what the model is thinking about NOW - the newest paragraph of the turn's reasoning,
 * not its first (the first froze the live line on the turn's opening thought). A bold heading line
 * ("**Checking export rules**"), which models use to title each step, wins over the body sentence.
 */
export function latestReasoningLead(reasoning: string): string | null {
  const paragraphs = reasoning.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)
  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const block = paragraphs[index] ?? ""
    const heading = block.match(/^\*\*([^*\n]{3,90})\*\*\s*$/m)?.[1]?.trim()
    if (heading) return heading
    const lead = reasoningLead(block)
    if (lead) return lead
  }
  return null
}

/**
 * The live header text, refreshed as the run moves (round 8 M2): the tool in flight ("Searching
 * the web for ..."), else the newest thought, else the step that just finished, else `fallback` (round 8c: a
 * rotating friendly line), else "Working on it".
 */
export function currentActivityLabel(parts: AnyToolPart[], reasoning: string, fallback?: string): string {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]
    if (part && isToolPartInFlight(part)) return getToolActivityLabel(part)
  }
  const thought = latestReasoningLead(reasoning)
  if (thought) return thought
  const last = parts[parts.length - 1]
  return last ? getToolActivityLabel(last) : (fallback ?? t("cowork.thread_working"))
}

/** Round 9: whether the newest tool still running is a web search or page read. Pure. */
export function isWebStepInFlight(parts: AnyToolPart[]): boolean {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]
    if (part && isToolPartInFlight(part)) return isWebSearchToolPart(part) || isWebFetchToolPart(part)
  }
  return false
}

/** A step row's status dot: in flight, errored, or finished. */
function rowStatus(part: AnyToolPart): "running" | "failed" | "done" {
  if (isToolPartInFlight(part)) return "running"
  if (part.state === "output-error") return "failed"
  return "done"
}

/** mm:ss-ish elapsed: "34s" / "1m 23s", ticking while streaming. Anchored to `startedAt` (the
 * run's server start) when given, so it does NOT reset when the row remounts on a new tool part. */
function useElapsed(active: boolean, startedAt?: number | null): string {
  // A stable anchor: the server start when known, else this component's first mount - captured once.
  const firstMountRef = React.useRef<number>(Date.now())
  const anchor = startedAt ?? firstMountRef.current
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  const total = Math.max(0, Math.floor((now - anchor) / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

/**
 * Round 4: the single in-place activity row for a running turn in the Cowork frame. Instead of a
 * stack of per-tool and per-thinking lines, all of the turn's work folds into one row: the liquid
 * loader + a label that updates in place to the current activity (Claude-style), with an elapsed
 * timer while it runs. Clicking the row expands a steps table (status, action, duration) like the
 * reference, with faint reasoning context at the top. MessageGroup mounts it only while the run is
 * live; once the turn ends the group falls back to the collapsed "Worked for ..." step run, so the
 * non-streaming header branch below is a safe default for any other caller rather than a live path.
 */
export function UnifiedActivity({ parts, reasoning, isStreaming, activityKey, startedAt }: UnifiedActivityProps) {
  const [expanded, setExpandedState] = React.useState(() => expandedByKey.get(activityKey) ?? false)
  const setExpanded = (value: boolean) => {
    expandedByKey.set(activityKey, value)
    setExpandedState(value)
  }
  const elapsed = useElapsed(isStreaming, startedAt)
  const lead = reasoningLead(reasoning)

  // Round 8c: when nothing specific is known yet, a friendly line rotates in its place.
  const working = useWorkingLine(isStreaming)
  const liveLabel = isStreaming ? currentActivityLabel(parts, reasoning, working.text) : null
  const showingWorkingLine = isStreaming && liveLabel === working.text
  const liveWebStep = isStreaming && isWebStepInFlight(parts)

  // Header: live current-activity label while streaming; past-tense summary once done.
  const header = isStreaming
    ? (liveLabel ?? "")
    : parts.length > 0
      ? getAggregateSummary(parts, "past")
      : (lead ?? t("activity.working"))

  const durations = parts.map((part) => trackToolCallDuration(part))
  const visible = expanded ? parts.slice(0, ROW_CAP) : []
  const hidden = parts.length - visible.length

  return (
    <div className="w-full" data-unified-activity={activityKey}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="group flex min-w-0 max-w-full cursor-pointer items-center gap-2 text-start transition-colors"
      >
        {isStreaming && liveWebStep ? (
          /* Round 9: while the run reads or searches the web, a static globe (like the web
             research rows) stands in for the liquid loader. */
          <span className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
            <Globe className="size-4" />
          </span>
        ) : isStreaming ? (
          <RedrobLiquidLoader size={32} label={header} />
        ) : (
          <ChevronRight
            aria-hidden="true"
            className={cn("size-3.5 shrink-0 text-muted-foreground/70 transition-transform", expanded && "rotate-90")}
          />
        )}
        {/* Live label shimmers while streaming; a plain muted summary once done. */}
        {/* Keyed by the friendly line's index, so each new line replays the fade-in. */}
        <span
          key={showingWorkingLine ? `working-${working.index}` : "label"}
          className={cn(
            "min-w-0 truncate text-sm",
            showingWorkingLine && "cowork-working-line",
            isStreaming ? "redrob-shimmer-text" : "text-muted-foreground group-hover:text-foreground",
          )}
        >
          {header}
        </span>
        {isStreaming ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">{elapsed}</span>
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
