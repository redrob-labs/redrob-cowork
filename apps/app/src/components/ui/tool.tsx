"use client"

import { t } from "@/i18n";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { attributeChatToolError } from "@/components/tools/error-attribution"
import { getToolActivityLabel, isToolPartInFlight } from "@/lib/tool-activity"
import { formatToolResultSummary, readToolResultFacts } from "@/lib/tool-result-summary"
import { cn } from "@/lib/utils"
import {
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  FilePen,
  KeyRound,
  ListTodo,
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
  if (line.startsWith("@@")) return "text-primary-ink bg-primary-soft/30"
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
  const resultSummary = formatToolResultSummary(
    readToolResultFacts(toolPart.callProviderMetadata),
  )
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

  // The design system's AgentAction (`rr-action`): one thing the agent did, as a
  // head that names it and says how it went, over a body with what went in and
  // what came out. Base UI's Collapsible keeps the disclosure; the state reads
  // the design system's running, done and failed tones.
  const actionState = inFlight ? "running" : isError ? "error" : "done"
  return (
    <Collapsible className={cn("rr-action", className)} defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="rr-action__head group min-w-0 cursor-pointer">
        <span className="rr-action__icon shrink-0" aria-hidden="true">
          <Icon className="size-full" />
        </span>
        <span className="rr-action__summary min-w-0 text-foreground">{label}</span>
        <span
          className={cn("rr-action__state shrink-0", `rr-action__state--${actionState}`)}
          aria-live="polite"
        >
          {actionState === "running" ? (
            <>
              <span className="rr-spinner" aria-hidden="true" />
              <span>{t("tool.state_running")}</span>
            </>
          ) : actionState === "error" ? (
            <>
              <CircleAlert className="size-3.5" aria-hidden="true" />
              {errorAttribution ? (
                <span
                  className="rr-badge rr-badge--outline rr-badge--neutral rr-badge--sm font-medium"
                  title={`${errorAttribution.confidence}: ${errorAttribution.description}`}
                  aria-label={`${t("tool.error_attribution")}: ${errorAttribution.label}. ${errorAttribution.confidence}.`}
                >
                  {errorAttribution.label}
                </span>
              ) : (
                <span>{t("tool.state_failed")}</span>
              )}
            </>
          ) : (
            <>
              <Check className="size-3.5" aria-hidden="true" />
              {resultSummary ? (
                <span className="font-normal text-muted-foreground" data-testid="tool-result-summary">
                  {resultSummary}
                </span>
              ) : (
                <span>{t("tool.state_done")}</span>
              )}
            </>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="rr-accordion__chevron size-3.5 shrink-0 group-data-panel-open:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out data-starting-style:h-0 data-ending-style:h-0 [&[hidden]:not([hidden='until-found'])]:hidden">
        <div className="rr-action__body relative flex flex-col gap-2 pe-10">
          {resultText !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute end-2 top-2"
              data-testid="tool-result-copy-action"
              title={copied ? t("common.copied") : t("tool.copy_result")}
              aria-label={copied ? t("common.copied") : t("tool.copy_result")}
              onClick={() => void handleCopyResult()}
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            </Button>
          ) : null}
          {hasInput ? (
            inputDiff !== null ? (
              <DiffLines diff={inputDiff} />
            ) : (
              <pre className="m-0 whitespace-pre-wrap wrap-break-word">
                {formatValue(input)}
              </pre>
            )
          ) : null}
          {hasOutput ? (
            isDiffText(toolPart.output) ? (
              <DiffLines diff={toolPart.output} />
            ) : (
              <pre className="m-0 max-h-60 overflow-auto whitespace-pre-wrap wrap-break-word text-foreground">
                {formatValue(toolPart.output)}
              </pre>
            )
          ) : null}
          {isError && toolPart.errorText ? (
            <pre className="m-0 max-h-60 overflow-auto whitespace-pre-wrap wrap-break-word text-destructive-ink">
              {toolPart.errorText}
            </pre>
          ) : null}
          {inFlight && !hasInput ? (
            <span className="font-sans text-muted-foreground">{t("tool.waiting_for_input")}</span>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export { Tool }
