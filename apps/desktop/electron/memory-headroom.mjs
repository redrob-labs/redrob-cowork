/**
 * Host memory headroom, and what to tell the user about it.
 *
 * The app had no idea whether the machine was short of memory. When an ordinary
 * command slowed to a crawl because the host was starved, nothing said so — the
 * user was left with a stalled install and no way to tell whether it was their
 * machine, our app, or the network.
 *
 * This module answers three questions and nothing else, so the policy stays in
 * one testable place:
 *
 *   - how much room is there (`readMemoryHeadroom`),
 *   - is that a problem (`posture`),
 *   - and what do we say about it (`describeMemoryHeadroom`).
 *
 * Every message it produces must state the cause WITH the number, name a remedy
 * the user can act on, and leave the decision with them. A warning that says
 * only "blocked on the host" is the thing being fixed here, so it must not be
 * possible to build one from this module.
 */

import os from "node:os";

const MIB = 1024 * 1024;

/**
 * Free memory below this is where ordinary work starts failing in ways that look
 * like a hang rather than an error: a package install thrashes, a build is killed
 * by the OS. Chosen to match the floor the agent host already treats as
 * unworkable rather than invented here.
 */
export const CRITICAL_FREE_BYTES = 512 * MIB;

/** Below this, work still completes but slowly enough that the user notices. */
export const TIGHT_FREE_BYTES = 2048 * MIB;

/** @typedef {"ample" | "tight" | "critical"} MemoryPosture */

/**
 * @typedef {object} MemoryHeadroom
 * @property {number} totalBytes
 * @property {number} freeBytes
 * @property {MemoryPosture} posture
 */

export function posture(freeBytes) {
  if (freeBytes < CRITICAL_FREE_BYTES) return "critical";
  if (freeBytes < TIGHT_FREE_BYTES) return "tight";
  return "ample";
}

/** @returns {MemoryHeadroom} */
export function readMemoryHeadroom(read = { total: os.totalmem, free: os.freemem }) {
  const totalBytes = read.total();
  const freeBytes = read.free();
  return { totalBytes, freeBytes, posture: posture(freeBytes) };
}

export function formatMib(bytes) {
  const mib = bytes / MIB;
  if (mib >= 1024) return `${(mib / 1024).toFixed(1)} GB`;
  return `${Math.round(mib)} MB`;
}

/**
 * @typedef {object} MemoryAdvice
 * @property {MemoryPosture} posture
 * @property {string} cause    Plain language, always carrying the real number.
 * @property {string} remedy   Something the user can actually do.
 * @property {boolean} canProceed  Whether to offer "run anyway".
 * @property {boolean} shouldWarn  Whether to say anything at all.
 */

/**
 * Turn a headroom reading into something worth showing a person.
 *
 * `canProceed` is true even when the posture is critical: the user's machine is
 * theirs, and refusing outright is how you get someone stuck with no path
 * forward. We say what is wrong, say what would help, and let them decide.
 *
 * @param {MemoryHeadroom} headroom
 * @returns {MemoryAdvice}
 */
export function describeMemoryHeadroom(headroom) {
  const free = formatMib(headroom.freeBytes);
  const total = formatMib(headroom.totalBytes);

  if (headroom.posture === "ample") {
    return {
      posture: "ample",
      cause: `${free} of ${total} free.`,
      remedy: "",
      canProceed: true,
      shouldWarn: false,
    };
  }

  if (headroom.posture === "critical") {
    return {
      posture: "critical",
      cause: `Only ${free} of ${total} memory is free, below the ${formatMib(
        CRITICAL_FREE_BYTES,
      )} this needs to run reliably.`,
      remedy:
        "Close other applications to free memory, then try again. Package installs and builds are the first things to fail at this level.",
      canProceed: true,
      shouldWarn: true,
    };
  }

  return {
    posture: "tight",
    cause: `${free} of ${total} memory is free, under the ${formatMib(
      TIGHT_FREE_BYTES,
    )} that keeps things comfortable.`,
    remedy: "This will work but may be slow. Closing other applications will speed it up.",
    canProceed: true,
    shouldWarn: true,
  };
}

/** A single line for a log or a tooltip. */
export function summarizeMemoryHeadroom(headroom) {
  const advice = describeMemoryHeadroom(headroom);
  return advice.remedy ? `${advice.cause} ${advice.remedy}` : advice.cause;
}
