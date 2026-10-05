/** @jsxImportSource react */
import { useState } from "react";
import { Zap } from "lucide-react";

import type { ComposerAttachment } from "@/app/types";
import { t } from "@/i18n";
import { useInDeskFrame } from "@/react-app/desk/shell/desk-frame";
import { NewTaskComposer, type NewTaskComposerContext } from "./new-task-composer";

/**
 * The starter card's prompt is sent to the model verbatim, so it is
 * translated with the card: a Korean user should not have their first task
 * silently written in English on their behalf.
 */
const SUGGESTIONS = [
  {
    id: "research",
    titleKey: "hero.suggestion_research_title",
    descriptionKey: "hero.suggestion_research_description",
    promptKey: "hero.suggestion_research_prompt",
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
  const inDeskFrame = useInDeskFrame();
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

  const composer = (
    <NewTaskComposer
      draft={prompt}
      onDraftChange={setPrompt}
      onRunTask={submit}
      busy={props.busy ?? false}
      context={props.composer ?? null}
    />
  );

  const connectProvider = props.providerCount === 0 && props.onOpenProviderAuth ? (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-xl border border-primary-muted/50 bg-primary-soft/40 p-3.5 text-left transition-colors hover:bg-primary-soft/50"
      onClick={props.onOpenProviderAuth}
    >
      <Zap className="mt-0.5 size-4 shrink-0 text-primary-ink" />
      <div>
        <div className="text-sm font-medium text-foreground">
          {t("hero.connect_provider_title")}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {t("hero.connect_provider_description")}
        </div>
      </div>
    </button>
  ) : null;

  // The Desk's new chat (01-new-chat): the one spoken line, then the composer and its tools.
  if (inDeskFrame) {
    return (
      <div className="desk-new">
        <h2 className="desk-new__line">{t("desk.new_chat_line")}</h2>
        {composer}
        {connectProvider}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-6 px-4 max-lg:px-4 sm:px-6">
      <div className="space-y-1.5 text-center">
        <h2 className="text-2xl font-semibold leading-[30px] tracking-[-0.02em] text-foreground">
          {t("hero.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hero.subtitle")}</p>
      </div>

      {composer}

      {connectProvider}

      <div className="grid gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            className="rounded-xl border border-border bg-background p-3.5 text-left transition-colors hover:bg-accent"
            onClick={() => fillPrompt(suggestion.prompt)}
          >
            <div className="truncate text-sm font-medium text-foreground">{suggestion.title}</div>
            <div className="mt-0.5 line-clamp-2 text-xs leading-[17px] text-muted-foreground">
              {suggestion.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
