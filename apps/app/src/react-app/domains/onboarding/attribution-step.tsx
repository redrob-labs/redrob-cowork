/** @jsxImportSource react */
import { useState } from "react";

import { PageTitlebarRegion } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  BotIcon,
  GithubIcon,
  MessageCircleIcon,
  SearchIcon,
  SkipForwardIcon,
  UsersIcon,
} from "lucide-react";

import { t } from "../../../i18n";
import { OnboardingBrandMark } from "./onboarding-brand-mark";

export type AttributionSource =
  | "ai_assistant"
  | "search"
  | "social"
  | "github"
  | "friend_or_colleague";

type AttributionOption = {
  source: AttributionSource;
  labelKey: string;
  descriptionKey: string;
  icon: typeof BotIcon;
};

const options: AttributionOption[] = [
  {
    source: "ai_assistant",
    labelKey: "onboarding.attribution_ai_assistant_label",
    descriptionKey: "onboarding.attribution_ai_assistant_desc",
    icon: BotIcon,
  },
  {
    source: "search",
    labelKey: "onboarding.attribution_search_label",
    descriptionKey: "onboarding.attribution_search_desc",
    icon: SearchIcon,
  },
  {
    source: "social",
    labelKey: "onboarding.attribution_social_label",
    descriptionKey: "onboarding.attribution_social_desc",
    icon: MessageCircleIcon,
  },
  {
    source: "github",
    labelKey: "onboarding.attribution_github_label",
    descriptionKey: "onboarding.attribution_github_desc",
    icon: GithubIcon,
  },
  {
    source: "friend_or_colleague",
    labelKey: "onboarding.attribution_friend_label",
    descriptionKey: "onboarding.attribution_friend_desc",
    icon: UsersIcon,
  },
];

type AttributionStepProps = {
  onSubmit: (source: AttributionSource, aiPrompt?: string) => void;
  onSkip: () => void;
};

/**
 * Self-reported attribution survey shown once during onboarding.
 * When the user picks "AI assistant" we ask which prompt led them
 * here: first-party data on how answer engines describe Redrob Cowork.
 */
export function AttributionStep({ onSubmit, onSkip }: AttributionStepProps) {
  const [aiSelected, setAiSelected] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-muted px-4 py-10 dark:bg-background">
      <PageTitlebarRegion />

      <div className="animate-in fade-in slide-in-from-bottom-2 relative z-10 flex w-full max-w-[440px] flex-col gap-6 duration-300">
        <div className="px-1">
          <OnboardingBrandMark />
        </div>

        <div className="rounded-[28px] border border-border bg-background px-8 py-10 shadow-sm sm:px-10">
          <div className="mb-8 space-y-2.5 text-center">
            <h1 className="text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-foreground sm:text-[32px] sm:leading-[38px]">
              {t("onboarding.attribution_title")}
            </h1>
            <p className="text-[15px] leading-[23px] text-muted-foreground">
              {t("onboarding.attribution_subtitle")}
            </p>
          </div>

          {aiSelected ? (
            <div className="space-y-3">
              <div className="text-sm font-medium text-foreground">
                {t("onboarding.attribution_ai_prompt_label")}
              </div>
              <Textarea
                autoFocus
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                placeholder={t("onboarding.attribution_ai_prompt_placeholder")}
                rows={3}
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSubmit("ai_assistant")}
                >
                  {t("onboarding.attribution_skip_part")}
                </Button>
                <Button size="sm" onClick={() => onSubmit("ai_assistant", aiPrompt)}>
                  {t("onboarding.continue")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {options.map((option) => (
                <button
                  key={option.source}
                  type="button"
                  className="flex w-full items-start gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/15 hover:bg-accent"
                  onClick={() => {
                    if (option.source === "ai_assistant") {
                      setAiSelected(true);
                      return;
                    }
                    onSubmit(option.source);
                  }}
                >
                  <option.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {t(option.labelKey)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {t(option.descriptionKey)}
                    </div>
                  </div>
                </button>
              ))}

              <div className="pt-2 text-center">
                <Button variant="ghost" size="sm" onClick={onSkip}>
                  <SkipForwardIcon className="mr-1.5 size-3.5" />
                  {t("onboarding.attribution_skip")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
