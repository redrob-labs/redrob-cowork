/** @jsxImportSource react */
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { t } from "../../../i18n";
import { OnboardingBrandMark } from "./onboarding-brand-mark";
import { ONBOARDING_STEP_COUNT, type OnboardingStep, onboardingStepNumber } from "./onboarding-steps";

type OnboardingWizardShellProps = {
  step: OnboardingStep;
  title: string;
  description: string;
  /** When provided, renders a Back control in the top-left of the card. */
  onBack?: (() => void) | null;
  children: ReactNode;
};

/**
 * Shared chrome for the first-run onboarding steps: a calm, full-page neutral
 * backdrop with one centered card, a compact brand lockup, a slim progress
 * track (replacing the earlier "Step N of 2" text-only indicator with a
 * visual read while keeping the same text for screen readers), an optional
 * Back control, a large headline, and short support copy. One primary action
 * per step lives in `children`.
 */
export function OnboardingWizardShell({
  step,
  title,
  description,
  onBack,
  children,
}: OnboardingWizardShellProps) {
  const current = onboardingStepNumber(step);
  const progressPercent = Math.round((current / ONBOARDING_STEP_COUNT) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-muted px-4 py-10 dark:bg-background">
      <div className="mac:titlebar-drag fixed inset-x-0 top-0 z-20 h-10" />

      <div className="animate-in fade-in slide-in-from-bottom-2 relative z-10 flex w-full max-w-[440px] flex-col gap-6 duration-300">
        <div className="flex items-center justify-between px-1">
          <OnboardingBrandMark />
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              data-testid="onboarding-back"
              className="text-muted-foreground"
            >
              <ChevronLeftIcon className="mr-1 size-4" />
              {t("onboarding.back")}
            </Button>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-border bg-background px-8 py-10 shadow-sm sm:px-10">
          <div
            className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={current}
            aria-valuemin={1}
            aria-valuemax={ONBOARDING_STEP_COUNT}
            aria-label={t("onboarding.step_indicator", {
              current,
              total: ONBOARDING_STEP_COUNT,
            })}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mb-9 space-y-2.5 text-center">
            <h1 className="text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-foreground sm:text-[32px] sm:leading-[38px]">
              {title}
            </h1>
            <p className="whitespace-pre-line text-[15px] leading-[23px] text-muted-foreground">
              {description}
            </p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
