"use client"

import {
  DescriptiveButton,
  DescriptiveButtonContent,
  DescriptiveButtonDescription,
  DescriptiveButtonIcon,
  DescriptiveButtonTitle,
} from "@/components/descriptive-button"
import { useMessageList } from "@/components/chat/message-list-provider"
import { cn } from "@/lib/utils"
import { t } from "@/i18n"
import { BoltIcon, CubeIcon, DocumentChartBarIcon, MagnifyingGlassIcon } from "@heroicons/react/24/solid"

export function resolveOrganizationPromptCardContent(input: {
  prompt: string
  description?: string
  index: number
}) {
  const title = input.description?.trim()
  return {
    title:
      title
      || (input.index >= 0 && input.index < 3
        ? t("task_suggestions.organization_prompt_numbered", { index: input.index + 1 })
        : t("task_suggestions.organization_prompt_fallback")),
    description: input.prompt,
    selectionPrompt: input.prompt,
  }
}

interface TaskSuggestionsProps {
  className?: string
}

export function TaskSuggestions({ className }: TaskSuggestionsProps) {
  const { displaySuggestions, providerConnectedCount, dispatchAction, setPrompt } = useMessageList()

  if (!displaySuggestions) {
    return null
  }

  const noProviders = providerConnectedCount === 0

  return (
    <div className={cn("@container flex flex-col gap-4 pt-1", className)}>
      <p className="text-muted-foreground font-medium select-none">
        {noProviders ? t("task_suggestions.connect_to_start") : t("task_suggestions.try_these")}
      </p>
      <div className="grid min-w-0 gap-2 @lg:grid-cols-2 @2xl:grid-cols-3">
        {noProviders ? (
          <DescriptiveButton
            orientation="vertical"
            className="border-primary-muted/50 bg-primary-soft/30 hover:bg-primary-soft/40 @lg:col-span-2 @2xl:col-span-3"
            onClick={() =>
              dispatchAction({
                target: "settings",
                action: "open",
                section: "providers",
              })
            }
          >
            <DescriptiveButtonIcon>
              <BoltIcon className="size-6 text-primary-ink" aria-hidden />
            </DescriptiveButtonIcon>
            <DescriptiveButtonContent>
              <DescriptiveButtonTitle>{t("task_suggestions.connect_provider_title")}</DescriptiveButtonTitle>
              <DescriptiveButtonDescription>
                {t("task_suggestions.connect_provider_description")}
              </DescriptiveButtonDescription>
            </DescriptiveButtonContent>
          </DescriptiveButton>
        ) : null}

          <DescriptiveButton
            orientation="vertical"
            onClick={() => setPrompt(t("task_suggestions.csv_prompt"))}
          >
            <DescriptiveButtonIcon>
              <DocumentChartBarIcon className="size-6 text-success-ink" aria-hidden />
            </DescriptiveButtonIcon>
            <DescriptiveButtonContent>
              <DescriptiveButtonTitle>{t("task_suggestions.csv_title")}</DescriptiveButtonTitle>
              <DescriptiveButtonDescription>
                {t("task_suggestions.csv_description")}
              </DescriptiveButtonDescription>
            </DescriptiveButtonContent>
          </DescriptiveButton>

          <DescriptiveButton
            orientation="vertical"
            onClick={() => setPrompt(t("task_suggestions.research_prompt"))}
          >
            <DescriptiveButtonIcon>
              <MagnifyingGlassIcon className="size-6 text-primary-ink" aria-hidden />
            </DescriptiveButtonIcon>
            <DescriptiveButtonContent>
              <DescriptiveButtonTitle>{t("task_suggestions.research_title")}</DescriptiveButtonTitle>
              <DescriptiveButtonDescription>
                {t("task_suggestions.research_description")}
              </DescriptiveButtonDescription>
            </DescriptiveButtonContent>
          </DescriptiveButton>

          <DescriptiveButton
            orientation="vertical"
            onClick={() =>
              dispatchAction({
                target: "settings",
                action: "open",
                section: "mcps",
              })
            }
          >
            <DescriptiveButtonIcon>
              <CubeIcon className="size-6 text-warning-ink" aria-hidden />
            </DescriptiveButtonIcon>
            <DescriptiveButtonContent>
              <DescriptiveButtonTitle>{t("task_suggestions.extension_title")}</DescriptiveButtonTitle>
              <DescriptiveButtonDescription>
                {t("task_suggestions.extension_description")}
              </DescriptiveButtonDescription>
            </DescriptiveButtonContent>
          </DescriptiveButton>
      </div>
    </div>
  )
}
