import type { DynamicToolUIPart, ToolUIPart } from "ai"

import {
  isApplyPatchToolPart,
  isBashToolPart,
  isEditToolPart,
  isGlobToolPart,
  isGrepToolPart,
  isReadToolPart,
  isWebFetchToolPart,
  isWebSearchToolPart,
  isWriteToolPart,
} from "@/lib/build-in-tools"
import { getToolActivityLabel, isToolPartInFlight } from "@/lib/tool-activity"
import { t } from "@/i18n"

export type AnyToolPart = ToolUIPart | DynamicToolUIPart

/**
 * Paper "Recurring actions · aggregate + latest": consecutive tool calls
 * of the same families (commands, file edits, reads, searches) collapse
 * into one aggregate line. Prose from the model always breaks a group.
 */
export type ToolFamily = "command" | "edit" | "read" | "search"

/**
 * `foldWeb`: web search and web fetch join the "search" family, so a research run's many calls
 * collapse into one group. Only the Cowork frame folds them (it draws an all-web group as the web
 * research table); the bare surface keeps each call's own row and sources popover.
 */
export function getToolFamily(part: AnyToolPart, foldWeb = false): ToolFamily | null {
  if (isBashToolPart(part)) return "command"
  if (isEditToolPart(part) || isWriteToolPart(part) || isApplyPatchToolPart(part)) return "edit"
  if (isReadToolPart(part)) return "read"
  if (isGrepToolPart(part) || isGlobToolPart(part)) return "search"
  if (foldWeb && (isWebSearchToolPart(part) || isWebFetchToolPart(part))) return "search"
  return null
}

export function isAggregatableToolPart(part: AnyToolPart, foldWeb = false): boolean {
  return getToolFamily(part, foldWeb) !== null
}

/** Which aggregate a call may join; calls in different lanes never share one. */
export type AggregateLane = "web" | "edit" | "work"

/**
 * The aggregate lane of a call, or null when it does not aggregate. In the Cowork frame (`foldWeb`)
 * web research and file edits each keep their own lane, so an all-web run draws the web research
 * table and an all-edit run the file table; the bare surface keeps one lane (develop behaviour).
 */
export function getAggregateLane(part: AnyToolPart, foldWeb = false): AggregateLane | null {
  const family = getToolFamily(part, foldWeb)
  if (!family) return null
  if (!foldWeb) return "work"
  if (isWebSearchToolPart(part) || isWebFetchToolPart(part)) return "web"
  return family === "edit" ? "edit" : "work"
}

/** Whether `part` may join an aggregate whose newest call is `last` (same lane). */
export function continuesAggregate(last: AnyToolPart | undefined, part: AnyToolPart, foldWeb = false): boolean {
  return last !== undefined && getAggregateLane(last, foldWeb) === getAggregateLane(part, foldWeb)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function filePathOf(part: AnyToolPart): string | null {
  if (!isRecord(part.input)) return null
  const value = part.input.filePath
  return typeof value === "string" && value ? value : null
}

/**
 * "Editing 3 files, running 8 commands" / "Edited 3 files, ran 8 commands".
 * File counts are unique paths; searches and commands are call counts.
 */
export function getAggregateSummary(parts: AnyToolPart[], tense: "present" | "past"): string {
  const commands = parts.filter((part) => getToolFamily(part) === "command").length
  const editPaths = new Set<string>()
  let editCalls = 0
  const readPaths = new Set<string>()
  let readCalls = 0
  let searches = 0

  for (const part of parts) {
    // A web call is only ever in an aggregate when it was folded, so count it as a search.
    const family = getToolFamily(part, true)
    if (family === "edit") {
      editCalls += 1
      const path = filePathOf(part)
      if (path) editPaths.add(path)
    } else if (family === "read") {
      readCalls += 1
      const path = filePathOf(part)
      if (path) readPaths.add(path)
    } else if (family === "search") {
      searches += 1
    }
  }

  const pieces: string[] = []
  if (editCalls > 0) {
    const count = editPaths.size > 0 ? editPaths.size : editCalls
    pieces.push(t(tense === "past" ? "aggregate.files_edited" : "aggregate.files_editing", { count }))
  }
  if (commands > 0) {
    pieces.push(t(tense === "past" ? "aggregate.commands_ran" : "aggregate.commands_running", { count: commands }))
  }
  if (readCalls > 0) {
    const count = readPaths.size > 0 ? readPaths.size : readCalls
    pieces.push(t(tense === "past" ? "aggregate.files_read" : "aggregate.files_reading", { count }))
  }
  if (searches > 0) {
    pieces.push(t(tense === "past" ? "aggregate.searches_ran" : "aggregate.searches_running", { count: searches }))
  }

  const joined = pieces.join(", ")
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

export function fileName(path: string): string {
  const segments = path.split(/[/\\]/)
  return segments[segments.length - 1] || path
}

/**
 * File-family rows render as "Edited <name>" with the name clickable
 * (absolute path stays in the tooltip, opens in the artifact view).
 */
export function getAggregateRowFile(part: AnyToolPart): { verb: string; path: string } | null {
  const running = isToolPartInFlight(part)
  const path = filePathOf(part)
  if (!path) return null
  if (isEditToolPart(part)) return { verb: t(running ? "verb.editing" : "verb.edited"), path }
  if (isWriteToolPart(part)) return { verb: t(running ? "verb.writing" : "verb.wrote"), path }
  if (isReadToolPart(part)) return { verb: t(running ? "verb.reading" : "verb.read"), path }
  return null
}

/** Monospace action text for an expanded aggregate row. */
export function getAggregateRowLabel(part: AnyToolPart): string {
  if (isBashToolPart(part)) {
    const command = part.input?.command?.trim()
    if (command) return command.length > 96 ? `${command.slice(0, 95)}…` : command
  }
  return getToolActivityLabel(part)
}

/** Label for the single latest in-flight call — the self-replacing "Now:" line. */
export function getAggregateNowLabel(parts: AnyToolPart[]): string | null {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part && isToolPartInFlight(part)) return getAggregateRowLabel(part)
  }
  return null
}
