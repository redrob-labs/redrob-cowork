import { describe, expect, it } from "bun:test";

/**
 * Removing the last workspace clears the onboarding-complete flag — but only on the TRANSITION.
 *
 * Two states must not disagree:
 *
 *   - No workspace AND onboarding marked complete: the user sees an empty main screen with no route
 *     back to onboarding, because the /welcome redirect is suppressed by a flag from a run that has
 *     nothing to show for it. Found the hard way: the only way out was deleting files by hand.
 *
 *   - Onboarding IN PROGRESS also has an empty workspace list, from the first screen to the last.
 *     "Just look around" never creates one, and completion is recorded partway through at the
 *     attribution step. So a rule keyed on "the list is empty" would undo that mid-flow and bounce the
 *     user back to the first screen — the exact bug the early write exists to fix.
 *
 * Hence the transition: 1-or-more to 0. These tests pin both sides, because a later reader tempted to
 * simplify the condition to `workspaceCount === 0` needs to see why that is wrong.
 */

/** The reset rule, as a pure predicate over the two counts and the flag. */
function clearsOnboardingFlag(input: {
  previousCount: number;
  currentCount: number;
  hasCompletedOnboarding: boolean;
  loading: boolean;
}): boolean {
  if (input.loading) return false;
  if (input.previousCount === 0) return false;
  if (input.currentCount > 0) return false;
  if (!input.hasCompletedOnboarding) return false;
  return true;
}

const settled = { loading: false, hasCompletedOnboarding: true };

describe("clearing the onboarding flag when the last workspace goes", () => {
  it("clears it when the only workspace is removed", () => {
    expect(clearsOnboardingFlag({ ...settled, previousCount: 1, currentCount: 0 })).toBe(true);
  });

  it("clears it when several workspaces are removed down to none", () => {
    expect(clearsOnboardingFlag({ ...settled, previousCount: 3, currentCount: 0 })).toBe(true);
  });

  it("does NOT clear it while onboarding is running with an empty list", () => {
    // The whole flow sits at 0 workspaces. Completion is written at the attribution step, and this
    // rule must not immediately take it back.
    expect(clearsOnboardingFlag({ ...settled, previousCount: 0, currentCount: 0 })).toBe(false);
  });

  it("does not clear it when a workspace remains", () => {
    expect(clearsOnboardingFlag({ ...settled, previousCount: 2, currentCount: 1 })).toBe(false);
  });

  it("does not act on unsettled state", () => {
    // A refresh in flight has not established anything yet.
    expect(
      clearsOnboardingFlag({ previousCount: 1, currentCount: 0, hasCompletedOnboarding: true, loading: true }),
    ).toBe(false);
  });

  it("is a no-op when the flag is already clear", () => {
    expect(
      clearsOnboardingFlag({ previousCount: 1, currentCount: 0, hasCompletedOnboarding: false, loading: false }),
    ).toBe(false);
  });
});
