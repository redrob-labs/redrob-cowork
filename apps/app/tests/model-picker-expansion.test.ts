import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The model picker does not hide the only thing it has.
 *
 * This file used to pin `isProviderGroupExpanded`, a rule about when the provider ACCORDION was allowed
 * to hide models. That accordion is gone: it existed to keep a long provider list scannable, but the
 * shipping configuration has exactly one provider - the console brokers every model under one id - so it
 * was a lid over the whole dialog, and the rule was a patch on a structure that should not have been
 * there. The picker is now one table.
 *
 * What survives is the invariant the rule was protecting, stated against the structure that replaced it:
 * nothing between the reader and the models, no collapsed container, and the router pinned where it can
 * be seen rather than sorted in among several hundred alternatives.
 */
const source = readFileSync(
  fileURLToPath(new URL("../src/react-app/domains/session/modals/model-picker-modal.tsx", import.meta.url)),
  "utf8",
);

describe("the model picker does not hide the only thing it has", () => {
  it("has no collapsible provider container left to hide them", () => {
    expect(source).not.toContain("isProviderGroupExpanded");
    expect(source).not.toContain("ProviderAccordion");
    expect(source).not.toContain("expandedProviders");
    expect(source).not.toContain("ChevronRight");
  });

  it("renders a table rather than nested lists", () => {
    expect(source).toContain("<table");
    expect(source).toContain("<thead");
    expect(source).toContain("<tbody");
  });

  it("renders the pinned rows above the sorted ones", () => {
    // The order of these two blocks in the source IS the pin: `auto` is not sorted into `rest`.
    expect(source.indexOf("{auto.map(")).toBeGreaterThan(-1);
    expect(source.indexOf("{rest.map(")).toBeGreaterThan(source.indexOf("{auto.map("));
  });

  it("is wide enough for columns, and does not pad them away", () => {
    // Comments stripped: this file explains the old width while replacing it, and a rule that reads its
    // own commentary would fail on the sentence describing the fix.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*\/\//.test(line))
      .join("\n");
    // `max-w-lg` left room for a name and nothing else, which is why every fact went onto its own line.
    expect(code).not.toContain("max-w-lg");
    expect(code).toContain("max-w-[min(94vw,80rem)]");
    expect(code).toContain(" p-0 ");
  });

  it("offers a filter rail and sortable headers", () => {
    expect(source).toContain("SortHeader");
    expect(source).toContain("aria-sort");
    expect(source).toContain("FacetCheck");
  });
});
