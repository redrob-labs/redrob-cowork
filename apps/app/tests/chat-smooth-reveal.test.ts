import { describe, expect, test } from "bun:test";

import {
  BASE_CHARS_PER_SEC,
  BURST_DECAY_SECONDS,
  MAX_CATCHUP_CHARS_PER_SEC,
  MAX_DRAIN_CHARS_PER_SEC,
  computeRevealRate,
  drainRate,
} from "../src/components/chat/use-smooth-reveal";

describe("useSmoothReveal rate policy", () => {
  test("opens at 2x the base rate and settles to 1x by the end of the burst", () => {
    // A small backlog so the catch-up floor does not apply.
    expect(computeRevealRate(0, 10)).toBeCloseTo(BASE_CHARS_PER_SEC * 2, 5);
    expect(computeRevealRate(BURST_DECAY_SECONDS, 10)).toBeCloseTo(BASE_CHARS_PER_SEC, 5);
    expect(computeRevealRate(BURST_DECAY_SECONDS * 3, 10)).toBeCloseTo(BASE_CHARS_PER_SEC, 5);
  });

  test("a model racing far ahead lifts the rate, but only to the catch-up cap", () => {
    const racing = computeRevealRate(BURST_DECAY_SECONDS * 3, 2000);
    expect(racing).toBeGreaterThan(BASE_CHARS_PER_SEC);
    expect(racing).toBeLessThanOrEqual(MAX_CATCHUP_CHARS_PER_SEC);
  });
});

describe("drain after the stream ends", () => {
  test("a big leftover drains at a capped pace; a small tail never crawls", () => {
    expect(drainRate(10, 1562)).toBe(MAX_DRAIN_CHARS_PER_SEC);
    expect(drainRate(10, 5)).toBeGreaterThanOrEqual(MAX_CATCHUP_CHARS_PER_SEC);
  });
});
