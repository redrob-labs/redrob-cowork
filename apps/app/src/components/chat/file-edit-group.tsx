"use client"

import { ChevronDown, ChevronRight, FilePen } from "lucide-react"

import { ArtifactIcon } from "@/components/chat/artifact-icon"
import { artifactPathMatches } from "@/react-app/cowork/panel/live-draft"
import { artifactPathKey, canOpenArtifact, getArtifactType, prettyArtifactTitle, useToolPartArtifacts, writeToolTargetPaths } from "@/lib/artifacts"
import { isWriteToolPart } from "@/lib/build-in-tools"
import { isToolPartInFlight } from "@/lib/tool-activity"
import { getToolFamily, type AnyToolPart } from "@/lib/tool-aggregate"
import { useRememberedOpen } from "@/lib/use-remembered-open"
import { cn } from "@/lib/utils"
import { t } from "@/i18n"
import { useFrameStore } from "@/react-app/cowork/store/frame-store"

/** One file a run touched, as the table shows it. */
export type FileStep = {
  /** The file's path as the first tool call spelled it (display and row key). */
  path: string
  /** "created" when a write made it, "edited" when only edits / patches touched it. */
  kind: "created" | "edited"
  /** True while a call for this file is still running. */
  running: boolean
  /** True when every call for this file failed. */
  failed: boolean
}

/** Pure: whether every part is a file write / edit / patch naming at least one path, so the table can show it. */
export function isFileEditParts(parts: readonly AnyToolPart[]): boolean {
  return parts.length > 0 && parts.every((part) => getToolFamily(part) === "edit" && writeToolTargetPaths(part).length > 0)
}

/**
 * Pure: one step per FILE, in first-touched order. Spellings of one path ("./Reports/Brief.md",
 * "reports\\brief.md") share a row. A file a write touched reads "created" (a write carries the
 * whole body); one only edits or patches touched reads "edited". Running if any of its calls still
 * runs; failed only if all of them failed.
 */
export function fileStepsOf(parts: readonly AnyToolPart[]): FileStep[] {
  const byPath = new Map<string, FileStep & { failures: boolean[] }>()
  for (const part of parts) {
    if (getToolFamily(part) !== "edit") continue
    for (const path of writeToolTargetPaths(part)) {
      const key = artifactPathKey(path)
      const entry = byPath.get(key) ?? { path, kind: "edited", running: false, failed: false, failures: [] }
      if (isWriteToolPart(part)) entry.kind = "created"
      entry.running ||= isToolPartInFlight(part)
      entry.failures.push(part.state === "output-error")
      byPath.set(key, entry)
    }
  }
  return [...byPath.values()].map(({ failures, ...step }) => ({ ...step, failed: failures.every(Boolean) }))
}

/** Pure: the header verb + count, e.g. "Created 1 file" / "Editing 2 files". Any edit makes it "Edited". */
export function fileStepsHeader(steps: readonly FileStep[]): string {
  const count = steps.length
  const running = steps.some((step) => step.running)
  const created = steps.every((step) => step.kind === "created")
  if (created) return t(running ? "cowork.files_group_creating" : "cowork.files_group_created", { count })
  return t(running ? "cowork.files_group_editing" : "cowork.files_group_edited", { count })
}

/** The row verb for one file. */
function rowVerb(step: FileStep): string {
  if (step.kind === "created") return t(step.running ? "cowork.file_row_creating" : "cowork.file_row_created")
  return t(step.running ? "cowork.file_row_editing" : "cowork.file_row_edited")
}

/**
 * A run's file edits as the same dropdown table as web research
 * (WebResearchGroup): a header ("Created 1 file", file glyph, chevron) folding a bordered table
 * with one row per file - "Created  <icon> US China AI Race 2035". A row opens the file on its own
 * in the Artifacts tab, the same way the in-chat artifact card does. A file the panel
 * cannot open yet (still being written, or failed) shows as a plain row.
 */
export function FileEditGroup(props: { parts: AnyToolPart[]; className?: string }) {
  const steps = fileStepsOf(props.parts)
  const [open, setOpen] = useRememberedOpen(`files:${props.parts[0]?.toolCallId ?? ""}`)
  // The artifacts these parts produced, derived the same way the in-chat cards are, so a row opens
  // the very target the panel lists (same id).
  const artifacts = useToolPartArtifacts(props.parts)
  const openArtifact = useFrameStore((state) => state.openArtifact)
  if (steps.length === 0) return null
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className={cn("w-full", props.className)} data-file-edits="">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="group flex min-w-0 max-w-full items-center gap-2 text-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <FilePen aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="shrink-0">{fileStepsHeader(steps)}</span>
        <Chevron aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/70" />
      </button>
      {open ? (
        <ul className="mt-2 overflow-hidden rounded-xl border border-border/70 bg-transparent">
          {steps.map((step) => {
            const artifact = artifacts.find((entry) => artifactPathMatches(entry.path, step.path))
            const canOpen = Boolean(artifact && !step.running && canOpenArtifact(artifact))
            return (
              <li key={step.path} className="border-t border-border/70 first:border-t-0">
                <button
                  type="button"
                  disabled={!canOpen}
                  onClick={() => artifact && openArtifact(artifact.legacy_target.id)}
                  title={step.path}
                  className="flex w-full min-w-0 items-center gap-2 px-4 py-3 text-start text-sm transition-colors enabled:hover:bg-muted/40 disabled:cursor-default"
                >
                  <span className="shrink-0 text-muted-foreground">{rowVerb(step)}</span>
                  <ArtifactIcon className="size-4 shrink-0 text-muted-foreground" type={getArtifactType(step.path)} />
                  <span className={cn("min-w-0 truncate", step.failed ? "text-muted-foreground line-through" : "text-foreground")}>
                    {prettyArtifactTitle(step.path)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
