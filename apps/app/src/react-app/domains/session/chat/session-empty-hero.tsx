/** @jsxImportSource react */
import { useState } from "react";
import { Zap } from "lucide-react";

import type { ComposerAttachment } from "@/app/types";
import { t } from "@/i18n";
import { NewTaskComposer, type NewTaskComposerContext } from "./new-task-composer";

/**
 * The starter card's prompt is sent to the model verbatim, so it is
 * translated with the card: a Korean user should not have their first task
 * silently written in English on their behalf.
 */
const SUGGESTIONS = [
  {
    id: "week",
    titleKey: "hero.suggestion_week_title",
    descriptionKey: "hero.suggestion_week_description",
    promptKey: "hero.suggestion_week_prompt",
  },
  {
    id: "spreadsheet",
    titleKey: "hero.suggestion_spreadsheet_title",
    descriptionKey: "hero.suggestion_spreadsheet_description",
    promptKey: "hero.suggestion_spreadsheet_prompt",
  },
  {
    id: "document",
    titleKey: "hero.suggestion_document_title",
    descriptionKey: "hero.suggestion_document_description",
    promptKey: "hero.suggestion_document_prompt",
  },
  {
    id: "web_task",
    titleKey: "hero.suggestion_web_task_title",
    descriptionKey: "hero.suggestion_web_task_description",
    promptKey: "hero.suggestion_web_task_prompt",
  },
] as const;

export type SessionEmptyHeroProps = {
  providerCount: number;
  /** Disable submission while a default workspace is being prepared. */
  busy?: boolean;
  /** Called with the task prompt and attachments; the caller creates the session (and workspace if needed). */
  onRunTask: (prompt: string, attachments: ComposerAttachment[]) => void;
  onOpenProviderAuth?: () => void;
  /** Workspace-scoped wiring for the full composer (skills, agents, models). */
  composer?: NewTaskComposerContext | null;
};

/**
 * Paper "first chat" empty state: the real session composer front and
 * center with built-in suggestion cards below.
 */
export function SessionEmptyHero(props: SessionEmptyHeroProps) {
  const [prompt, setPrompt] = useState("");
  const suggestions = SUGGESTIONS.map((suggestion) => ({
    id: suggestion.id,
    title: t(suggestion.titleKey),
    description: t(suggestion.descriptionKey),
    prompt: t(suggestion.promptKey),
  }));

  const submit = (resolvedPrompt: string, attachments: ComposerAttachment[]) => {
    const trimmedPrompt = resolvedPrompt.trim();
    if (!trimmedPrompt || props.busy) return;
    props.onRunTask(trimmedPrompt, attachments);
  };

  const fillPrompt = (value: string) => {
    setPrompt(value);
    window.dispatchEvent(new Event("redrob:focusPrompt"));
  };

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-6 px-4 max-lg:px-4 sm:px-6">
      <div className="space-y-1.5 text-center">
        <h2 className="text-[24px] font-semibold leading-[30px] tracking-[-0.02em] text-foreground">
          {t("hero.title")}
        </h2>
        <p className="text-[13px] text-muted-foreground">{t("hero.subtitle")}</p>
      </div>

      <NewTaskComposer
        draft={prompt}
        onDraftChange={setPrompt}
        onRunTask={submit}
        busy={props.busy ?? false}
        context={props.composer ?? null}
      />

      {props.providerCount === 0 && props.onOpenProviderAuth ? (
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-xl border border-primary-muted/50 bg-primary-soft/40 p-3.5 text-left transition-colors hover:bg-primary-soft/50"
          onClick={props.onOpenProviderAuth}
        >
          <Zap className="mt-0.5 size-4 shrink-0 text-primary-ink" />
          <div>
            <div className="text-[13px] font-medium text-foreground">
              {t("hero.connect_provider_title")}
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              {t("hero.connect_provider_description")}
            </div>
          </div>
        </button>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            className="rounded-xl border border-border bg-background p-3.5 text-left transition-colors hover:bg-accent"
            onClick={() => fillPrompt(suggestion.prompt)}
          >
            <div className="truncate text-[13px] font-medium text-foreground">{suggestion.title}</div>
            <div className="mt-0.5 line-clamp-2 text-[12px] leading-[17px] text-muted-foreground">
              {suggestion.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
