/** @jsxImportSource react */
import { useSyncExternalStore } from "react";
import { CheckIcon } from "lucide-react";

import {
  LANGUAGE_OPTIONS,
  currentLocale,
  setLocale,
  subscribeToLocale,
  t,
} from "@/i18n";
import { Button } from "@/components/ui/button";
import { OnboardingWizardShell } from "./onboarding-wizard-shell";

type LanguageStepProps = {
  onContinue: () => void;
};

/**
 * First onboarding step: pick the UI language. The choice is applied
 * immediately and persistently via `setLocale` from `@/i18n` (which writes the
 * `redrob.language` localStorage key and notifies subscribers), so this and the
 * rest of the app re-render into the chosen language right away. No new locale
 * store is introduced — the active language is read through the same
 * `useSyncExternalStore(subscribeToLocale, ...)` pattern as
 * shell/bottom-left-controls.tsx.
 */
export function LanguageStep({ onContinue }: LanguageStepProps) {
  const language = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);

  return (
    <OnboardingWizardShell
      step="language"
      title={t("onboarding.language_title")}
      description={t("onboarding.language_subtitle")}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-2.5" role="radiogroup" aria-label={t("onboarding.language_title")}>
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = option.value === language;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-pressed={selected}
                className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-colors ${
                  selected
                    ? "border-primary-muted bg-primary-soft/50 ring-1 ring-primary-muted/30"
                    : "border-border bg-card hover:border-foreground/15 hover:bg-accent"
                }`}
                onClick={() => setLocale(option.value)}
                data-testid={`onboarding-language-${option.value}`}
              >
                <div>
                  <div className="text-[15px] font-medium text-foreground">
                    {option.nativeName}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {option.label}
                  </div>
                </div>
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    selected ? "border-primary bg-primary" : "border-border bg-transparent"
                  }`}
                  aria-hidden="true"
                >
                  {selected ? <CheckIcon className="size-3.5 text-white" /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          size="lg"
          className="h-12 w-full text-[15px] font-semibold"
          onClick={onContinue}
          data-testid="onboarding-language-continue"
        >
          {t("onboarding.continue")}
        </Button>
      </div>
    </OnboardingWizardShell>
  );
}
