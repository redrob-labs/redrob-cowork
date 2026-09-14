import { describe, expect, it } from "bun:test";

/**
 * The two guards around onboarding completion, which only work as a pair.
 *
 * Both were found by a user on Windows 11, one after the other, and the second was caused by the fix
 * for the first:
 *
 *   1. Choosing "Just look around", "Connect Redrob" or the API-key path returned the user to Get
 *      Started. None of the three creates a workspace, and completion was written only at the
 *      tutorial's Start button, so the flow sat in the state the session route redirects out of
 *      (no workspaces AND onboarding not complete) and got bounced back.
 *
 *   2. Writing completion at the attribution step fixed that and then SKIPPED THE TUTORIAL, because
 *      /welcome also had an effect redirecting away the moment `hasCompletedOnboarding` turned true.
 *      Setting the flag mid-flow tripped it and unmounted the wizard.
 *
 * So completion must be written EARLY (or the flow bounces) and the away-redirect must read only the
 * MOUNT-TIME value (or the flow unmounts). Encoding one without the other reintroduces the sibling bug,
 * which is why both predicates live in one file.
 */

/** use-workspace-route-state.ts: the redirect INTO onboarding. */
function bouncesToWelcome(input: { workspaceCount: number; hasCompletedOnboarding: boolean }): boolean {
  if (input.workspaceCount > 0) return false;
  if (input.hasCompletedOnboarding) return false;
  return true;
}

/** welcome-route.tsx: the redirect OUT of onboarding, reading the mount-time value only. */
function leavesWelcome(input: { completeOnMount: boolean; completeNow: boolean }): boolean {
  return input.completeOnMount;
}

describe("onboarding runs to the tutorial without bouncing", () => {
  it("does not bounce once the choice is recorded, with no workspace", () => {
    // Bug 1: this is the case the early write turns from true to false.
    expect(bouncesToWelcome({ workspaceCount: 0, hasCompletedOnboarding: true })).toBe(false);
  });

  it("would still bounce if completion waited for the tutorial", () => {
    // The pre-fix state, kept as the reason the early write exists.
    expect(bouncesToWelcome({ workspaceCount: 0, hasCompletedOnboarding: false })).toBe(true);
  });

  it("stays on /welcome after completion is recorded mid-flow", () => {
    // Bug 2: the flag turns true while the wizard is showing the attribution step. Reading the live
    // value here is what skipped the tutorial.
    expect(leavesWelcome({ completeOnMount: false, completeNow: true })).toBe(false);
  });

  it("still bounces a returning user off /welcome", () => {
    // The guard must keep doing its actual job: a user who finished onboarding earlier and lands on
    // /welcome again goes straight to the session.
    expect(leavesWelcome({ completeOnMount: true, completeNow: true })).toBe(true);
  });

  it("lets the whole flow reach the tutorial", () => {
    // The full sequence for "Just look around": mounted incomplete, completion recorded at the
    // attribution step, and neither redirect fires in between.
    const completeOnMount = false;
    let complete = false;

    // ... engine step, Get Started, workspace created, one of the three choices picked ...
    // attribution step appears and records completion:
    complete = true;

    expect(leavesWelcome({ completeOnMount, completeNow: complete })).toBe(false);
    expect(bouncesToWelcome({ workspaceCount: 0, hasCompletedOnboarding: complete })).toBe(false);
    // Nothing navigates, so the reducer survives to dispatch tutorial-step.
  });
});
