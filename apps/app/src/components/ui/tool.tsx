"use client"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { attributeChatToolError } from "@/components/tools/error-attribution"
import { getToolActivityLabel, isToolPartInFlight } from "@/lib/tool-activity"
import { cn } from "@/lib/utils"
import {
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  ExternalLink,
  FilePen,
  KeyRound,
  ListTodo,
  LoaderCircle,
  MessageCircleQuestion,
  RefreshCcw,
  Search,
  Sparkles,
  SquareCode,
  Wrench,
} from "lucide-react"
import { useCallback, useState } from "react"
import type { DynamicToolUIPart, ToolUIPart } from "ai"

function toolIcon(part: ToolPart) {
  const name = part.type === "dynamic-tool" ? part.toolName : part.type
  switch (name) {
    case "edit":
    case "write":
    case "apply_patch":
      return FilePen
    case "grep":
    case "glob":
      return Search
    case "lsp":
      return SquareCode
    case "skill":
      return Sparkles
    case "todowrite":
      return ListTodo
    case "question":
      return MessageCircleQuestion
    case "request_env_var":
    case "env_var_request":
      return KeyRound
    case "task":
      return Bot
    default:
      return Wrench
  }
}

export type ToolPart = ToolUIPart | DynamicToolUIPart

export type ToolProps = {
  title?: string
  toolPart: ToolPart
  defaultOpen?: boolean
  className?: string
}

const formatValue = (value: unknown): string => {
  if (value === null) return "null"
  if (value === undefined) return "undefined"
  if (typeof value === "string") return value
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

function isDiffText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.includes("@@") || value.includes("+++ ") || value.includes("--- "))
  )
}

/** Tools like apply_patch carry the diff in their input (patchText). */
function getInputDiff(input: unknown): string | null {
  if (isDiffText(input)) {
    return input
  }
  if (typeof input === "object" && input !== null && "patchText" in input) {
    const value = input.patchText
    if (isDiffText(value)) {
      return value
    }
  }
  return null
}

function diffLineClass(line: string) {
  if (line.startsWith("+")) return "text-success-ink bg-success-soft/40"
  if (line.startsWith("-")) return "text-destructive-ink bg-destructive-soft/40"
  if (line.startsWith("@@")) return "text-blue-11 bg-blue-1/30"
  return ""
}

function DiffLines({ diff }: { diff: string }) {
  return (
    <div className="max-h-60 overflow-auto rounded-md font-mono leading-relaxed">
      {diff.split("\n").map((line, index) => (
        <div
          key={`${index}:${line}`}
          className={cn(
            "whitespace-pre-wrap wrap-break-word px-1",
            diffLineClass(line)
          )}
        >
          {line || " "}
        </div>
      ))}
    </div>
  )
}

const Tool = ({
  title,
  toolPart,
  defaultOpen = false,
  className,
}: ToolProps) => {
  const { state, input } = toolPart
  const inFlight = isToolPartInFlight(toolPart)
  const isError = state === "output-error"
  const errorAttribution = isError && toolPart.errorText
    ? attributeChatToolError(toolPart.errorText)
    : null
  const label = title ?? getToolActivityLabel(toolPart)
  const hasInput = input !== null && input !== undefined
  const hasOutput = "output" in toolPart && toolPart.output !== undefined
  const resultText = hasOutput
    ? formatValue(toolPart.output)
    : isError && toolPart.errorText
      ? toolPart.errorText
      : null
  const inputDiff = getInputDiff(input)
  const Icon = toolIcon(toolPart)
  const [copied, setCopied] = useState(false)

  const handleCopyResult = useCallback(async () => {
    if (resultText === null) return
    try {
      await navigator.clipboard.writeText(resultText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be unavailable outside a secure browser context.
    }
  }, [resultText])

  return (
    <Collapsible className={className} defaultOpen={defaultOpen}>
      <div className="flex min-w-0 items-center gap-2" aria-live="polite">
        <CollapsibleTrigger
          className="group text-muted-foreground hover:text-foreground flex min-w-0 flex-1 cursor-pointer items-center justify-start gap-2 overflow-hidden text-start text-sm transition-colors"
        >
          <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
            <span className="transition-opacity group-hover:opacity-0">
              {inFlight ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : isError ? (
                <CircleAlert className="text-destructive size-4" />
              ) : (
                <Icon className="size-3.5" />
              )}
            </span>
            <ChevronDown className="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100 group-data-panel-open:rotate-180" />
          </span>
          <span className="min-w-0 truncate">{label}</span>
          {isError && !errorAttribution ? (
            <span className="text-destructive shrink-0 text-xs">failed</span>
          ) : null}
          {errorAttribution ? (
            <span
              className="shrink-0 rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground transition-colors"
              title={`${errorAttribution.confidence}: ${errorAttribution.description}`}
              aria-label={`Error attribution: ${errorAttribution.label}. ${errorAttribution.confidence}.`}
            >
              {errorAttribution.label}
            </span>
          ) : null}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden text-sm transition-[height] duration-150 ease-out data-starting-style:h-0 data-ending-style:h-0 [&[hidden]:not([hidden='until-found'])]:hidden">
        <div className="bg-muted relative mt-2 flex flex-col gap-2 rounded-lg p-2 pr-10 text-xs">
          {resultText !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute right-2 top-2"
              data-testid="tool-result-copy-action"
              title={copied ? "Copied" : "Copy tool result"}
              aria-label={copied ? "Tool result copied" : "Copy tool result"}
              onClick={() => void handleCopyResult()}
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            </Button>
          ) : null}
          {hasInput ? (
            inputDiff !== null ? (
              <DiffLines diff={inputDiff} />
            ) : (
              <pre className="whitespace-pre-wrap wrap-break-word">
                {formatValue(input)}
              </pre>
            )
          ) : null}
          {hasOutput ? (
            isDiffText(toolPart.output) ? (
              <DiffLines diff={toolPart.output} />
            ) : (
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap wrap-break-word opacity-80">
                {formatValue(toolPart.output)}
              </pre>
            )
          ) : null}
          {isError && toolPart.errorText ? (
            <pre className="text-destructive max-h-60 overflow-auto whitespace-pre-wrap wrap-break-word">
              {toolPart.errorText}
            </pre>
          ) : null}
          {inFlight && !hasInput ? (
            <span className="text-muted-foreground">Waiting for input…</span>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export { Tool }
