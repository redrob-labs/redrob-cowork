import { describe, expect, test } from "bun:test";

import {
  canGoBack,
  canGoForward,
  initialHistoryReach,
  reduceHistoryReach,
  type HistoryReachState,
} from "../src/react-app/shell/history-reach";

/** Fold a sequence of [type, key] navigations starting from empty. */
function run(steps: Array<["POP" | "PUSH" | "REPLACE", string]>): HistoryReachState {
  return steps.reduce((state, [type, key]) => reduceHistoryReach(state, type, key), initialHistoryReach);
}

describe("history reach (hash router)", () => {
  test("the first location, however its type is reported, has nowhere to go", () => {
    // A reload reports POP, but there is no prior entry to go back to yet.
    const state = run([["POP", "a"]]);
    expect(state).toEqual({ keys: ["a"], pointer: 0 });
    expect(canGoBack(state)).toBe(false);
    expect(canGoForward(state)).toBe(false);
  });

  test("each PUSH makes Back reachable and leaves nothing forward", () => {
    const state = run([
      ["PUSH", "a"],
      ["PUSH", "b"],
      ["PUSH", "c"],
    ]);
    expect(state.keys).toEqual(["a", "b", "c"]);
    expect(state.pointer).toBe(2);
    expect(canGoBack(state)).toBe(true);
    expect(canGoForward(state)).toBe(false);
  });

  test("a POP back makes Forward reachable without losing the forward entry", () => {
    const state = run([
      ["PUSH", "a"],
      ["PUSH", "b"],
      ["PUSH", "c"],
      ["POP", "b"], // Back from c to b
    ]);
    expect(state.pointer).toBe(1);
    expect(canGoBack(state)).toBe(true); // a is still behind
    expect(canGoForward(state)).toBe(true); // c is still ahead
  });

  test("a POP forward returns to the tail where Forward is exhausted again", () => {
    const state = run([
      ["PUSH", "a"],
      ["PUSH", "b"],
      ["POP", "a"], // Back
      ["POP", "b"], // Forward
    ]);
    expect(state.pointer).toBe(1);
    expect(canGoForward(state)).toBe(false);
    expect(canGoBack(state)).toBe(true);
  });

  test("a PUSH after going Back discards the forward entries, as a browser does", () => {
    const state = run([
      ["PUSH", "a"],
      ["PUSH", "b"],
      ["PUSH", "c"],
      ["POP", "a"], // Back to the start
      ["PUSH", "d"], // new navigation drops b and c
    ]);
    expect(state.keys).toEqual(["a", "d"]);
    expect(state.pointer).toBe(1);
    expect(canGoForward(state)).toBe(false);
    expect(canGoBack(state)).toBe(true);
  });

  test("REPLACE swaps the current entry in place, keeping the stack length and reach", () => {
    const before = run([
      ["PUSH", "a"],
      ["PUSH", "b"],
    ]);
    const after = reduceHistoryReach(before, "REPLACE", "b2");
    expect(after.keys).toEqual(["a", "b2"]);
    expect(after.pointer).toBe(1);
    expect(canGoBack(after)).toBe(true);
    expect(canGoForward(after)).toBe(false);
  });

  test("an unknown key on POP is appended rather than losing the pointer", () => {
    const state = run([
      ["PUSH", "a"],
      ["POP", "x"], // a native entry we never recorded
    ]);
    expect(state.keys).toEqual(["a", "x"]);
    expect(state.pointer).toBe(1);
    expect(canGoBack(state)).toBe(true);
  });
});
