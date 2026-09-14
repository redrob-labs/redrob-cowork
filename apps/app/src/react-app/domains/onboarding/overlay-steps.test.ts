import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Every onboarding step rendered on TOP of WelcomePage must be positioned as an overlay.
 *
 * welcome-route.tsx keeps WelcomePage mounted for the whole main-stage flow and layers the later steps
 * over it:
 *
 *     <WelcomePage ... />
 *     {state.redrobKeyStep  ? <RedrobKeyStep ... />  : null}
 *     {state.attributionStep ? <AttributionStep ... /> : null}
 *     {state.tutorialStep    ? <TutorialStep ... />    : null}
 *
 * A step without `fixed inset-0` lands in normal document flow, behind a full-height WelcomePage, and is
 * invisible. TutorialStep shipped that way, and the symptom was not a blank screen -- it was an endless
 * loop, because the user saw Get Started, created another workspace, went through the key step and the
 * survey again, and arrived back at the same invisible tutorial:
 *
 *     Connect Redrob -> Approve Redrob -> How did you hear about us? -> Get started
 *       -> Create workspace -> Connect Redrob -> ...
 *
 * Nothing errored, so no log or type check could catch it. This test can.
 */

const OVERLAY_STEPS = ["redrob-key-step.tsx", "attribution-step.tsx", "tutorial-step.tsx"];

function readStep(file: string): string {
  return readFileSync(path.join(import.meta.dir, file), "utf8");
}

describe("onboarding overlay steps", () => {
  for (const file of OVERLAY_STEPS) {
    it(`${file} is positioned as a full-screen overlay`, () => {
      const source = readStep(file);
      // Both halves matter: `fixed inset-0` takes it out of flow, `z-50` puts it above the page it
      // covers. A step with one and not the other is still invisible or still overlapped.
      expect(source).toContain("fixed inset-0");
      expect(source).toContain("z-50");
    });
  }

  it("covers every step welcome-route layers over WelcomePage", () => {
    // If a fourth overlay step is added to the route, this fails until it is listed above -- so the
    // rule cannot quietly stop applying to the newest step, which is how this bug arrived.
    const route = readFileSync(
      path.join(import.meta.dir, "..", "..", "shell", "welcome-route.tsx"),
      "utf8",
    );

    const layered = [...route.matchAll(/\{state\.(\w+)\s*\?\s*\(?\s*<(\w+)/g)].map((m) => m[2]);
    const componentNames = new Set(layered);

    // The components the route actually layers, mapped to the files this test asserts on.
    const asserted = new Set(["RedrobKeyStep", "AttributionStep", "TutorialStep"]);
    for (const name of componentNames) {
      expect(asserted.has(name)).toBe(true);
    }
  });
});
