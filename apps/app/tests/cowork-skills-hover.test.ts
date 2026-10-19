import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../src/app/index.css"), "utf8").replace(/\r\n/g, "\n");

/** Every declaration block whose selector list contains `selector` exactly (comments stripped). */
function blocks(selector: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of clean.matchAll(re)) {
    const selectors = (match[1] ?? "").split(",").map((part) => part.trim());
    if (selectors.includes(selector)) out.push(match[2] ?? "");
  }
  return out;
}

function reducedMotion(): string {
  const start = css.indexOf("Round 10: no lift at all under reduced motion");
  expect(start).toBeGreaterThan(-1);
  return css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)", start), css.indexOf("}\n}", start) + 3);
}

describe("round 10 skill tile hover", () => {
  test("the tile itself never gets a hover background, frame or transform", () => {
    for (const body of blocks(".cowork-skill-tile:hover")) {
      expect(body).not.toMatch(/background|border|transform|box-shadow/);
    }
    for (const body of blocks(".cowork-skill-tile")) expect(body).not.toMatch(/transition/);
  });

  test("only the circle lifts 2px with a deeper shadow, like the album covers", () => {
    const hover = blocks(".cowork-skill-tile:hover .cowork-skill-icon").join("\n");
    expect(hover).toContain("translateY(-2px)");
    expect(hover).toContain("0 12px 28px -16px");
    const icon = blocks(".cowork-skill-icon").join("\n");
    expect(icon).toContain("transform var(--duration-fast, 150ms) var(--easing-standard, ease)");
    // No press scale and no text lift.
    expect(blocks(".cowork-skill-tile:active .cowork-skill-icon")).toEqual([]);
    expect(blocks(".cowork-skill-tile:hover .cowork-skill-tile__title")).toEqual([]);
  });

  test("reduced motion removes the lift", () => {
    const block = reducedMotion();
    expect(block).toContain(".cowork-skill-tile:hover .cowork-skill-icon { transform: none; }");
    expect(block).toContain("transition: none");
  });
});
