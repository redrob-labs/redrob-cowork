"use memo";

import * as React from "react"
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileIcon,
  FolderOpen,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Scissors,
  Split,
  Square,
  Undo2,
  Volume2,
} from "lucide-react"
import {
  DynamicToolUIPart,
  isFileUIPart,
  ToolUIPart,
  type FileUIPart,
  type UIMessage,
} from "ai"
import type { SessionStatus } from "@redrob-labs/sdk/v2/client"
import { openDesktopUrl, revealDesktopItemInDir } from "@/app/lib/desktop"
import { isElectronRuntime } from "@/app/lib/runtime-env"
import { SYNTHETIC_SESSION_ERROR_MESSAGE_PREFIX } from "@/app/types"
import { ApplyPatchTool } from "@/components/tools/apply-patch"
import { BashTool } from "@/components/tools/bash"
import { EditTool } from "@/components/tools/edit"
import { EnvVarRequestTool } from "@/components/tools/env-var-request"
import { ReadFileTool, WriteFileTool } from "@/components/tools/file"
import { GlobTool } from "@/components/tools/glob"
import { GrepTool } from "@/components/tools/grep"
import { LspTool } from "@/components/tools/lsp"
import { RedrobWorkSessionCreateTool } from "@/components/tools/redrob-session-create"
import { QuestionTool } from "@/components/tools/question"
import { SkillTool } from "@/components/tools/skill"
import { TodoWriteTool } from "@/components/tools/todowrite"
import { WebfetchTool } from "@/components/tools/webfetch"
import { WebsearchTool } from "@/components/tools/websearch"
import { useMessageList, useSessionErrorMessage } from "@/components/chat/message-list-provider"
import { ArtifactList } from "@/components/chat/artifact"
import { ArtifactCardList } from "@/components/chat/artifact-card"
import { TaskSuggestions } from "@/components/chat/task-suggestions"
import { RedrobPayNotice } from "@/react-app/domains/billing/redrob-pay-sheet"
import {
  classifyRedrobPaymentRefusal,
  redrobPaymentRefusalFromMessages,
} from "@/react-app/domains/billing/redrob-pay"
import {
  DescriptiveButtonContent,
  DescriptiveButtonDescription,
  DescriptiveButtonIcon,
  DescriptiveButtonTitle,
} from "@/components/descriptive-button"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ImageAttachmentBadge } from "@/components/chat/image-attachment-badge"
import { toast } from "@/components/ui/sonner"
import { useOptionalWorkspace } from "@/react-app/shell/workspace-provider"
import {
  startReadAloud,
  stopReadAloud,
  useReadAloudStore,
  voiceAllowedForPrivacy,
} from "@/react-app/domains/session/voice/read-aloud"
import { useQuery } from "@tanstack/react-query"
import type { RedrobServerClient } from "@/app/lib/redrob-server"
import { Image } from "@/components/ui/image"
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ui/message"
import { Tool } from "@/components/ui/tool"
import { RedrobLiquidLoader } from "@/components/ui/redrob-liquid-loader/RedrobLiquidLoader"
import { useSmoothReveal } from "@/components/chat/use-smooth-reveal"
import { CapabilityCallLine } from "@/components/chat/capability-call-line"
import {
  isLiveStepAtBottom,
  pinnedAfterUserScroll,
  pinnedAfterWheel,
  shouldFollowLiveStepGrowth,
} from "@/components/chat/live-step-scroll"
import { hasPreservedMcpAppResult, McpAppFrame } from "@/components/chat/mcp-app-frame"
import { ReasoningBlock } from "@/components/chat/reasoning-block"
import { SubagentRunLine } from "@/components/chat/subagent-run-line"
import { ToolAggregateGroup } from "@/components/chat/tool-aggregate-group"
import { isWebStepInFlight, UnifiedActivity } from "@/components/chat/unified-activity"
import {
  isApplyPatchToolPart,
  isBashToolPart,
  isEditToolPart,
  isEnvVarRequestToolPart,
  isGlobToolPart,
  isGrepToolPart,
  isLspToolPart,
  isQuestionToolPart,
  isReadToolPart,
  isSkillToolPart,
  isTaskToolPart,
  isTodoWriteToolPart,
  isWebFetchToolPart,
  isWebSearchToolPart,
  isWriteToolPart,
} from "@/lib/build-in-tools"
import type { ThreadStatus } from "@/lib/messages"
import { formatToolCallDuration } from "@/lib/tool-call-duration"
import { t } from "@/i18n"
import { collectLatestAssistantToolParts } from "@/lib/latest-assistant-tool-parts"
import { getActiveToolLabel } from "@/lib/tool-activity"
import { faviconUrlForHref } from "@/lib/favicon"
import { cn } from "@/lib/utils"
import { collapsedCompactionIndexes } from "./compaction-collapse"
import { formatMessageCost, readMessageUsage } from "./message-usage"
import { CHAT_COLUMN } from "./chat-column"
import { hasIncompleteOptionsMarker, parseAnswerOptions } from "./answer-options"
import { groupMessages, isMessageGroup, getLastTextPart, getAggregateOnlyParts, getAssistantRenderGroups, getFileTitle, isWebResearchGroup, liveActivityOf, getMediaBadge, getMessageCompleted, getMessageCreated, formatMessageTimestamp, splitTurnAtAnswer, type UIMessageWithIndex, getMessagesText, getSafeFileDownloadUrl, getSafeFileRevealPath } from "./utils"
import type { AnyToolPart } from "@/lib/tool-aggregate"
import { useInCoworkFrame } from "@/react-app/cowork/shell/cowork-frame"
import { hasCoworkBlocks, parseCoworkBlocks } from "@/react-app/cowork/thread/cowork-blocks"
import { CoworkAnswerFooter, CoworkBlocksView, CoworkMemoryNote, CoworkRunStatus } from "@/react-app/cowork/thread/cowork-thread"
import { memorySavedFrom } from "@/react-app/cowork/thread/thread-logic"
import { withoutTodoToolParts } from "@/react-app/cowork/thread/hide-todo-tools"
import { isInvisibleCoworkText } from "@/react-app/cowork/thread/invisible-blocks"
import { useCoworkThread } from "@/react-app/cowork/thread/cowork-thread-context"
import { useFrameStore } from "@/react-app/cowork/store/frame-store"

const SEARCH_HIGHLIGHT_MARK_CLASS = "rounded px-0.5 bg-warning-soft/70 text-current"

/** Above this many step rows a finished turn folds into one summary line. */
const COLLAPSED_STEP_RUN_MIN_ROWS = 4

function MessageTimestamp({ message, className }: { message: UIMessage; className?: string }) {
  const created = getMessageCreated(message)
  if (created === null) return null

  return (
    <span
      className={cn(
        "select-none whitespace-nowrap text-2xs tabular-nums text-muted-foreground/70",
        className
      )}
      title={new Date(created).toLocaleString()}
    >
      {formatMessageTimestamp(created)}
    </span>
  )
}

interface ToolMessageProps {
  part: ToolUIPart | DynamicToolUIPart
}

/**
 * Error boundary around tool-part rendering. Tool inputs from streamed or
 * interrupted runs can violate their type contracts (partial/undefined
 * input); without this boundary a single bad part unmounts the entire app
 * (white screen). Seen in production on v0.15.3 via a todowrite part with
 * missing input.todos.
 */
class ToolMessage extends React.Component<ToolMessageProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error("[tool-part] render failed", error)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="text-xs text-muted-foreground">{t("message.tool_step_unavailable")}</div>
      )
    }
    return <ToolMessageInner part={this.props.part} />
  }
}

const ToolMessageInner = ({ part }: ToolMessageProps) => {
  if (isBashToolPart(part)) {
    return <BashTool part={part} />
  }

  if (isEditToolPart(part)) {
    return <EditTool part={part} />
  }

  if (isWriteToolPart(part)) {
    return <WriteFileTool part={part} />
  }

  if (isReadToolPart(part)) {
    return <ReadFileTool part={part} />
  }

  if (isGrepToolPart(part)) {
    return <GrepTool part={part} />
  }

  if (isGlobToolPart(part)) {
    return <GlobTool part={part} />
  }

  if (isLspToolPart(part)) {
    return <LspTool part={part} />
  }

  if (isApplyPatchToolPart(part)) {
    return <ApplyPatchTool part={part} />
  }

  if (isSkillToolPart(part)) {
    return <SkillTool part={part} />
  }

  if (isTodoWriteToolPart(part)) {
    return <TodoWriteTool part={part} />
  }

  if (isWebFetchToolPart(part)) {
    return <WebfetchTool part={part} />
  }

  if (isWebSearchToolPart(part)) {
    return <WebsearchTool part={part} />
  }

  if (isQuestionToolPart(part)) {
    return <QuestionTool part={part} />
  }

  if (isEnvVarRequestToolPart(part)) {
    return <EnvVarRequestTool part={part} />
  }

  if (part.type === "dynamic-tool" && part.toolName === "redrob_session_create") {
    return <RedrobWorkSessionCreateTool part={part} />
  }

  if (isTaskToolPart(part)) {
    return <SubagentRunLine part={part} />
  }

  // Failed calls use the same sentence line with the "failures are
  // instructions" treatment.
  if (part.type === "dynamic-tool") {
    return <CapabilityCallLine part={part} />
  }

  return <Tool toolPart={part} />
}

const isEmptyMessage = (message: UIMessage): boolean => message.parts.length === 0

type RetryStatus = Extract<SessionStatus, { type: "retry" }>

/**
 * The `blocked` session status, extracted from the SDK like its sibling above.
 *
 * It was declared structurally while no published package carried the variant. `@redrob-labs/sdk`
 * does, so the duplicate shape and the two casts that went with it are gone -- a hand-written copy of
 * a generated type is a second place for it to drift.
 */
export type BlockedStatus = Extract<SessionStatus, { type: "blocked" }>

function isSessionErrorMessage(message: UIMessage) {
  return message.id.startsWith(SYNTHETIC_SESSION_ERROR_MESSAGE_PREFIX)
}

function retryDelaySeconds(status: RetryStatus) {
  return Math.max(0, Math.round((status.next - Date.now()) / 1000))
}

interface FileMessageProps {
  part: FileUIPart
  tone: "user" | "assistant"
}

function FileMessage({ part, tone }: FileMessageProps) {
  const title = getFileTitle(part)
  const badge = getMediaBadge(part)
  const isImage = part.mediaType.startsWith("image/") && Boolean(part.url)
  const downloadUrl = getSafeFileDownloadUrl(part)
  const revealPath = getSafeFileRevealPath(part)
  const canReveal = isElectronRuntime() && Boolean(revealPath)

  const handleDownload = React.useCallback(() => {
    if (!downloadUrl) return
    const anchor = document.createElement("a")
    anchor.href = downloadUrl
    anchor.download = title
    anchor.rel = "noopener noreferrer"
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  }, [downloadUrl, title])

  const handleReveal = React.useCallback(() => {
    if (!revealPath) return
    void revealDesktopItemInDir(revealPath)
  }, [revealPath])

  if (isImage && tone === "user") {
    return <ImageAttachmentBadge src={part.url} alt={title} />
  }

  if (isImage) {
    return (
      <Image
        src={part.url}
        alt={title}
        loading="lazy"
        decoding="async"
        previewMaxWidth={280}
        previewMaxHeight={160}
        className="rounded-xl border border-border/70"
      />
    )
  }

  return (
    <div className="flex h-auto w-fit min-w-0 max-w-full shrink items-center justify-start gap-2 rounded-xl border border-border/70 bg-background/40 ps-2 pe-2 py-1 text-left text-sm font-medium whitespace-normal">
      <div className="flex min-w-0 items-center gap-2 pe-2">
        <DescriptiveButtonIcon>
          <FileIcon className="size-5 shrink-0" />
        </DescriptiveButtonIcon>
        <DescriptiveButtonContent className="gap-0">
          <DescriptiveButtonTitle className="truncate text-xs">{title}</DescriptiveButtonTitle>
          {badge ? (
            <DescriptiveButtonDescription className="text-2xs">
              {badge}
            </DescriptiveButtonDescription>
          ) : null}
        </DescriptiveButtonContent>
      </div>
      {downloadUrl || canReveal ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`More actions for ${title}`}
              >
                <MoreHorizontal />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-44">
            {downloadUrl ? (
              <DropdownMenuItem onClick={handleDownload}>
                <Download />
                {t("message.download")}
              </DropdownMenuItem>
            ) : null}
            {canReveal ? (
              <DropdownMenuItem onClick={handleReveal}>
                <FolderOpen />
                {t("workspace_list.reveal_finder")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

interface CopyMessageButtonProps {
  messages: UIMessage[]
}

function CopyMessageButton({ messages }: CopyMessageButtonProps) {
  const [copied, setCopied] = React.useState(false)
  const text = React.useMemo(() => getMessagesText(messages), [messages])

  const onCopy = React.useCallback(async () => {
    if (!text) {
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard failures
    }
  }, [text])

  if (!text) {
    return null
  }

  return (
    <MessageAction tooltip={copied ? t("common.copied") : t("common.copy")}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("message.copy")}
        onClick={() => void onCopy()}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </MessageAction>
  )
}

interface ReadAloudButtonProps {
  id: string
  messages: UIMessage[]
}

/**
 * Speak this reply. Shown only where there is a server to ask, since the engine behind it holds the
 * Redrob key; one reply plays at a time, and pressing it again stops it.
 */
function ReadAloudButton({ id, messages }: ReadAloudButtonProps) {
  const workspace = useOptionalWorkspace()
  const client = workspace?.redrobServerClient ?? null
  const workspaceId = workspace?.workspaceId ?? ""
  const text = React.useMemo(() => getMessagesText(messages), [messages])
  /* No server, nothing to speak with. Checked before any query, so a list rendered outside a workspace
     (and outside a query provider) never reaches one. */
  if (!client || !workspaceId || !text) return null
  return <ReadAloudControl id={id} text={text} client={client} workspaceId={workspaceId} />
}

interface ReadAloudControlProps {
  id: string
  text: string
  client: RedrobServerClient
  workspaceId: string
}

function ReadAloudControl({ id, text, client, workspaceId }: ReadAloudControlProps) {
  const active = useReadAloudStore((state) => state.activeId === id)
  const loading = useReadAloudStore((state) => state.activeId === id && state.status === "loading")
  /* Off at High and Strict privacy, where the server refuses speech; hidden until the level is known. */
  const { data: allowed } = useQuery({
    queryKey: ["voice-allowed", workspaceId],
    queryFn: async () => voiceAllowedForPrivacy((await client.getConfig(workspaceId)).redrob),
    staleTime: 30_000,
  })

  if (allowed !== true) return null

  const onClick = () => {
    if (active) {
      stopReadAloud()
      return
    }
    void startReadAloud(client, workspaceId, id, text).then(() => {
      const { error } = useReadAloudStore.getState()
      if (error) toast.error(error)
    })
  }

  const label = active ? t("message.stop_reading") : t("message.read_aloud")
  return (
    <MessageAction tooltip={label}>
      <Button variant="ghost" size="icon" aria-label={label} aria-pressed={active} onClick={onClick}>
        {loading ? <LoaderCircle className="animate-spin" /> : active ? <Square /> : <Volume2 />}
      </Button>
    </MessageAction>
  )
}

type AssistantMessageProps = {
  message: UIMessage
  isLastMessage: boolean
  isStreaming: boolean
  isLastStep: boolean
  /** Set when the turn's collapsed step run shows this reasoning instead. */
  hideReasoning?: boolean
  /**
   * Set while the unified live activity row stands in for this turn's steps: hide reasoning AND
   * every tool/tool-aggregate group so the answer text renders alone and the steps are not drawn
   * twice (once in the row, once here).
   */
  hideSteps?: boolean
}

/**
 * The choices a reply offered, as chips that fill the composer.
 *
 * Filling the composer rather than sending is the same restraint the task suggestions and the env-var
 * card already show: the user still presses send, so a mis-tap costs nothing and the text can be edited
 * first. That matters more here than there, because these choices are written by the model.
 */
function AnswerOptionChips({
  options,
  onPick,
}: {
  options: string[]
  onPick: (prompt: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label={t("answer_options.label")}>
      {options.map((option, index) => (
        <button
          className="rounded-full border border-border/70 bg-background/40 px-3 py-1 text-sm text-foreground transition-colors hover:bg-dls-hover hover:text-foreground"
          key={`option-${index}-${option}`}
          onClick={() => onPick(option)}
          title={t("answer_options.hint")}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  )
}

/**
 * The assistant's answer prose. While the latest message is streaming, the text is revealed
 * letter-by-letter at a smooth constant velocity with an opening burst (see useSmoothReveal),
 * and a steady Redrob-Blue typing cursor rides the end of the reveal via the
 * `data-streaming-cursor` hook on `.markdown-content`. Non-streaming messages render in full
 * with no cursor, exactly as before.
 */
const AssistantAnswerText = React.memo(
  ({ body, isStreaming, highlightQuery }: { body: string; isStreaming: boolean; highlightQuery?: string }) => {
    const { revealed, revealing } = useSmoothReveal(body, isStreaming)
    return (
      <MessageContent
        // Round 32/34 (Claude-style): the assistant reply is plain prose on the page surface
        // -- NO bubble. Override the DS MessageContent base (bg-secondary rounded-lg p-2) here
        // via the cn(base, className) twMerge: bg-transparent, no radius, no inset padding.
        data-surface="ai"
        // Shows the steady brand-blue typing cursor only while the reveal is behind the text.
        data-streaming-cursor={revealing ? "" : undefined}
        className="bg-transparent rounded-none p-0 text-foreground prose w-full min-w-0 flex-1 leading-relaxed"
        markdown
        isStreaming={isStreaming}
        highlightQuery={highlightQuery}
      >
        {revealed}
      </MessageContent>
    )
  },
)
AssistantAnswerText.displayName = "AssistantAnswerText"

const AssistantMessage = React.memo(
  ({ message, isLastMessage, isStreaming, hideReasoning, hideSteps }: AssistantMessageProps) => {
    const { showThinking, highlightQuery, setPrompt, sessionId } = useMessageList()
    // Inside the Cowork frame, Plan's and Cross-check's fenced blocks render as the design system's.
    const inCoworkFrame = useInCoworkFrame()
    // Round 8 (M1): where this message's Plan questions / plan stand, from the raw transcript.
    const coworkQuestions = useCoworkThread()?.questions
    const questionsOpen = coworkQuestions ? !coworkQuestions.answered.has(message.id) : isLastMessage
    const planHeld = coworkQuestions?.heldPlans.has(message.id) ?? false
    const assistantRenderGroups = React.useMemo(
      () => {
        // Per-message grouping stays per-kind here; the unified Cowork activity row is assembled
        // once at the GROUP level (MessageGroup) over the whole run, since a run spans several
        // assistant messages and folding per message would draw one stray row per message.
        // Keys are taken BEFORE filtering, so a group keeps its key (and the answer keeps its
        // reveal state) when the live row starts hiding the steps around it mid-stream.
        const groups = getAssistantRenderGroups(message.parts, showThinking, inCoworkFrame)
          .map((group, index) => ({ group, key: `${group.kind}-${index}` }))
          // A text group that is only an answered questions block, a held plan, or a cross-check
          // block (drawn in the footer) renders nothing; drop it so no empty wrapper keeps the gap.
          .filter(({ group }) => !(inCoworkFrame && group.kind === "text" && isInvisibleCoworkText(group.text, { questionsOpen, planHeld })))
        if (hideSteps) {
          // The live activity row shows reasoning and tool calls; keep text, files and web
          // research, which shows in place as it happens instead of a blank band until the run ends.
          return groups.filter(({ group }) => group.kind === "text" || group.kind === "file" || isWebResearchGroup(group))
        }
        return hideReasoning ? groups.filter(({ group }) => group.kind !== "reasoning") : groups
      },
      [hideReasoning, hideSteps, inCoworkFrame, message.parts, planHeld, questionsOpen, showThinking]
    )

    // A message whose parts all folded into the live row renders nothing, not an empty wrapper.
    if (assistantRenderGroups.length === 0) return null

    return (
      <Message
        className={`${CHAT_COLUMN} flex flex-col items-start gap-2`}
        data-message-id={message.id}
        data-message-role={message.role}
      >
        <div className="group flex w-full flex-col gap-0 space-y-2">
          {assistantRenderGroups.map(({ group, key }) => {
            if (group.kind === "text") {
              /*
                The options marker is taken off the text and rendered as chips instead.
                Parsed here rather than in the sync layer because it is a presentation concern: the stored
                message keeps what the model actually said, so a client that does not render chips still
                shows a readable line, and nothing has to be migrated if the format changes.
                While the marker is still streaming in, the raw text is shown and no chips appear. Chips
                that pop in and then rewrite themselves under a reader's cursor are worse than late ones.
              */
              const groupText = group.text
              const streamingMarker = isStreaming && hasIncompleteOptionsMarker(groupText)
              const parsed = streamingMarker
                ? { body: groupText, options: [] as string[] }
                : parseAnswerOptions(groupText)
              const blocks = inCoworkFrame ? parseCoworkBlocks(parsed.body, { streaming: isStreaming }) : null
              const coworkBlocks = blocks && hasCoworkBlocks(blocks) ? blocks : null
              const body = coworkBlocks ? coworkBlocks.prose : parsed.body
              return (
                <React.Fragment key={key}>
                  {coworkBlocks && !body ? null : (
                    <AssistantAnswerText
                      body={body}
                      isStreaming={isStreaming}
                      highlightQuery={highlightQuery}
                    />
                  )}
                  {coworkBlocks ? <CoworkBlocksView blocks={coworkBlocks} isLatest={isLastMessage} messageId={message.id} /> : null}
                  {parsed.options.length > 0 ? (
                    <AnswerOptionChips options={parsed.options} onPick={setPrompt} />
                  ) : null}
                </React.Fragment>
              )
            }

            if (group.kind === "reasoning") {
              return (
                <ReasoningBlock
                  key={key}
                  text={group.text}
                  isStreaming={group.isStreaming}
                />
              )
            }

            if (group.kind === "file") {
              return (
                <div key={key} className="w-fit max-w-full">
                  <FileMessage part={group.part} tone="assistant" />
                </div>
              )
            }

            if (group.kind === "tool-aggregate") {
              return (
                <div key={key} className="w-full">
                  <ToolAggregateGroup parts={group.parts} />
                </div>
              )
            }

            return (
              <div key={key} className="w-full">
                <ToolMessage part={group.part} />
              </div>
            )
          })}
        </div>
      </Message>
    )
  }
)

AssistantMessage.displayName = "AssistantMessage"

type UserMessageProps = {
  message: UIMessage
  isStreaming: boolean
}

// A skill picked in the composer is sent as "Use the `name` skill."; older chats sent the Load form.
const USER_SKILL_TOKEN_RE = /(Use the `[^`]+` skill\.|Load \[skill [^\]]+\] and follow its instructions\.|\[skill [^\]]+\])/

function UserSkillChip(props: { name: string }) {
  return (
    <span className="mx-0.5 inline-flex items-center rounded-full border border-spectrum-violet/35 bg-spectrum-violet/15 px-2.5 py-1 text-xs font-medium text-foreground align-middle" title={`Skill: ${props.name}`}>
      {props.name}
    </span>
  )
}

function renderPlainTextWithSearchHighlights(text: string, highlightQuery: string | undefined, keyPrefix: string) {
  const needle = highlightQuery?.trim().toLowerCase() ?? ""
  if (needle.length < 2) return text

  const lower = text.toLowerCase()
  if (!lower.includes(needle)) return text

  const nodes: React.ReactNode[] = []
  let cursor = 0
  let matchIndex = lower.indexOf(needle)
  while (matchIndex >= 0) {
    if (matchIndex > cursor) {
      nodes.push(text.slice(cursor, matchIndex))
    }
    const end = matchIndex + needle.length
    nodes.push(
      <mark
        key={`${keyPrefix}:match:${matchIndex}`}
        data-search-highlight="true"
        className={SEARCH_HIGHLIGHT_MARK_CLASS}
      >
        {text.slice(matchIndex, end)}
      </mark>
    )
    cursor = end
    matchIndex = lower.indexOf(needle, cursor)
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return nodes
}

// Bare URL, excluding trailing punctuation that usually ends a sentence.
const PLAIN_URL_RE = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g

/** User bubbles are plain text, so bare https:// URLs need explicit anchors. */
function renderPlainTextWithLinks(text: string, highlightQuery: string | undefined, keyPrefix: string) {
  const nodes: React.ReactNode[] = []
  let cursor = 0
  for (const match of text.matchAll(PLAIN_URL_RE)) {
    const start = match.index
    const url = match[0]
    if (start > cursor) {
      nodes.push(
        <React.Fragment key={`${keyPrefix}:pre:${cursor}`}>
          {renderPlainTextWithSearchHighlights(text.slice(cursor, start), highlightQuery, `${keyPrefix}:pre:${cursor}`)}
        </React.Fragment>
      )
    }
    const favicon = faviconUrlForHref(url)
    nodes.push(
      <a
        key={`${keyPrefix}:url:${start}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary-ink transition-colors hover:underline break-all"
      >
        {favicon ? (
          <img
            src={favicon}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="me-1 inline-block size-3.5 rounded-xs align-[-2px]"
          />
        ) : null}
        {url}
      </a>
    )
    cursor = start + url.length
  }
  if (nodes.length === 0) return renderPlainTextWithSearchHighlights(text, highlightQuery, keyPrefix)
  if (cursor < text.length) {
    nodes.push(
      <React.Fragment key={`${keyPrefix}:post:${cursor}`}>
        {renderPlainTextWithSearchHighlights(text.slice(cursor), highlightQuery, `${keyPrefix}:post:${cursor}`)}
      </React.Fragment>
    )
  }
  return nodes
}

function renderUserTextWithSkillChips(text: string, highlightQuery: string | undefined) {
  if (!USER_SKILL_TOKEN_RE.test(text)) return renderPlainTextWithLinks(text, highlightQuery, "text")
  let offset = 0
  return text.split(USER_SKILL_TOKEN_RE).map((segment) => {
    const key = `${offset}:${segment}`
    offset += segment.length
    const skillMatch = segment.match(/^(?:Load )?\[skill ([^\]]+)\](?: and follow its instructions\.)?$/) ?? segment.match(/^Use the `([^`]+)` skill\.$/)
    if (skillMatch?.[1]) return <UserSkillChip key={key} name={skillMatch[1]} />
    return <React.Fragment key={key}>{renderPlainTextWithLinks(segment, highlightQuery, key)}</React.Fragment>
  })
}

const UserMessage = React.memo(
  ({ message, isStreaming }: UserMessageProps) => {
    const { onRevertToUserMessage, onForkAtMessage, onEditUserMessage, highlightQuery, sessionId } = useMessageList()
    const messageText = React.useMemo(() => getMessagesText([message]), [message])
    // Inside the Cowork frame a prompt worth repeating can become a skill.
    const inCoworkFrame = useInCoworkFrame()
    const openModal = useFrameStore((state) => state.openModal)
    const inlineParts = React.useMemo(
      () => message.parts.filter((part) => (part.type === "text" && Boolean(part.text)) || isFileUIPart(part)),
      [message.parts],
    )
    const hasContent = inlineParts.length > 0

    return (
      <Message
        className={`${CHAT_COLUMN} flex flex-col items-end gap-2`}
        data-message-id={message.id}
        data-message-role={message.role}
      >
        <ContextMenu>
          <ContextMenuTrigger
            // Override Trigger's select-none so user bubbles stay copyable.
            className="!select-text"
            render={
              <div
                className="group flex w-full flex-col items-end gap-1 !select-text"
                style={{ userSelect: "text" }}
              >
                {hasContent ? (
                  <MessageContent
                    // Round 32 (Claude-style): a tighter, subtly darker sent bubble.
                    // --muted is --surface-sunken; mixing a little --border in steps it
                    // one tone darker in BOTH themes (border is darker than muted light,
                    // lighter-but-distinct dark). Tighter inset (px-3 py-2) + leading-snug.
                    className="bg-[color-mix(in_srgb,var(--muted)_88%,var(--border))] text-foreground max-w-[85%] rounded-lg px-3 py-2 leading-snug sm:max-w-[75%] !select-text not-prose"
                    style={{ userSelect: "text" }}
                  >
                    {inlineParts.map((part, index) => {
                      if (part.type === "text") {
                        return (
                          <span key={`text-${index}`} className="whitespace-pre-wrap">
                            {renderUserTextWithSkillChips(part.text, highlightQuery)}
                          </span>
                        )
                      }
                      if (isFileUIPart(part)) {
                        return (
                          <span
                            key={`file-${part.url}-${index}`}
                            className="mx-1 inline-flex align-middle not-prose"
                          >
                            <FileMessage part={part} tone="user" />
                          </span>
                        )
                      }
                      return null
                    })}
                  </MessageContent>
                ) : null}
                {!isStreaming && (
                  <MessageActions
                    className={cn(
                      "flex items-center gap-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 max-lg:opacity-100 pointer-coarse:opacity-100"
                    )}
                  >
                    <MessageTimestamp message={message} className="mr-1.5" />
                    <CopyMessageButton messages={[message]} />
                    {messageText ? (
                      <MessageAction tooltip={t("message.edit")}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("message.edit")}
                          onClick={() => onEditUserMessage(message.id, messageText)}
                        >
                          <Pencil />
                        </Button>
                      </MessageAction>
                    ) : null}
                    {inCoworkFrame && messageText ? (
                      <MessageAction tooltip={t("cowork.skill_save_from_message")}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("cowork.skill_save_from_message")}
                          onClick={() => openModal({ kind: "skill", instructions: messageText })}
                        >
                          <BookmarkPlus />
                        </Button>
                      </MessageAction>
                    ) : null}
                    <MessageAction tooltip={t("message.branch_new_chat")}>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("message.branch_new_chat")}
                        onClick={() => onForkAtMessage(message.id)}
                      >
                        <Split className="rotate-90" />
                      </Button>
                    </MessageAction>
                    <MessageAction tooltip={t("message.revert")}>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("message.revert")}
                        onClick={() => onRevertToUserMessage(message.id)}
                      >
                        <Undo2 />
                      </Button>
                    </MessageAction>
                  </MessageActions>
                )}
              </div>
            }
          />
          <ContextMenuContent className="w-56">
            {messageText ? (
              <ContextMenuItem onClick={() => onEditUserMessage(message.id, messageText)}>
                <Pencil className="size-4" />
                {t("message.edit")}
              </ContextMenuItem>
            ) : null}
            {messageText ? (
              <ContextMenuItem onClick={() => void navigator.clipboard.writeText(messageText)}>
                <Copy className="size-4" />
                Copy
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem onClick={() => onForkAtMessage(message.id)}>
              <Split className="size-4 rotate-90" />
              {t("message.branch_new_chat")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onRevertToUserMessage(message.id)}>
              <Undo2 className="size-4" />
              Revert
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Message>
    )
  }
)

UserMessage.displayName = "UserMessage"

type MessageComponentProps = {
  message: UIMessage
  isLastMessage: boolean
  isStreaming: boolean
  isLastStep: boolean
  hideReasoning?: boolean
  /** Hide reasoning + tool groups because the unified live activity row already shows them. */
  hideSteps?: boolean
}

const MessageComponent = React.memo(
  ({ message, isLastMessage, isStreaming, isLastStep, hideReasoning, hideSteps }: MessageComponentProps) => {
    if (isSessionErrorMessage(message)) {
      return <ErrorMessage error={getMessagesText([message]) || "Session failed"} />
    }

    if (isEmptyMessage(message)) {
      return null
    }

    if (message.role === "assistant") {
      return (
        <AssistantMessage
          message={message}
          isLastMessage={isLastMessage}
          isStreaming={isStreaming}
          isLastStep={isLastStep}
          hideReasoning={hideReasoning}
          hideSteps={hideSteps}
        />
      )
    }

    return (
      <UserMessage
        message={message}
        isStreaming={isStreaming}
      />
    )
  }
)

MessageComponent.displayName = "MessageComponent"

const LoadingMessage = React.memo(({ label }: { label?: string }) => (
  <Message className={`${CHAT_COLUMN} flex flex-col items-start gap-2`}>
    <div className="group flex w-full flex-col gap-0">
      {/*
        The primary "assistant is thinking" moment: the Redrob Liquid Loader (the brand mark
        melting through its three raked bars) replaces the former PaperGrainGradient orb.
        Rendered at the brand's 96px animated-symbol minimum so the mark stays legible; the
        label sits beneath it so the loader reads as the main moment, not a tiny inline speck.
        Small inline tool rows keep the DS three-bar DotMatrixLoader.
      */}
      <div className="flex flex-col items-start gap-1.5 px-1 py-2 text-sm text-muted-foreground">
        <RedrobLiquidLoader size={96} label={label ?? t("session.assistant_thinking")} />
        <span>{label ?? t("session.assistant_thinking")}</span>
      </div>
    </div>
  </Message>
))

LoadingMessage.displayName = "LoadingMessage"

interface ErrorMessageProps {
  error: string | null
}

function ErrorMessage({ error }: ErrorMessageProps) {
  return (
    <Message className="not-prose mx-auto flex w-full max-w-[var(--ow-chat-column)] flex-col items-start gap-2 px-0 md:px-4">
      <div className="group flex w-full flex-col items-start gap-0">
        <div className="text-foreground flex min-w-0 flex-1 flex-row items-start gap-2 rounded-lg border-2 border-destructive-muted bg-destructive-soft/40 px-2 py-1">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />
          <p className="whitespace-pre-wrap text-destructive">{error}</p>
        </div>
      </div>
    </Message>
  )
}

interface RetryMessageProps {
  status: RetryStatus
}

function RetryActionButton(props: { link: string; label: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 border-warning-muted bg-warning-soft/70 text-xs text-warning-ink hover:bg-warning-soft"
      onClick={() => void openDesktopUrl(props.link)}
    >
      {props.label}
    </Button>
  )
}

/**
 * A refusal the user can fix, with the page that fixes it.
 *
 * Deliberately not `RetryMessage`: that one shows a spinner and "Retrying in Ns", which is true while a
 * retry is pending and a lie otherwise. The console's 402s are the case this exists for -- it answers 402
 * rather than 429 so clients STOP, and a key over its monthly cap or a workspace out of credit is fixed
 * by a person, not by waiting.
 *
 * Destructive colouring rather than the retry card's warning tone, because nothing is in flight: the turn
 * ended. The action block is the same shape, so both cards offer one button in one place.
 */
const BlockedMessage = React.memo(({ status }: { status: BlockedStatus }) => {
  const action = status.action

  return (
    <Message className="not-prose mx-auto flex w-full max-w-[var(--ow-chat-column)] flex-col items-start gap-2 px-0 md:px-4">
      <div className="group flex w-full flex-col items-start gap-0">
        <div className="text-foreground flex min-w-0 flex-1 flex-col gap-2 rounded-lg border-2 border-destructive-muted bg-destructive-soft/40 px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />
            <p className="whitespace-pre-wrap text-sm font-medium text-foreground">{status.message}</p>
          </div>
          {action ? (
            <div className="ml-6 space-y-1 border-t border-destructive-muted pt-2">
              <p className="text-xs font-medium text-foreground">{action.title}</p>
              <p className="text-xs text-muted-foreground">{action.message}</p>
              {action.link ? <RetryActionButton link={action.link} label={action.label} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </Message>
  )
})

const RetryMessage = React.memo(({ status }: RetryMessageProps) => {
  const [seconds, setSeconds] = React.useState(() => retryDelaySeconds(status))

  React.useEffect(() => {
    const update = () => setSeconds(retryDelaySeconds(status))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [status])

  const info = seconds > 0
    ? `Retrying in ${seconds}s · attempt ${status.attempt}`
    : `Retrying · attempt ${status.attempt}`
  const action = status.action

  return (
    <Message className="not-prose mx-auto flex w-full max-w-[var(--ow-chat-column)] flex-col items-start gap-2 px-0 md:px-4">
      <div className="group flex w-full flex-col items-start gap-0">
        <div className="text-foreground flex min-w-0 flex-1 flex-col gap-2 rounded-lg border-2 border-warning-muted bg-warning-soft/40 px-3 py-2">
          <div className="flex items-start gap-2">
            <LoaderCircle size={16} className="mt-0.5 shrink-0 animate-spin text-warning-ink" />
            <div className="min-w-0 space-y-1">
              <p className="whitespace-pre-wrap text-sm font-medium text-foreground">{status.message}</p>
              <p className="text-xs text-muted-foreground">{info}</p>
            </div>
          </div>
          {action ? (
            <div className="ml-6 space-y-1 border-t border-warning-muted pt-2">
              <p className="text-xs font-medium text-foreground">{action.title}</p>
              <p className="text-xs text-muted-foreground">{action.message}</p>
              {action.link ? (
                <RetryActionButton link={action.link} label={action.label} />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Message>
  )
})

RetryMessage.displayName = "RetryMessage"

const isMessageEmptyGroup = (messages: UIMessageWithIndex[]) =>
  messages.every(message => isEmptyMessage(message.message));

const getRenderableMessages = (messages: UIMessageWithIndex[]) =>
  messages.flatMap((item) => {
    const renderableMessage = getRenderableMessage(item.message);

    return renderableMessage ? [{ ...item, message: renderableMessage }] : []
  })

function getRenderableMessage(message: UIMessage) {
  const parts = message.parts.filter((part) => part.type === "text" || part.type === "file");

  return parts.length > 0 ? { ...message, parts } : null;
}

/**
 * A finished turn's steps collapse to a single "Worked for 1m 19s" line
 * that expands back into the full run. Only live turns show their steps
 * unprompted; once the answer is in, the reasoning is available but out
 * of the way.
 */
function CompletedStepRun({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex w-full flex-col gap-2">
      <div className={`${CHAT_COLUMN} flex`}>
        <CollapsibleTrigger
          className="group flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-label={open ? `${label}. Hide steps` : `${label}. Show steps`}
        >
          <span>{label}</span>
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-3.5 text-muted-foreground/70 transition-transform duration-150",
              open && "rotate-90"
            )}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out data-starting-style:h-0 data-ending-style:h-0 [&[hidden]:not([hidden='until-found'])]:hidden">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

interface AssistantMessageGroupProps {
  items: UIMessageWithIndex[]
  messages: UIMessage[]
  isStreaming: boolean
}

function collectMcpAppParts(items: UIMessageWithIndex[]): DynamicToolUIPart[] {
  const parts = new Map<string, DynamicToolUIPart>()
  for (const item of items) {
    if (item.message.role !== "assistant" || isSessionErrorMessage(item.message)) continue
    for (const part of item.message.parts) {
      if (
        part.type === "dynamic-tool"
        && (part.state === "output-available" || part.state === "output-error")
        && hasPreservedMcpAppResult(part)
      ) {
        parts.set(part.toolCallId, part)
      }
    }
  }
  return [...parts.values()]
}

function MessageGroup({
  items,
  messages,
  isStreaming,
}: AssistantMessageGroupProps) {
  const { onRevertToUserMessage, onForkAtMessage, onRetryMessage, showThinking } = useMessageList()
  const inCoworkFrame = useInCoworkFrame()
  const lastItem = items[items.length - 1]
  // Branch/revert must target a real server-side message id. Synthetic
  // client-side messages (e.g. session errors) don't exist on the server and
  // silently corrupt fork/revert boundaries.
  const lastRealItem = items.findLast((item) => !isSessionErrorMessage(item.message))
  const isLiveGroup = isStreaming && lastItem !== undefined && lastItem.index === messages.length - 1
  const stepsRef = React.useRef<HTMLDivElement>(null)
  const stepsPinnedRef = React.useRef(true)
  const stepsProgrammaticRef = React.useRef(false)

  const handleStepsScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const atBottom = isLiveStepAtBottom(event.currentTarget)
    if (stepsProgrammaticRef.current && atBottom) return
    stepsProgrammaticRef.current = false
    stepsPinnedRef.current = pinnedAfterUserScroll(atBottom)
  }, [])

  const handleStepsWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const nextPinned = pinnedAfterWheel({
      deltaY: event.deltaY,
      pinned: stepsPinnedRef.current,
      atBottom: isLiveStepAtBottom(event.currentTarget),
    })
    stepsPinnedRef.current = nextPinned
    if (!nextPinned) stepsProgrammaticRef.current = false
  }, [])

  // Follow the latest live step only while the user is still at the tail.
  // Wheel-up unpins immediately so streaming re-renders cannot yank the list
  // back to the bottom while they browse earlier thinking.
  React.useLayoutEffect(() => {
    const node = stepsRef.current
    if (!node) return
    if (!shouldFollowLiveStepGrowth({ isLive: isLiveGroup, pinned: stepsPinnedRef.current })) {
      node.style.overflowAnchor = "auto"
      return
    }
    node.style.overflowAnchor = "none"
    stepsProgrammaticRef.current = true
    node.scrollTop = node.scrollHeight
    window.requestAnimationFrame(() => {
      stepsProgrammaticRef.current = false
    })
  })

  // In the Cowork frame a LIVE run renders as one in-place UnifiedActivity row. Every message in the
  // group is scanned, since a live turn's reasoning and tool calls arrive interleaved with the answer.
  const liveActivity = React.useMemo(
    () =>
      inCoworkFrame && isLiveGroup
        ? liveActivityOf(items.flatMap((item) => (isSessionErrorMessage(item.message) ? [] : [item.message])), showThinking)
        : null,
    [inCoworkFrame, isLiveGroup, items, showThinking],
  )

  if (!lastItem || isMessageEmptyGroup(items)) {
    return null;
  }

  const renderableItems = getRenderableMessages(items)
  const lastTextMessage = getLastTextPart(lastItem.message)
  const mcpAppParts = collectMcpAppParts(items)
  // Inside the Cowork frame: notes the run saved to memory, and a receipt under a finished
  // answer (not under Plan's questions or plan, which wait on the person).
  const memoryNotes = inCoworkFrame
    ? items.flatMap((item) =>
      item.message.role === "assistant"
        ? item.message.parts.flatMap((part) => {
          const text = memorySavedFrom(part)
          return text ? [text] : []
        })
        : []
    )
    : []
  const lastBlocks = inCoworkFrame && lastTextMessage ? parseCoworkBlocks(getMessagesText([lastTextMessage])) : null
  const showCoworkReceipt = Boolean(
    inCoworkFrame && lastTextMessage && lastRealItem && !isStreaming && !lastBlocks?.questions && !lastBlocks?.plan
  )

  // Leading messages without prose (tool/reasoning steps) render inside a
  // height-capped scroll area so long runs stay compact; messages with text
  // or files render inline below it.
  let stepCount = 0
  while (stepCount < items.length && !getRenderableMessage(items[stepCount].message)) {
    stepCount += 1
  }
  let stepItems = items.slice(0, stepCount)
  let proseItems = items.slice(stepCount)
  // OpenCode delivers a whole turn as one assistant message with steps and
  // the answer interleaved in its parts. Split the first prose message so
  // its leading steps fold with the rest instead of pinning the run open.
  const firstProse = proseItems[0]
  if (firstProse && firstProse.message.role === "assistant" && !isSessionErrorMessage(firstProse.message)) {
    const split = splitTurnAtAnswer(firstProse.message)
    if (split) {
      stepItems = [...stepItems, { index: firstProse.index, message: split.steps }]
      proseItems = [{ index: firstProse.index, message: split.answer }, ...proseItems.slice(1)]
    }
  }
  // How long the turn spent working, from the first step to when the answer
  // finished (or started, for older history without a completed timestamp).
  // Server timestamps, so this survives a reload.
  const stepsStartedAt = stepItems.length > 0 ? getMessageCreated(stepItems[0].message) : null
  const stepsEndedAt = getMessageCompleted(lastItem.message) ?? getMessageCreated(lastItem.message)

  // The answer message's own thinking belongs to the work, not the answer, so
  // a collapsed run shows it and the message below renders text only.
  const proseReasoning = proseItems.flatMap((item) =>
    item.message.role === "assistant" && !isSessionErrorMessage(item.message)
      ? getAssistantRenderGroups(item.message.parts, showThinking, inCoworkFrame).flatMap((group, groupIndex) =>
        group.kind === "reasoning"
          ? [{ key: `${item.message.id}-${groupIndex}`, text: group.text, isStreaming: group.isStreaming }]
          : []
      )
      : []
  )
  // An aggregate line counts each call it absorbed: it reads as one row but
  // stands for that much work, and folding should key off the work done.
  const stepRowCount =
    stepItems.reduce(
      (total, item) =>
        total +
        (item.message.role === "assistant" && !isSessionErrorMessage(item.message)
          ? getAssistantRenderGroups(item.message.parts, showThinking, inCoworkFrame).reduce(
            (rows, group) => rows + (group.kind === "tool-aggregate" ? group.parts.length : 1),
            0
          )
          : 1),
      0
    ) + proseReasoning.length
  const stepRunLabel =
    stepsStartedAt !== null && stepsEndedAt !== null && stepsEndedAt > stepsStartedAt
      ? t("session.worked_for", {
          duration: formatToolCallDuration(stepsEndedAt - stepsStartedAt),
        })
      : t("session.step_count", { count: stepRowCount })
  // A short finished run reads fine as a list, so only long ones fold away.
  const collapseSteps =
    !isLiveGroup && stepItems.length > 0 && stepRowCount > COLLAPSED_STEP_RUN_MIN_ROWS
  const foldedReasoning = collapseSteps
    ? proseReasoning.map((reasoning) => (
      <Message
        key={`folded-reasoning-${reasoning.key}`}
        className={`${CHAT_COLUMN} flex flex-col items-start gap-2`}
      >
        <ReasoningBlock text={reasoning.text} isStreaming={reasoning.isStreaming} />
      </Message>
    ))
    : []

  const useUnifiedLiveActivity = liveActivity !== null

  const renderItem = (item: UIMessageWithIndex, groupIndex: number, hideReasoning?: boolean, hideSteps?: boolean) => {
    const isLastMessage = item.index === messages.length - 1

    return (
      // empty:hidden: a message that folded entirely into the live row must not keep the column gap.
      <div key={item.message.id} className="empty:hidden">
        <MessageComponent
          message={item.message}
          isLastMessage={isLastMessage}
          isStreaming={isLastMessage && isStreaming}
          isLastStep={groupIndex === items.length - 1}
          hideReasoning={hideReasoning}
          hideSteps={hideSteps}
        />
      </div>
    )
  }

  // Consecutive step messages that contain nothing but command/edit/read/
  // search tool calls merge into one aggregate line (Paper "Recurring
  // actions"); any prose, reasoning, or other tool breaks the run.
  const renderItems = (slice: UIMessageWithIndex[], offset: number, hideReasoning?: boolean, hideSteps?: boolean) => {
    const nodes: React.ReactNode[] = []
    let run: { parts: AnyToolPart[]; key: string } | null = null
    const flush = () => {
      if (!run) return
      nodes.push(
        <div key={`aggregate-${run.key}`}>
          <Message className={`${CHAT_COLUMN} flex flex-col items-start gap-2`}>
            <ToolAggregateGroup parts={run.parts} className="w-full" />
          </Message>
        </div>
      )
      run = null
    }
    slice.forEach((item, sliceIndex) => {
      // Under hideSteps (live unified row) the tool calls belong to the activity row, so do not
      // aggregate them into a separate line here - just render the message's non-step content.
      const aggregateParts =
        !hideSteps && item.message.role === "assistant" && !isSessionErrorMessage(item.message)
          ? getAggregateOnlyParts(item.message, showThinking, inCoworkFrame)
          : null
      if (aggregateParts) {
        if (!run) run = { parts: [], key: item.message.id }
        run.parts.push(...aggregateParts)
        return
      }
      flush()
      nodes.push(renderItem(item, offset + sliceIndex, hideReasoning, hideSteps))
    })
    flush()
    return nodes
  }

  // The live run row (loader, label, timer) trails the newest content of the turn: questions, plan
  // and run can share one group, and a leading loader would sit above all of them.
  const openingUser = messages[(items[0]?.index ?? 0) - 1]
  const liveRunStartedAt = openingUser?.role === "user" ? (getMessageCreated(openingUser) ?? stepsStartedAt) : stepsStartedAt
  const liveActivityRow = liveActivity ? (
    <div className={CHAT_COLUMN} data-live-activity-row="">
      <UnifiedActivity
        parts={liveActivity.parts}
        reasoning={liveActivity.reasoning}
        /* Stable key for the whole turn so the row (and its timer) never remounts per tool. */
        activityKey={`${items[0]?.message.id ?? "live"}-activity`}
        /* Continuous elapsed from the run's server start (the user message that opened it), so it
           matches the bottom status it replaces and never resets on a remount. */
        startedAt={liveRunStartedAt}
      />
    </div>
  ) : null

  return (
      <div className="flex flex-col gap-2 group/message-group">
      {/* The scroll area keeps the same 8px rhythm the parts inside a single
          message use, so a step row is spaced identically whether or not a
          message boundary happens to fall between it and the previous row. */}
      {/* The step scroll area is skipped while the live row stands in for it; the leading step
          messages still render their web research rows in place, so opening searches show live. */}
      {useUnifiedLiveActivity && stepItems.length > 0 ? renderItems(stepItems, 0, false, true) : null}
      {!useUnifiedLiveActivity && stepItems.length > 0 ? (
        collapseSteps ? (
          <CompletedStepRun label={stepRunLabel}>
            <div data-scrollable="" className="flex max-h-[520px] flex-col gap-2 overflow-y-auto overscroll-y-contain">
              {renderItems(stepItems, 0)}
              {foldedReasoning}
            </div>
          </CompletedStepRun>
        ) : (
          <div
            ref={stepsRef}
            data-scrollable=""
            data-live-steps=""
            onScroll={handleStepsScroll}
            onWheel={handleStepsWheel}
            className="flex max-h-[520px] flex-col gap-2 overflow-y-auto overscroll-y-contain"
          >
            {renderItems(stepItems, 0)}
          </div>
        )
      ) : null}
      {mcpAppParts.map((part) => (
        <Message
          key={`mcp-app-${part.toolCallId}`}
          className="mx-auto flex w-full max-w-[var(--ow-chat-column)] flex-col px-2 empty:hidden md:px-4"
        >
          <McpAppFrame part={part} />
        </Message>
      ))}
      {/* While the unified live row stands in, hide the reasoning/tool rows the prose messages
          would otherwise render (they are already folded into the row above); the answer text
          still renders. hideReasoning=true drops reasoning groups, and the tool/aggregate groups
          are the activity's job now. */}
      {renderItems(proseItems, stepItems.length, collapseSteps, useUnifiedLiveActivity)}
      {/* Items 4 + 8: in the Cowork frame the turn's artifacts show as rounded, clickable cards
          with a "writing" caret while still being written; the bare surface keeps the FILES strip. */}
      {inCoworkFrame ? (
        <ArtifactCardList messages={items.map((item) => item.message)} />
      ) : (
        <ArtifactList
          messages={items.map((item) => item.message)}
          includeTargetFallbacks={false}
        />
      )}
      {memoryNotes.map((text, index) => (
        <div key={`memory-${index}`} className={CHAT_COLUMN}>
          <CoworkMemoryNote text={text} />
        </div>
      ))}
      {liveActivityRow}
      {showCoworkReceipt && lastRealItem ? (
        <div className={CHAT_COLUMN}>
          <CoworkAnswerFooter
            messageId={lastRealItem.message.id}
            model={renderableItems.map((item) => readMessageUsage(item.message)?.routedModel).findLast(Boolean)}
          />
        </div>
      ) : null}
      {/*
        What THIS turn cost, on the turn itself and always visible.

        It was in the hover row beside the timestamp, which meant a figure nobody saw, and a single
        session total under the composer was standing in for it - the wrong number in the wrong place,
        since a running total says nothing about which turn was expensive. Read from the last message of
        the group, which carries the finished turn's usage; a turn that reports none renders nothing
        rather than $0.00, because a zero here would read as free.
      */}
      {lastTextMessage && !isStreaming && (
        <div className={`${CHAT_COLUMN} flex flex-wrap items-center gap-2`}>
          {/*
            The row is always visible; only the ACTIONS fade in on hover.

            Putting the whole row behind hover would have hidden the cost with it, and a cost that appears
            only when the pointer is over the turn is a cost nobody reads - which is why it was on its own
            always-visible line before. This keeps that property and still puts the three facts about one
            turn on one row.
          */}
          <div className="flex flex-wrap items-center gap-2 opacity-0 transition-opacity duration-150 group-hover/message-group:opacity-100 max-lg:opacity-100 pointer-coarse:opacity-100">
          <MessageActions className="flex gap-0">
            <CopyMessageButton messages={renderableItems.map((item) => item.message)} />
            <ReadAloudButton
              id={lastTextMessage.id}
              messages={renderableItems.map((item) => item.message)}
            />
            {lastRealItem ? (
              <>
                <MessageAction tooltip={t("message.retry")}>
                  {/*
                    Retry is edit-and-resend with the text unchanged, because that is the only shape
                    this engine has: `revert` with no partID snaps the boundary back to the preceding
                    user message, and the next prompt hard-deletes from there forward. So there is no
                    way to re-run an assistant turn while keeping the user message as a separate row -
                    the user message is re-sent, and the old answer is replaced rather than appended.
                  */}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("message.retry")}
                    onClick={() => onRetryMessage(lastRealItem.message.id)}
                  >
                    <RotateCcw />
                  </Button>
                </MessageAction>
                <MessageAction tooltip={t("message.branch_new_chat")}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("message.branch_new_chat")}
                    onClick={() => onForkAtMessage(lastRealItem.message.id)}
                  >
                    <Split className="rotate-90" />
                  </Button>
                </MessageAction>
                <MessageAction tooltip={t("message.revert")}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("message.revert")}
                    onClick={() => onRevertToUserMessage(lastRealItem.message.id)}
                  >
                    <Undo2 />
                  </Button>
                </MessageAction>
              </>
            ) : null}
          </MessageActions>
          <MessageTimestamp message={lastItem.message} />
          </div>
          {/*
            The turn's facts belong on THIS row, not a line of their own.

            The cost sat on a separate right-aligned line above the actions, which put three things that
            describe one turn on two rows with a gap between them. `ms-auto` pushes them to the right end
            of the same row, so it reads as "what you can do" on the left and "what it was" on the right.
          */}
          <MessageTurnFacts
            className="ms-auto"
            messages={renderableItems.map((item) => item.message)}
          />
          {/* <MessageSources messages={items.map((item) => item.message)} /> */}
        </div>
      )}
      </div>
  )
}

interface MessageListProps {
  messages: UIMessage[]
  status: ThreadStatus
  retryStatus?: RetryStatus | null
  blockedStatus?: BlockedStatus | null
}

export function shouldShowMessageListLoading(status: ThreadStatus, messageCount: number) {
  return status === "streaming" || (status === "submitted" && messageCount > 0)
}

/**
 * One line where a context summary used to be pasted.
 *
 * Collapsed by default and expandable, not hidden: the summary is what the model is now working from, so
 * a reader who wants to know what it kept has to be able to look. Deleting it would hide a fact about
 * the conversation; leaving it expanded buries the conversation itself.
 */
function CompactionNotice({ messages }: { messages: UIMessage[] }) {
  const [open, setOpen] = React.useState(false)
  const summary = getMessagesText(messages).trim()
  return (
    <div className={`${CHAT_COLUMN}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs text-muted-foreground transition-colors hover:bg-foreground/5"
      >
        <Scissors size={13} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{t("compaction.collapsed")}</span>
        {summary ? (
          <span className="shrink-0 underline decoration-border underline-offset-2">
            {open ? t("compaction.hide") : t("compaction.show")}
          </span>
        ) : null}
      </button>
      {open && summary ? (
        <div className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {summary}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The turn's cost and what served it, or nothing when the engine reported neither.
 *
 * The routed model sits beside the cost because they answer one question together. A session set to
 * `auto` shows `auto` in the picker, so a reader looking at a figure could not tell what produced it or
 * why it cost that: the two facts are only useful next to each other. Both come off the same gateway
 * block, so a turn that has one usually has the other.
 *
 * Read from the newest message that reports each, independently. A turn can report a cost with no routed
 * model, against a provider that is not this gateway, and showing the cost is still right there.
 */
function MessageTurnFacts({ messages, className }: { messages: UIMessage[]; className?: string }) {
  const { cost, routedModel } = React.useMemo(() => {
    let cost: number | undefined
    let routedModel: string | undefined
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const usage = readMessageUsage(messages[index] ?? {})
      if (cost === undefined && usage?.cost !== undefined) cost = usage.cost
      if (routedModel === undefined && usage?.routedModel !== undefined) routedModel = usage.routedModel
      if (cost !== undefined && routedModel !== undefined) break
    }
    return { cost, routedModel }
  }, [messages])
  const text = formatMessageCost(cost)
  if (!text && !routedModel) return null
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/*
        Round 11, item 7: the "Rewrite" (paraphrase) and "Ask again" (compare) buttons were removed
        from under each response. The onAnotherAnswer plumbing stays wired through the tree so it can
        be restored, but no button renders here.
      */}
      {routedModel ? (
        <span
          className="max-w-[50%] truncate font-mono text-2xs text-muted-foreground/80"
          title={t("usage.routed_model")}
        >
          {routedModel}
        </span>
      ) : null}
      {text ? (
        <span
          className="font-mono text-2xs tabular-nums text-muted-foreground/80"
          title={t("usage.turn_cost")}
        >
          {text}
        </span>
      ) : null}
    </div>
  )
}

export function MessageList({ messages: rawMessages, status, retryStatus, blockedStatus }: MessageListProps) {
  const isStreaming = status === "streaming" || status === "retrying"
  const inCoworkFrame = useInCoworkFrame()
  // Round 7 C8: in the Cowork frame the to-do tool calls are not drawn (round 9: the plan's own
  // checklist carries progress; the to-do dock is gone).
  const messages = React.useMemo(
    () => (inCoworkFrame ? withoutTodoToolParts(rawMessages) : rawMessages),
    [inCoworkFrame, rawMessages],
  )
  const showLoading = shouldShowMessageListLoading(status, messages.length)
  const items = React.useMemo(() => groupMessages(messages, status), [messages, status]);
  /*
    Which rows a context compaction owns. The engine's summary arrives as real messages - a marked user
    message and the assistant turn after it - and rendering them as ordinary turns pasted a wall of
    machine-written recap into the conversation. They collapse to one expandable line instead.
  */
  const compacted = React.useMemo(() => collapsedCompactionIndexes(messages), [messages]);
  const error = useSessionErrorMessage();
  const hasSessionErrorMessage = React.useMemo(() => messages.some(isSessionErrorMessage), [messages])
  /**
   * The console refusing to spend credit the workspace does not have. Read from the transcript first
   * so a reload keeps saying it, and from the live error otherwise. Either way the top-up is offered
   * here rather than leaving the user to find the console.
   */
  const paymentRefusal = React.useMemo(
    () => redrobPaymentRefusalFromMessages(messages) ?? classifyRedrobPaymentRefusal(error),
    [messages, error],
  )
  const latestToolParts = React.useMemo(() => (isStreaming ? collectLatestAssistantToolParts(messages) : []), [isStreaming, messages])
  const liveActionLabel = isStreaming ? getActiveToolLabel(latestToolParts) : null
  // Round 9: a web search or page read in flight shows a static globe, not the liquid loader.
  const liveActionWeb = isStreaming && isWebStepInFlight(latestToolParts as AnyToolPart[])

  /*
    The running turn's loader is the inline UnifiedActivity row once the live run has any activity.
    The bottom CoworkRunStatus hides on the SAME test (liveActivityOf over the trailing run of
    assistant messages), so the two loaders never both show or both hide.
  */
  const { showThinking } = useMessageList()
  // When the running turn started: the newest user message's server time, shared by both run timers.
  const runStartedAt = React.useMemo(() => {
    const lastUser = messages.findLast((message) => message.role === "user")
    return lastUser ? getMessageCreated(lastUser) : null
  }, [messages])
  const hasInlineActivity = React.useMemo(() => {
    if (!inCoworkFrame || !isStreaming) return false
    const trailingRun: UIMessage[] = []
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i]
      if (message?.role !== "assistant") break // stop at the user turn that opened this run
      if (!isSessionErrorMessage(message)) trailingRun.push(message)
    }
    return liveActivityOf(trailingRun, showThinking) !== null
  }, [inCoworkFrame, isStreaming, messages, showThinking])

  return (
    <div className={cn("flex flex-col gap-2 @container/message-list")}>
      {/*
        The in-list starter cards are the bare session surface's empty state. In the Cowork
        frame the real home is session-empty-hero ("Let's make something good."), so these
        cards are a second, redundant home -- and because the message list mounts empty for a
        frame when a new chat opens, they FLASH on the way into a session. Gate them out of the
        Cowork frame entirely so only the real home shows; the bare surface keeps them.
      */}
      {messages.length === 0 && !inCoworkFrame && <TaskSuggestions className="mx-auto w-full max-w-[var(--ow-chat-column)] shrink-0 px-3 pb-3 md:px-5 md:pb-5 grow" />}

      {items.map((item) => {
        if (isMessageGroup(item)) {
          // The whole run is the summary, so the group collapses rather than each message in it.
          if (item.messages.length > 0 && item.messages.every((entry) => compacted.has(entry.index))) {
            return (
              <CompactionNotice
                key={item.messages[0]?.message.id ?? "compaction-summary"}
                messages={item.messages.map((entry) => entry.message)}
              />
            )
          }
          return (
            <MessageGroup
              key={item.messages[0]?.message.id ?? "empty-assistant-group"}
              items={item.messages}
              messages={messages}
              isStreaming={isStreaming}
            />
          )
        }

        // The marker itself carries no text a reader wants; the notice below the summary says it happened.
        if (compacted.has(item.index)) return null

        const isLastMessage = item.index === messages.length - 1
        const isLastStep =
          !messages[item.index + 1] || messages[item.index + 1].role !== item.message.role

        return (
          <div key={item.message.id}>
            <MessageComponent
              message={item.message}
              isLastMessage={isLastMessage}
              isStreaming={isLastMessage && isStreaming}
              isLastStep={isLastStep}
            />
            {inCoworkFrame ? (
              <ArtifactCardList messages={[item.message]} />
            ) : (
              <ArtifactList messages={[item.message]} includeTargetFallbacks={false} />
            )}
          </div>
        )
      })}

      {showLoading && !inCoworkFrame && <LoadingMessage label={liveActionLabel ?? undefined} />}
      {showLoading && inCoworkFrame && !hasInlineActivity ? (
        <div className={CHAT_COLUMN}>
          <CoworkRunStatus label={liveActionLabel} web={liveActionWeb} startedAt={runStartedAt} />
        </div>
      ) : null}
      {retryStatus ? <RetryMessage status={retryStatus} /> : null}
      {blockedStatus ? <BlockedMessage status={blockedStatus} /> : null}
      {error && !hasSessionErrorMessage ? <ErrorMessage error={error} /> : null}
      {/*
        Keyed by what the console said, so a later refusal replaces this one instead of leaving the
        first one's detail on screen.
      */}
      {paymentRefusal ? (
        <RedrobPayNotice key={paymentRefusal.detail} refusal={paymentRefusal} />
      ) : null}
    </div>
  )
}
