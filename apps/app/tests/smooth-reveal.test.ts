import { describe, expect, test } from "bun:test";

import { computeRevealRate } from "../src/components/chat/use-smooth-reveal";

// The base sustained rate ("1x Claude") the hook settles to; mirrored from the module.
const BASE = 55;
const DECAY_SECONDS = 1.2;

describe("useSmoothReveal rate policy", () => {
  test("opens at ~2x the base rate (the '2x Claude' burst)", () => {
    // A small backlog so the catch-up floor does not apply.
    expect(computeRevealRate(0, 10)).toBeCloseTo(BASE * 2, 5);
  });

  test("decays to ~1x the base rate by the end of the burst window", () => {
    expect(computeRevealRate(DECAY_SECONDS, 10)).toBeCloseTo(BASE, 5);
    // And stays at 1x after the window (clamped, never below base for a small backlog).
    expect(computeRevealRate(DECAY_SECONDS * 3, 10)).toBeCloseTo(BASE, 5);
  });

  test("decays monotonically from 2x toward 1x across the window", () => {
    const samples = [0, 0.3, 0.6, 0.9, 1.2].map((t) => computeRevealRate(t, 10));
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]!);
    }
    // Halfway through the window the burst is halfway between 2x and 1x (= 1.5x).
    expect(computeRevealRate(DECAY_SECONDS / 2, 10)).toBeCloseTo(BASE * 1.5, 5);
  });

  test("never reveals slower than the base rate while there is a backlog", () => {
    for (const t of [0, 0.5, 1.2, 5, 60]) {
      expect(computeRevealRate(t, 10)).toBeGreaterThanOrEqual(BASE);
    }
  });

  test("raises a bounded catch-up when the model races far ahead", () => {
    // A large backlog past the threshold lifts the rate above the settled base...
    const racing = computeRevealRate(DECAY_SECONDS * 3, 2000);
    expect(racing).toBeGreaterThan(BASE);
    // ...but it is capped (never unbounded), so the reveal stays smooth, not a jump-to-end.
    expect(racing).toBeLessThanOrEqual(BASE * 6);
  });
});
