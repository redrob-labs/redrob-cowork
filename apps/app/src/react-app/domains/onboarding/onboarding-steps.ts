/**
 * Ordered first-run onboarding steps and the pure helpers that drive the
 * wizard chrome (step indicator + Back navigation). Kept framework-free so the
 * ordering logic can be unit-tested without React.
 *
 * These are the two leading steps that render through `OnboardingWizardShell`
 * and therefore carry the "Step N of 2" indicator + Back control: language ->
 * engine (engine download). The subsequent API-key / "just look around" branch
 * is part of the existing welcome flow (RedrobKeyStep behind the
 * workspace-creation gate) and does not use the wizard chrome, so it is not
 * modeled here. Completion is persisted through the existing
 * `local.prefs.hasCompletedOnboarding` pref by welcome-route.tsx.
 */
export const ONBOARDING_STEPS = ["language", "engine"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Total number of steps, surfaced in the "Step {current} of {total}" label. */
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

/** 1-based position of a step, for the step indicator. */
export function onboardingStepNumber(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step) + 1;
}

/** The step before `step`, or null when `step` is the first step. */
export function previousOnboardingStep(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index > 0 ? ONBOARDING_STEPS[index - 1] : null;
}

/** The step after `step`, or null when `step` is the last step. */
export function nextOnboardingStep(step: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index >= 0 && index < ONBOARDING_STEPS.length - 1
    ? ONBOARDING_STEPS[index + 1]
    : null;
}

/** Whether a Back control makes sense from `step`. */
export function canGoBack(step: OnboardingStep): boolean {
  return previousOnboardingStep(step) !== null;
}
