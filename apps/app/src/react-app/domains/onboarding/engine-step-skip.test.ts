import { describe, expect, it } from "bun:test";

/**
 * Whether the engine step draws itself, and why the two inputs only work as a pair.
 *
 * The step exists to acquire the engine binary. When the binary is already installed it has nothing to
 * do, and it was still shown: a user reported seeing "The engine is already installed." with a Continue
 * button on every run of onboarding. Onboarding is not once-only in practice - /welcome is re-entered
 * whenever there are no workspaces and completion has not been recorded - so a dead step is not a
 * one-time cost, it is a toll on every visit.
 *
 * Skipping it unconditionally breaks the Back button instead: Back from engine to language, then
 * Continue, would skip forward again and the language stage could never be reached. So the skip is
 * conditioned on NOT having arrived by Back, and both halves are pinned here together.
 */

/** engine-download-step.tsx: the decision the doctor result feeds. */
function skipsStep(input: {
  found: boolean;
  supportsServe: boolean;
  autoContinueWhenPresent: boolean;
}): boolean {
  if (!input.found || !input.supportsServe) return false;
  return input.autoContinueWhenPresent;
}

/** welcome-route.tsx: what the route passes for that flag. */
function autoContinueForEntry(input: { stageFromBack: boolean }): boolean {
  return !input.stageFromBack;
}

describe("the engine step does not ask for a click it does not need", () => {
  it("skips itself when the engine is already installed and healthy", () => {
    expect(skipsStep({ found: true, supportsServe: true, autoContinueWhenPresent: true })).toBe(true);
  });

  it("still draws when the engine is missing, which is the whole point of the step", () => {
    expect(skipsStep({ found: false, supportsServe: false, autoContinueWhenPresent: true })).toBe(
      false,
    );
  });

  it("still draws when the binary is there but cannot serve, because that needs a repair", () => {
    // `found` alone is not enough: an engine that cannot serve is a broken install, and the user has
    // to be given the download control rather than being moved silently past it.
    expect(skipsStep({ found: true, supportsServe: false, autoContinueWhenPresent: true })).toBe(
      false,
    );
  });

  it("draws on a Back press even with a healthy engine, or language is unreachable", () => {
    expect(skipsStep({ found: true, supportsServe: true, autoContinueWhenPresent: false })).toBe(
      false,
    );
  });

  it("passes autoContinue on a forward entry and withholds it on a Back entry", () => {
    expect(autoContinueForEntry({ stageFromBack: false })).toBe(true);
    expect(autoContinueForEntry({ stageFromBack: true })).toBe(false);
  });
});
