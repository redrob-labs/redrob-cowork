"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Globe } from "lucide-react"

import { isWebFetchToolPart, isWebSearchToolPart } from "@/lib/build-in-tools"
import { isToolPartInFlight } from "@/lib/tool-activity"
import type { AnyToolPart } from "@/lib/tool-aggregate"
import { parseWebSearchResults, type WebSearchResult } from "@/lib/websearch-results"
import { cn } from "@/lib/utils"
import { t } from "@/i18n"
import { openExternal } from "@/react-app/cowork/connectors/cowork-connectors"

/** Expansion state per group / row, kept while the session stays mounted. */
const openGroups = new Map<string, boolean>()
const openRows = new Map<string, boolean>()

/** One web step as the table shows it: what was asked, and what came back. */
export type WebStep = {
  /** The tool call id (stable key). */
  id: string
  /** "search" for a web search, "read" for a page fetch. */
  kind: "search" | "read"
  /** The query, or the page's host for a read. */
  label: string
  /** The page a read opened (a search has none). */
  url?: string
  /** The results a search returned (a read has none). */
  results: WebSearchResult[]
  /** True while the call is still running. */
  running: boolean
  /** True when the call failed. */
  failed: boolean
}

function hostnameOf(url: string | undefined): string {
  if (!url) return ""
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** Pure: the web steps a run's tool parts stand for, in order. Non-web parts are skipped. */
export function webStepsOf(parts: readonly AnyToolPart[]): WebStep[] {
  return parts.flatMap((part): WebStep[] => {
    const running = isToolPartInFlight(part)
    const failed = part.state === "output-error"
    if (isWebSearchToolPart(part)) {
      const output = part.state === "output-available" ? (part.output as unknown) : undefined
      return [{ id: part.toolCallId, kind: "search", label: part.input?.query?.trim() || t("cowork.web_searched"), results: parseWebSearchResults(output), running, failed }]
    }
    if (isWebFetchToolPart(part)) {
      const url = part.input?.url
      return [{ id: part.toolCallId, kind: "read", label: hostnameOf(url) || url || "", ...(url ? { url } : {}), results: [], running, failed }]
    }
    return []
  })
}

/** "3 searches · 24 sources · 2 pages", from the steps. Pure. */
export function webStepsMeta(steps: readonly WebStep[]): string {
  const searches = steps.filter((step) => step.kind === "search").length
  const sources = new Set(steps.flatMap((step) => step.results.map((result) => result.url))).size
  const pages = steps.filter((step) => step.kind === "read").length
  const pieces = [
    searches > 0 ? t("cowork.web_count", { count: searches }) : null,
    sources > 0 ? t("cowork.web_sources", { count: sources }) : null,
    pages > 0 ? t("cowork.web_pages", { count: pages }) : null,
  ]
  return pieces.filter(Boolean).join(" · ")
}

/** A site's favicon, small and decorative. */
function Favicon(props: { url: string }) {
  return (
    <img
      src={`https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(props.url)}`}
      alt=""
      aria-hidden="true"
      className="size-4 shrink-0 rounded-sm"
      loading="lazy"
    />
  )
}

/** A source row: favicon, title, domain; opens the page in the person's browser. */
function SourceRow(props: { result: WebSearchResult }) {
  const host = hostnameOf(props.result.url)
  return (
    <li>
      <button
        type="button"
        onClick={() => openExternal(props.result.url)}
        className="flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-1.5 text-start text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <Favicon url={props.result.url} />
        <span className="min-w-0 flex-1 truncate">{props.result.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground/80">{host}</span>
      </button>
    </li>
  )
}

/** A page-read row: "Read  <favicon> host"; opens the page it read. No loader (round 9). */
function ReadRow(props: { step: WebStep }) {
  const { step } = props
  const verb = step.running ? t("cowork.web_reading") : t("cowork.web_read")
  return (
    <li className="border-t border-border/70 first:border-t-0">
      <button
        type="button"
        disabled={!step.url}
        onClick={() => step.url && openExternal(step.url)}
        className="flex w-full min-w-0 items-center gap-2 px-4 py-3 text-start text-sm transition-colors enabled:hover:bg-muted/40 disabled:cursor-default"
      >
        <span className="shrink-0 text-muted-foreground">{verb}</span>
        {step.url ? <Favicon url={step.url} /> : null}
        <span className={cn("min-w-0 truncate", step.failed ? "text-muted-foreground line-through" : "text-foreground")}>{step.label}</span>
      </button>
    </li>
  )
}

/** One search row: "Searched the web  <query>" and its sources dropdown. No loader (round 9). */
function SearchRow(props: { step: WebStep }) {
  const { step } = props
  const [open, setOpenState] = useState(() => openRows.get(step.id) ?? false)
  const setOpen = (value: boolean) => {
    openRows.set(step.id, value)
    setOpenState(value)
  }
  const canOpen = step.results.length > 0
  const verb = step.running ? t("cowork.web_searching") : t("cowork.web_searched")
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <li className="border-t border-border/70 first:border-t-0">
      <button
        type="button"
        disabled={!canOpen}
        aria-expanded={canOpen ? open : undefined}
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 items-center gap-2 px-4 py-3 text-start text-sm transition-colors enabled:hover:bg-muted/40 disabled:cursor-default"
      >
        <span className="shrink-0 text-muted-foreground">{verb}</span>
        <span className={cn("min-w-0 truncate", step.failed ? "text-muted-foreground line-through" : "text-foreground")}>{step.label}</span>
        {step.results.length > 0 ? (
          <span className="shrink-0 text-xs text-muted-foreground/80">{t("cowork.web_sources", { count: step.results.length })}</span>
        ) : null}
        {canOpen ? <Chevron aria-hidden="true" className="ms-auto size-3.5 shrink-0 text-muted-foreground/70" /> : null}
      </button>
      {open && canOpen ? (
        <ul className="flex flex-col gap-0.5 px-1 pb-2" aria-label={step.label}>
          {step.results.map((result) => (
            <SourceRow key={result.url} result={result} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/**
 * Round 8b: a run's web research as a Claude-style dropdown table. The header ("Searched the web",
 * with "3 searches · 24 sources · 2 pages") folds a bordered table with one row per step: a search
 * (query, source count, opening to its sources) or a page read (favicon, host, opening the page).
 * Round 9: always a static globe, never a loader; the live label above the thread says what is
 * running.
 */
export function WebResearchGroup(props: { parts: AnyToolPart[]; className?: string }) {
  const steps = webStepsOf(props.parts)
  const key = props.parts[0]?.toolCallId ?? "web"
  const [open, setOpenState] = useState(() => openGroups.get(key) ?? false)
  const setOpen = (value: boolean) => {
    openGroups.set(key, value)
    setOpenState(value)
  }
  if (steps.length === 0) return null
  const running = steps.some((step) => step.running)
  const onlyReads = steps.every((step) => step.kind === "read")
  const verb = onlyReads
    ? running ? t("cowork.web_reading") : t("cowork.web_read")
    : running ? t("cowork.web_searching") : t("cowork.web_searched")
  const meta = webStepsMeta(steps)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className={cn("w-full", props.className)} data-web-research="">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="group flex min-w-0 max-w-full items-center gap-2 text-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Globe aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="shrink-0">{verb}</span>
        {meta ? <span className="min-w-0 truncate text-muted-foreground/80">{meta}</span> : null}
        <Chevron aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/70" />
      </button>
      {open ? (
        <ul className="mt-2 overflow-hidden rounded-xl border border-border/70 bg-transparent">
          {steps.map((step) => (step.kind === "read" ? <ReadRow key={step.id} step={step} /> : <SearchRow key={step.id} step={step} />))}
        </ul>
      ) : null}
    </div>
  )
}
