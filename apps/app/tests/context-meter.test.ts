import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The line under the composer, verified on screen at four fills before this was pinned: 12% and 62% read
 * quiet, 78% amber, 94% red, and a row with no known window shows the cost alone with no percentage.
 *
 * Source assertions, like the neighbouring suites - these are the thresholds and the refusal to invent a
 * number, and no test in this app mounts React.
 */
const source = readFileSync(
  fileURLToPath(new URL("../src/components/chat/context-meter.tsx", import.meta.url)),
  "utf8",
);

describe("context meter", () => {
  it("renders nothing when it knows neither half", () => {
    // A gauge with no reading is worse than no gauge: it looks like 0%.
    expect(source).toContain("if (props.usedPercent === null && !cost) return null");
  });

  it("warns before the ceiling rather than at it", () => {
    // Past these the next long turn is what triggers a summarisation, and someone about to paste a large
    // file should be able to see it coming.
    expect(source).toContain("props.usedPercent >= 90");
    expect(source).toContain("props.usedPercent >= 75");
  });

  it("omits the percentage rather than guessing when the window is unknown", () => {
    expect(source).toContain("{props.usedPercent === null ? null : (");
  });

  it("is its own module, so it can be mounted and looked at", () => {
    expect(source).toContain("export function ContextMeter");
    // The composer must consume it rather than keeping a private copy that drifts.
    const composer = readFileSync(
      fileURLToPath(
        new URL("../src/react-app/domains/session/surface/composer/composer.tsx", import.meta.url),
      ),
      "utf8",
    );
    expect(composer).toContain('from "@/components/chat/context-meter"');
    expect(composer).not.toContain("function ContextMeter(");
  });
});
