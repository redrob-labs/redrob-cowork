import type { DynamicToolUIPart, ToolUIPart } from "ai"

import { isToolPartInFlight } from "@/lib/tool-activity"
import { t } from "@/i18n"

type AnyToolPart = ToolUIPart | DynamicToolUIPart

/**
 * Client-side duration tracking. Tool parts carry no timing metadata, so
 * we record when a call is first seen in flight and freeze the elapsed
 * time on completion. Restored history (never seen running) gets no
 * duration rather than a fabricated one.
 */
const startedAtByCallId = new Map<string, number>()
const durationByCallId = new Map<string, number>()

export function trackToolCallDuration(part: AnyToolPart): string | null {
  const callId = part.toolCallId
  const frozen = durationByCallId.get(callId)
  if (frozen !== undefined) return formatToolCallDuration(frozen)

  if (isToolPartInFlight(part)) {
    if (!startedAtByCallId.has(callId)) startedAtByCallId.set(callId, Date.now())
    return null
  }

  const startedAt = startedAtByCallId.get(callId)
  if (startedAt === undefined) return null
  const elapsed = Date.now() - startedAt
  durationByCallId.set(callId, elapsed)
  startedAtByCallId.delete(callId)
  return formatToolCallDuration(elapsed)
}

export function formatToolCallDuration(ms: number): string {
  const seconds = ms / 1000
  if (seconds < 10) {
    return t("duration.seconds", { value: Math.max(0.1, Number(seconds.toFixed(1))) })
  }
  if (seconds < 60) return t("duration.seconds", { value: Math.round(seconds) })
  return t("duration.minutes_seconds", {
    minutes: Math.floor(seconds / 60),
    seconds: Math.round(seconds % 60),
  })
}
