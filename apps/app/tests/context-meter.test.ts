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
  it("hides the reading but not the summarise button when there is no reading", () => {
    /*
      A gauge with no reading is worse than no gauge, because it looks like 0%. But the row used to vanish
      whole, taking the summarise button with it, and whether a percentage can be computed has nothing to do
      with whether the session can be summarised. In the dev build the pricing fetch fails on CORS, the
      percentage is unknown, and the only entry point to compaction disappeared with it.
    */
    expect(source).toContain("props.usedPercent === null && !props.onCompact");
    expect(source).toContain("props.usedPercent === null ? null : (");
  });

  it("shows context only - cost belongs on the turn that incurred it", () => {
    // A single running total here said nothing about WHICH turn was expensive, and sitting under the
    // composer it read as the cost of the message about to be sent.
    expect(source).not.toContain("sessionCost");
    expect(source).not.toContain("formatMessageCost");
  });

  it("warns before the ceiling rather than at it", () => {
    // Past these the next long turn is what triggers a summarisation, and someone about to paste a large
    // file should be able to see it coming.
    expect(source).toContain("(props.usedPercent ?? 0) >= 90");
    expect(source).toContain("(props.usedPercent ?? 0) >= 75");
  });

  it("sits inside the composer's own column, not against the window edge", () => {
    // Outside the centred wrapper it pinned itself to the far right of the SCREEN rather than under the
    // box it describes.
    const composer = readFileSync(
      fileURLToPath(
        new URL("../src/react-app/domains/session/surface/composer/composer.tsx", import.meta.url),
      ),
      "utf8",
    );
    // The column is the shared container now, so the meter is located against that instead of a class.
    const column = composer.indexOf("CHAT_COLUMN}");
    const meter = composer.indexOf("<ContextMeter");
    expect(column).toBeGreaterThan(-1);
    expect(meter).toBeGreaterThan(column);
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
