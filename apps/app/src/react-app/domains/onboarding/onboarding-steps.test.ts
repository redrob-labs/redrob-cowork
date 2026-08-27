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
  test("language is the first step, connect is last", () => {
    expect(ONBOARDING_STEPS[0]).toBe("language");
    expect(ONBOARDING_STEPS[ONBOARDING_STEP_COUNT - 1]).toBe("connect");
    expect(ONBOARDING_STEP_COUNT).toBe(3);
  });

  test("step numbers are 1-based and match the ordered flow", () => {
    expect(onboardingStepNumber("language")).toBe(1);
    expect(onboardingStepNumber("engine")).toBe(2);
    expect(onboardingStepNumber("connect")).toBe(3);
  });

  test("next advances language -> engine -> connect -> null", () => {
    expect(nextOnboardingStep("language")).toBe("engine");
    expect(nextOnboardingStep("engine")).toBe("connect");
    expect(nextOnboardingStep("connect")).toEqual(null);
  });

  test("previous walks back and stops at the first step", () => {
    expect(previousOnboardingStep("language")).toEqual(null);
    expect(previousOnboardingStep("engine")).toBe("language");
    expect(previousOnboardingStep("connect")).toBe("engine");
  });

  test("Back is available everywhere except the language step", () => {
    expect(canGoBack("language")).toBe(false);
    expect(canGoBack("engine")).toBe(true);
    expect(canGoBack("connect")).toBe(true);
  });
});
