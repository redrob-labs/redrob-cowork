"use client"

import { AlertTriangle, Check, MessageCircle } from "lucide-react"
import type { DynamicToolUIPart } from "ai"
import { useNavigate } from "react-router"

import { useMessageList } from "@/components/chat/message-list-provider"
import { Button } from "@/components/ui/button"
import { Tool } from "@/components/ui/tool"
import { workspaceSessionRoute } from "@/react-app/shell/workspace-routes"
import { t } from "@/i18n"

type CreatedSession = {
  sessionId: string
  title: string
  started: boolean
  route: string | null
}

type FailedSession = {
  title: string
  error: string
}

export type RedrobWorkSessionCreateResult = {
  ok: boolean
  workspaceId: string | null
  workspace: string | null
  created: CreatedSession[]
  failures: FailedSession[]
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function parseOutputValue(output: unknown): unknown {
  if (typeof output !== "string") return output
  try {
    return JSON.parse(output)
  } catch {
    return null
  }
}

export function parseRedrobWorkSessionCreateResult(output: unknown): RedrobWorkSessionCreateResult | null {
  const record = objectValue(parseOutputValue(output))
  if (!record || !Array.isArray(record.created) || !Array.isArray(record.failures)) return null

  const created = record.created.flatMap((value): CreatedSession[] => {
    const item = objectValue(value)
    const sessionId = stringValue(item?.sessionId)
    if (!item || !sessionId) return []
    return [{
      sessionId,
      title: stringValue(item.title) ?? sessionId,
      started: item.started === true,
      route: stringValue(item.route),
    }]
  })
  const failures = record.failures.flatMap((value): FailedSession[] => {
    const item = objectValue(value)
    const title = stringValue(item?.title)
    if (!item || !title) return []
    return [{
      title,
      error: stringValue(item.error) ?? t("tools.session_create_failed"),
    }]
  })

  if (created.length === 0 && failures.length === 0) return null
  return {
    ok: record.ok === true,
    workspaceId: stringValue(record.workspaceId),
    workspace: stringValue(record.workspace),
    created,
    failures,
  }
}

function resultHeading(createdCount: number, failureCount: number) {
  if (createdCount === 0) return "Couldn't create new chats"
  const created = createdCount === 1 ? "Created 1 new chat" : `Created ${createdCount} new chats`
  if (failureCount === 0) return created
  return `${created} · ${failureCount} failed`
}

export function RedrobWorkSessionCreateTool({ part }: { part: DynamicToolUIPart }) {
  const navigate = useNavigate()
  const { workspaceId: currentWorkspaceId } = useMessageList()

  if (part.state !== "output-available") {
    return <Tool toolPart={part} title={t("tools.creating_chats")} />
  }

  const result = parseRedrobWorkSessionCreateResult(part.output)
  if (!result) {
    return <Tool toolPart={part} title={t("tools.created_chats")} />
  }

  const allCreated = result.ok && result.created.length > 0 && result.failures.length === 0
  const HeaderIcon = allCreated ? Check : AlertTriangle

  const openSession = (session: CreatedSession) => {
    const resultWorkspaceId = result.workspaceId ?? currentWorkspaceId
    const fallbackRoute = workspaceSessionRoute(resultWorkspaceId, session.sessionId)
    navigate(session.route?.startsWith("/workspace/") ? session.route : fallbackRoute)
  }

  return (
    <div
      className="not-prose w-full max-w-2xl overflow-hidden rounded-2xl border border-dls-border bg-dls-surface/95 shadow-sm"
      data-redrob-session-create-card
      data-created-session-count={result.created.length}
    >
      <div className="flex items-start gap-3 border-b border-dls-border px-4 py-3">
        <div className={allCreated
          ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-success-muted/35 bg-success-soft/30 text-success-ink"
          : "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-warning-muted/35 bg-warning-soft/30 text-warning-ink"
        }>
          <HeaderIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-dls-primary">{resultHeading(result.created.length, result.failures.length)}</h3>
          <p className="mt-0.5 text-xs text-dls-secondary">
            {result.created.length > 0
              ? <>{result.workspace ? `In ${result.workspace}. ` : ""}Open any chat without leaving this result behind.</>
              : t("tools.session_create_review_errors")}
          </p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {result.created.map((session) => (
          <div
            key={session.sessionId}
            className="flex min-w-0 items-center gap-3 px-4 py-3"
            data-created-session-id={session.sessionId}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-dls-hover text-dls-secondary">
              <MessageCircle className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-dls-primary" title={session.title}>{session.title}</p>
              <p className="text-xs text-dls-secondary">{session.started ? "Chat created and started" : "Chat created"}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              aria-label={`Open chat ${session.title}`}
              data-open-created-session={session.sessionId}
              onClick={() => openSession(session)}
            >
              {t("tools.open_chat")}
            </Button>
          </div>
        ))}

        {result.failures.map((failure) => (
          <div key={`${failure.title}:${failure.error}`} className="flex min-w-0 items-start gap-3 px-4 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive-soft/30 text-destructive-ink">
              <AlertTriangle className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-dls-primary" title={failure.title}>{failure.title}</p>
              <p className="text-xs text-destructive-ink">{failure.error}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
