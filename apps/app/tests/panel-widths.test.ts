import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const strip = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");

/**
 * The composer's model popover was 288px. Each row carries a model name, its vendor, a context figure, a
 * price band and a per-request estimate, and at that width the NAME truncated to a stub - `aion-la...` -
 * which is the one field the row exists to show.
 */
describe("composer model popover", () => {
  const source = strip(read("../src/components/model-select.tsx"));

  it("is wide enough for the model name", () => {
    expect(source).not.toContain("w-72 min-w-72");
    expect(source).toContain("w-[min(92vw,26rem)]");
  });

  it("is capped at the viewport, so a narrow window still gets a usable menu", () => {
    expect(source).toContain("92vw");
  });
});

/**
 * The provider connect dialog listed four facts per row - name, id, auth methods, status - stacked onto
 * three lines. Three lines times forty providers is a pile of cards rather than a list you can scan, and
 * the eye cannot compare a field down a column when the fields are not in columns.
 */
describe("provider connect dialog", () => {
  const source = strip(read("../src/react-app/domains/connections/provider-auth/provider-auth-modal.tsx"));

  it("overrides the primitive at lg, which is where DialogContent caps itself", () => {
    // A `sm:` override does not beat `lg:max-w-md` at large widths; both apply and the later wins.
    expect(source).toContain("lg:max-w-[min(94vw,58rem)]");
    expect(source).not.toContain("max-w-2xl");
  });

  it("puts each provider on one line, in columns", () => {
    // items-center, not items-start: the row is one line now.
    expect(source).toContain("group flex items-center gap-3.5");
    expect(source).not.toContain("group flex items-start gap-3.5");
    // Fixed columns for the fields that are the same width every row, slack to the name.
    expect(source).toContain("min-w-0 flex-1 truncate text-[14px]");
  });
});

/**
 * The `+` tool menu had a horizontal scrollbar.
 *
 * Two causes, both required. `min-w-0` on a flex child does NOT give `truncate` something to truncate
 * against - without `flex-1` the child still sizes to its content, so a long command description pushed
 * the row wider than the panel. And per CSS `overflow-x: visible` computes to `auto` when the other axis
 * is not visible, so `overflow-y-auto` alone produced the scrollbar as soon as anything overflowed
 * sideways.
 */
describe("composer tool menu", () => {
  const source = strip(read("../src/react-app/domains/session/surface/composer/composer.tsx"));

  it("gives every truncating row a basis to truncate against", () => {
    expect(source).not.toContain('<div className="min-w-0">');
  });

  it("refuses the horizontal axis outright", () => {
    expect(source).toContain("overflow-y-auto overflow-x-hidden p-2");
  });
});
