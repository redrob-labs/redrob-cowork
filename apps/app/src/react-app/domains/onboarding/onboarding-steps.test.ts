declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => {
  toEqual: (expected: unknown) => void;
  toBe: (expected: unknown) => void;
};

import {
  ONBOARDING_STEP_COUNT,
  ONBOARDING_STEPS,
  canGoBack,
  nextOnboardingStep,
  onboardingStepNumber,
  previousOnboardingStep,
} from "./onboarding-steps";

describe("onboarding step ordering", () => {
  test("language is the first step, engine is last", () => {
    expect(ONBOARDING_STEPS[0]).toBe("language");
    expect(ONBOARDING_STEPS[ONBOARDING_STEP_COUNT - 1]).toBe("engine");
    expect(ONBOARDING_STEP_COUNT).toBe(2);
  });

  test("step numbers are 1-based and match the ordered flow", () => {
    expect(onboardingStepNumber("language")).toBe(1);
    expect(onboardingStepNumber("engine")).toBe(2);
  });

  test("next advances language -> engine -> null", () => {
    expect(nextOnboardingStep("language")).toBe("engine");
    expect(nextOnboardingStep("engine")).toEqual(null);
  });

  test("previous walks back and stops at the first step", () => {
    expect(previousOnboardingStep("language")).toEqual(null);
    expect(previousOnboardingStep("engine")).toBe("language");
  });

  test("Back is available on engine but not the language step", () => {
    expect(canGoBack("language")).toBe(false);
    expect(canGoBack("engine")).toBe(true);
  });
});
