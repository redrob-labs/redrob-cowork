import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CRITICAL_FREE_BYTES,
  TIGHT_FREE_BYTES,
  describeMemoryHeadroom,
  formatMib,
  posture,
  readMemoryHeadroom,
  summarizeMemoryHeadroom,
} from "./memory-headroom.mjs";

const MIB = 1024 * 1024;
const TOTAL = 16 * 1024 * MIB;

const at = (freeBytes) => describeMemoryHeadroom({
  totalBytes: TOTAL,
  freeBytes,
  posture: posture(freeBytes),
});

describe("posture", () => {
  it("is critical below the floor", () => {
    assert.equal(posture(CRITICAL_FREE_BYTES - 1), "critical");
    assert.equal(posture(0), "critical");
  });

  it("is tight between the floor and comfortable", () => {
    assert.equal(posture(CRITICAL_FREE_BYTES), "tight");
    assert.equal(posture(TIGHT_FREE_BYTES - 1), "tight");
  });

  it("is ample at or above comfortable", () => {
    assert.equal(posture(TIGHT_FREE_BYTES), "ample");
    assert.equal(posture(64 * 1024 * MIB), "ample");
  });

  it("orders the two thresholds so no reading is unclassifiable", () => {
    assert.ok(CRITICAL_FREE_BYTES < TIGHT_FREE_BYTES);
  });
});

describe("describeMemoryHeadroom", () => {
  // This is the whole point of the module. The complaint being fixed was a
  // message that said only "blocked on the host": no cause, no remedy, no next
  // step. It must not be possible to produce one of those from here.
  for (const [name, freeBytes] of [
    ["critical", 128 * MIB],
    ["tight", 1024 * MIB],
  ]) {
    it(`${name}: names the cause with the real number`, () => {
      const advice = at(freeBytes);
      assert.ok(advice.shouldWarn, "a non-ample reading must warn");
      assert.match(advice.cause, /\d/, "the cause must carry a number");
      assert.ok(advice.cause.includes(formatMib(freeBytes)), "the cause must state free memory");
      assert.ok(advice.cause.includes(formatMib(TOTAL)), "the cause must state total memory");
    });

    it(`${name}: offers a remedy the user can act on`, () => {
      const advice = at(freeBytes);
      assert.ok(advice.remedy.length > 0, "a warning without a remedy is the bug");
      assert.match(advice.remedy, /[Cc]los/, "the remedy should say what to close");
    });

    it(`${name}: leaves the decision with the user`, () => {
      // Even critical: this is their machine, and refusing outright is how
      // someone ends up stuck with no path forward.
      assert.equal(at(freeBytes).canProceed, true);
    });
  }

  it("says nothing when there is plenty of room", () => {
    const advice = at(8 * 1024 * MIB);
    assert.equal(advice.shouldWarn, false);
    assert.equal(advice.remedy, "");
    assert.equal(advice.canProceed, true);
  });

  it("distinguishes slow from unreliable, so the two do not read the same", () => {
    const critical = at(128 * MIB);
    const tight = at(1024 * MIB);
    assert.notEqual(critical.cause, tight.cause);
    assert.notEqual(critical.remedy, tight.remedy);
    // Tight is about speed; critical is about failing.
    assert.match(tight.remedy, /slow/i);
    assert.match(critical.remedy, /fail|again/i);
  });
});

describe("formatMib", () => {
  it("uses MB below a gigabyte and GB above it", () => {
    assert.equal(formatMib(512 * MIB), "512 MB");
    assert.equal(formatMib(2048 * MIB), "2.0 GB");
  });

  it("never renders a bare byte count at a user", () => {
    for (const bytes of [0, 1, 999, 512 * MIB, 16 * 1024 * MIB]) {
      assert.match(formatMib(bytes), /(MB|GB)$/);
    }
  });
});

describe("readMemoryHeadroom", () => {
  it("classifies what the host reports", () => {
    const headroom = readMemoryHeadroom({
      total: () => TOTAL,
      free: () => 100 * MIB,
    });
    assert.equal(headroom.totalBytes, TOTAL);
    assert.equal(headroom.freeBytes, 100 * MIB);
    assert.equal(headroom.posture, "critical");
  });

  it("reads the real host without throwing", () => {
    const headroom = readMemoryHeadroom();
    assert.ok(headroom.totalBytes > 0);
    assert.ok(["ample", "tight", "critical"].includes(headroom.posture));
  });
});

describe("summarizeMemoryHeadroom", () => {
  it("carries both the cause and the remedy in one line", () => {
    const line = summarizeMemoryHeadroom({
      totalBytes: TOTAL,
      freeBytes: 128 * MIB,
      posture: "critical",
    });
    assert.match(line, /128 MB/);
    assert.match(line, /[Cc]los/);
  });

  it("is just the reading when nothing is wrong", () => {
    const line = summarizeMemoryHeadroom({
      totalBytes: TOTAL,
      freeBytes: 8 * 1024 * MIB,
      posture: "ample",
    });
    assert.ok(!/[Cc]los/.test(line));
  });
});
