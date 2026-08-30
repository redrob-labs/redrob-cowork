import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * The desktop shell paints two things of its own: the window it hands to the
 * renderer, and the shutdown screen it draws while local workers stop. That
 * screen is a standalone `data:` document, so it cannot read the renderer's
 * token layer and has to write the brand values out. This keeps the values it
 * writes the confirmed ones rather than whatever near-black was nearest, which
 * is what a user sees for the last second of every session.
 */
const ELECTRON_DIR = import.meta.dirname;
const MAIN = readFileSync(join(ELECTRON_DIR, "main.mjs"), "utf8");

/** Redrob primitives, the same values the app's `--rr-*` layer declares. */
const REDROB_BLACK = "#0a0b0c";
const REDROB_GRAY_1 = "#f8f9fb";
const REDROB_GRAY_5 = "#aab0bb";

function shutdownScreenStyles() {
  const screen = /function showShutdownScreen\(\)[\s\S]*?<\/style>/.exec(MAIN);
  assert.ok(screen, "the shutdown screen should still be drawn by showShutdownScreen");
  return screen[0];
}

test("the shutdown screen is painted in the brand's own dark values", () => {
  const styles = shutdownScreenStyles();

  assert.match(styles, new RegExp(`background: ${REDROB_BLACK}`), "the page is Redrob Black");
  assert.match(styles, new RegExp(`color: ${REDROB_GRAY_1}`), "primary text is Gray 1");
  assert.match(styles, new RegExp(`color: ${REDROB_GRAY_5}`), "secondary text is Gray 5");
});

test("the shutdown screen carries no off-brand grey", () => {
  const styles = shutdownScreenStyles();
  const allowed = new Set([REDROB_BLACK, REDROB_GRAY_1, REDROB_GRAY_5]);
  const found = [...styles.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0]);

  assert.ok(found.length > 0, "the screen should still declare colours");
  assert.deepEqual(
    found.filter((hex) => !allowed.has(hex)),
    [],
    "every colour on the shutdown screen is a Redrob primitive",
  );
});

test("the shutdown screen names the product typeface", () => {
  // The webfont cannot load into a data: document, so the stack names Pretendard
  // for machines that have it and falls back to the system UI face.
  assert.match(shutdownScreenStyles(), /font-family: Pretendard, -apple-system/);
});

test("the window frame stays transparent so the renderer owns the background", () => {
  // The renderer paints `--background` (Gray 1 or Gray 9) as the page. A shell
  // background colour would show through as a second, off-token surface during
  // resize, so the frame keeps the near-transparent value it already used.
  assert.match(MAIN, /backgroundColor: "#00000001"/);
});
