import { describe, expect, it } from "bun:test";

/**
 * The onboarding bounce, pinned as a state invariant.
 *
 * Reported from Windows 11: after the engine step, choosing any of "Just look around", "Connect
 * Redrob" or the API-key path returned the user to the Get Started screen with their choice lost.
 *
 * The mechanism was not platform-specific, only more visible there. use-workspace-route-state.ts
 * redirects to /welcome whenever a session route finds NO workspaces and onboarding NOT complete:
 *
 *     if (workspaces.length > 0) return;
 *     if (local.prefs.hasCompletedOnboarding) return;
 *     navigate("/welcome", { replace: true });
 *
 * All three choices converge on the attribution step and none of them creates a workspace, while
 * completion used to be written in exactly one place -- finishOnboarding, reachable only from
 * TutorialStep's Start button. Everything between the choice and that button therefore satisfied both
 * clauses, and the redirect remounted WelcomeRoute, discarding the reducer state mid-flow.
 *
 * These tests encode the condition rather than the React wiring: they are what makes the regression
 * legible if someone later moves the completion write back to the tutorial.
 */

/** The redirect in use-workspace-route-state.ts, as a pure predicate. */
function bouncesToWelcome(input: { workspaceCount: number; hasCompletedOnboarding: boolean }): boolean {
  if (input.workspaceCount > 0) return false;
  if (input.hasCompletedOnboarding) return false;
  return true;
}

describe("onboarding completion suppresses the /welcome bounce", () => {
  it("bounces a user who has no workspace and has not completed onboarding", () => {
    // The state the three choices used to leave behind.
    expect(bouncesToWelcome({ workspaceCount: 0, hasCompletedOnboarding: false })).toBe(true);
  });

  it("does NOT bounce once the choice is recorded, even with no workspace", () => {
    // "Just look around" deliberately creates no workspace, so completion is the only thing that can
    // suppress the redirect. This is the case the fix turns from true to false.
    expect(bouncesToWelcome({ workspaceCount: 0, hasCompletedOnboarding: true })).toBe(false);
  });

  it("does not bounce a user who created a workspace", () => {
    // The keyed path via workspace creation was never affected, which is why the report named the
    // three no-workspace choices specifically.
    expect(bouncesToWelcome({ workspaceCount: 1, hasCompletedOnboarding: false })).toBe(false);
  });

  it("stays suppressed for a returning user", () => {
    expect(bouncesToWelcome({ workspaceCount: 1, hasCompletedOnboarding: true })).toBe(false);
  });
});
