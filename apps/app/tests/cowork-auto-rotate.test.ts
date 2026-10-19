import { describe, expect, test } from "bun:test";

import { autoRotateRuns, interactionPauseHandlers, nextAutoRotateIndex } from "../src/react-app/cowork/preview/use-auto-rotate";

// Rotating surfaces must hold still while a person reads or uses them (WCAG 2.2.2).

/** The hook's pause state, driven through the same handlers the surfaces spread on their element. */
function surface(count = 3) {
  const state = { pointer: false, focus: false, stopped: false };
  const handlers = interactionPauseHandlers((inside) => (state.pointer = inside), (inside) => (state.focus = inside));
  const runs = (env: { hidden?: boolean; reducedMotion?: boolean } = {}) =>
    autoRotateRuns({ paused: state.pointer || state.focus || state.stopped, hidden: env.hidden ?? false, reducedMotion: env.reducedMotion ?? false, count });
  return { state, handlers, runs };
}
const element = (children: object[]) => ({ contains: (node: unknown) => children.includes(node as object) }) as unknown as HTMLElement;

describe("auto-rotate pause", () => {
  test("pointer and keyboard focus pause, a manual stop holds, and leaving resumes", () => {
    const { state, handlers, runs } = surface();
    const child = {};
    const root = element([child]);
    expect(runs()).toBe(true);

    handlers.onMouseEnter();
    expect(runs()).toBe(false);
    handlers.onMouseLeave();
    expect(runs()).toBe(true);

    handlers.onFocus();
    expect(runs()).toBe(false);
    // Focus moving to a child of the same element is not leaving it.
    handlers.onBlur({ currentTarget: root, relatedTarget: child as EventTarget });
    expect(runs()).toBe(false);
    handlers.onBlur({ currentTarget: root, relatedTarget: null });
    expect(runs()).toBe(true);

    state.stopped = true;
    handlers.onMouseEnter();
    handlers.onMouseLeave();
    expect(runs()).toBe(false);
    state.stopped = false;
    expect(runs()).toBe(true);
  });

  test("a hidden document, reduced motion or a single entry never rotates; the step wraps", () => {
    expect(surface().runs({ hidden: true })).toBe(false);
    expect(surface().runs({ reducedMotion: true })).toBe(false);
    expect(surface(1).runs()).toBe(false);
    expect([0, 1, 2].map((index) => nextAutoRotateIndex(index, 3))).toEqual([1, 2, 0]);
  });
});
