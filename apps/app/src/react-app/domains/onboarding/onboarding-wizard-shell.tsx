/** @jsxImportSource react */
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "lucide-react";

import {
  PageBackground,
  PageDescription,
  PageHeader,
  PageTitle,
  PageTitlebarRegion,
} from "@/components/page";
import { Button } from "@/components/ui/button";
import { t } from "../../../i18n";
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
 * Shared chrome for the first-run onboarding steps. Matches the full-screen
 * overlay convention used by redrob-key-step.tsx / provider-selection-step.tsx
 * (fixed inset-0 z-50 over PageBackground) and adds a "Step N of 2" indicator
 * plus an optional Back control so the wizard reads as one coherent flow.
 */
export function OnboardingWizardShell({
  step,
  title,
  description,
  onBack,
  children,
}: OnboardingWizardShellProps) {
  const current = onboardingStepNumber(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <PageBackground />
      <PageTitlebarRegion />

      <div className="relative z-10 mx-6 w-full max-w-md rounded-3xl border border-border bg-background px-8 py-10">
        <div className="mb-6 flex items-center justify-between">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              data-testid="onboarding-back"
            >
              <ChevronLeftIcon className="mr-1 size-4" />
              {t("onboarding.back")}
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          <span className="text-xs font-medium text-muted-foreground">
            {t("onboarding.step_indicator", {
              current,
              total: ONBOARDING_STEP_COUNT,
            })}
          </span>
        </div>

        <PageHeader className="mb-8 text-center">
          <PageTitle>{title}</PageTitle>
          <PageDescription>{description}</PageDescription>
        </PageHeader>

        {children}
      </div>
    </div>
  );
}
