import type { DynamicToolUIPart, ToolUIPart } from "ai"
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
import { parseFilename, truncateText } from "@/components/tools/path"
import { t } from "@/i18n"

type AnyToolPart = ToolUIPart | DynamicToolUIPart

export function isToolPartInFlight(part: AnyToolPart): boolean {
  return part.state === "input-streaming" || part.state === "input-available"
}

function hostnameOf(url: string | undefined): string | undefined {
  if (!url) {
    return undefined
  }
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

/**
 * Human-readable "what is this tool doing" label. Safe against partial
 * streamed input (fields may be missing despite the type contract).
 */
export function getToolActivityLabel(part: AnyToolPart): string {
  if (isBashToolPart(part)) {
    const description = part.input?.description?.trim()
    return description ? truncateText(description, 64) : t("activity.running_command")
  }
  if (isReadToolPart(part)) {
    return t("activity.reading_file", { name: parseFilename(part.input?.filePath) })
  }
  if (isEditToolPart(part)) {
    return t("activity.editing_file", { name: parseFilename(part.input?.filePath) })
  }
  if (isWriteToolPart(part)) {
    return t("activity.writing_file", { name: parseFilename(part.input?.filePath) })
  }
  if (isApplyPatchToolPart(part)) {
    return t("activity.applying_changes")
  }
  if (isGrepToolPart(part) || isGlobToolPart(part)) {
    const pattern = part.input?.pattern?.trim()
    return pattern
      ? t("activity.searching_for", { pattern: truncateText(pattern, 44) })
      : t("activity.searching_files")
  }
  if (isLspToolPart(part)) {
    return t("activity.inspecting_file", { name: parseFilename(part.input?.filePath) })
  }
  if (isSkillToolPart(part)) {
    const name = part.input?.name?.trim()
    return name ? t("activity.loading_named_skill", { name }) : t("activity.loading_skill")
  }
  if (isTodoWriteToolPart(part)) {
    return t("activity.updating_plan")
  }
  if (isWebFetchToolPart(part)) {
    const host = hostnameOf(part.input?.url)
    return host ? t("activity.reading_host", { host }) : t("activity.fetching_page")
  }
  if (isWebSearchToolPart(part)) {
    const query = part.input?.query?.trim()
    return query
      ? t("activity.searching_web_for", { query: truncateText(query, 44) })
      : t("activity.searching_web")
  }
  if (isQuestionToolPart(part)) {
    return t("activity.asking_question")
  }
  if (isEnvVarRequestToolPart(part)) {
    const key = part.input?.key?.trim()
    return key ? t("activity.requesting_key", { key }) : t("activity.requesting_env_var")
  }
  if (isTaskToolPart(part)) {
    const description = part.input?.description?.trim()
    return description
      ? t("activity.agent_named", { description: truncateText(description, 56) })
      : t("activity.running_agent")
  }
  if (part.type === "dynamic-tool") {
    return t("activity.running_tool", { name: part.toolName.replace(/[_-]+/g, " ") })
  }
  return t("activity.working")
}

/** Label for the most recent tool still in flight, if any. */
export function getActiveToolLabel(parts: DynamicToolUIPart[]): string | null {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part && isToolPartInFlight(part)) {
      return getToolActivityLabel(part)
    }
  }
  return null
}
