import { afterEach, describe, expect, test } from "bun:test";

import { measureToolMenuLayout } from "../src/react-app/domains/session/surface/composer/composer";

/**
 * The composer's "+" panel opens inside the work column. It used to be held only inside the window, so
 * with the Desk side panel open it ran across the panel (seen at 1180px with the panel open).
 */
// No DOM in this suite: a bare HTMLElement class is enough for the `instanceof` checks.
const g = globalThis as { HTMLElement?: unknown };
if (typeof g.HTMLElement === "undefined") g.HTMLElement = class HTMLElement {};

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

function trigger(button: DOMRect, main: DOMRect | null, headerBottom = 57) {
  const header = { getBoundingClientRect: () => rect(main?.left ?? 0, 0, main?.width ?? 0, headerBottom) };
  const mainEl = main
    ? Object.assign(Object.create(HTMLElement.prototype), {
        getBoundingClientRect: () => main,
        querySelector: () => Object.assign(Object.create(HTMLElement.prototype), header),
      })
    : null;
  return { getBoundingClientRect: () => button, closest: () => mainEl } as unknown as HTMLElement;
}

const realWindow = globalThis.window;
afterEach(() => {
  (globalThis as { window?: unknown }).window = realWindow;
});

describe("the + panel stays in the work column", () => {
  test("with the side panel open, it ends at the column's edge, not the window's", () => {
    (globalThis as { window?: unknown }).window = { innerWidth: 1180, innerHeight: 820 };
    const layout = measureToolMenuLayout(trigger(rect(640, 380, 36, 36), rect(64, 0, 716, 820)));
    expect(layout.left).toBeGreaterThanOrEqual(64 + 16);
    expect(layout.left + layout.width).toBeLessThanOrEqual(780 - 16);
    expect(layout.width).toBe(544);
  });

  test("a column narrower than the panel shrinks it to fit", () => {
    (globalThis as { window?: unknown }).window = { innerWidth: 1024, innerHeight: 700 };
    const layout = measureToolMenuLayout(trigger(rect(130, 380, 36, 36), rect(64, 0, 500, 700)));
    expect(layout.width).toBe(500 - 32);
    expect(layout.left).toBe(80);
  });

  test("without a column the window is the bound, as before", () => {
    (globalThis as { window?: unknown }).window = { innerWidth: 1440, innerHeight: 900 };
    const layout = measureToolMenuLayout(trigger(rect(1300, 500, 36, 36), null));
    expect(layout.left + layout.width).toBeLessThanOrEqual(1440 - 16);
    expect(layout.width).toBe(544);
  });
});
