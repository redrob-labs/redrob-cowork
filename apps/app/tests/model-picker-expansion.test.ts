import { describe, expect, it } from "bun:test";

import { isProviderGroupExpanded } from "@/react-app/domains/session/modals/model-picker-modal";

/**
 * When the model picker's provider accordion is allowed to hide anything.
 *
 * It exists to keep a long list of providers scannable, and it earns that only when there is more than
 * one provider. With a single provider - which is the shipping configuration, since the console brokers
 * every model under one provider id - a collapsed group is a lid over the entire contents of the
 * dialog: the user opens "Models", sees one closed row, and has to click it to reach the only thing the
 * dialog is for.
 *
 * A live search is the same argument from the other side: the user has already said what they want, and
 * a match hidden behind a closed group is a match they cannot see.
 */
describe("the model picker does not hide the only thing it has", () => {
  const none = new Set<string>();

  it("keeps a lone provider open, whatever the collapse state says", () => {
    expect(
      isProviderGroupExpanded({ groupId: "redrob", expandedIds: none, groupCount: 1, query: "" }),
    ).toBe(true);
  });

  it("opens every group while a search is running", () => {
    expect(
      isProviderGroupExpanded({ groupId: "openai", expandedIds: none, groupCount: 4, query: "opus" }),
    ).toBe(true);
  });

  it("treats a whitespace-only query as no search", () => {
    // Otherwise a stray space would silently expand everything and the accordion would look broken.
    expect(
      isProviderGroupExpanded({ groupId: "openai", expandedIds: none, groupCount: 4, query: "   " }),
    ).toBe(false);
  });

  it("honours the user's own toggle when there are several providers and no search", () => {
    const expanded = new Set(["anthropic"]);
    expect(
      isProviderGroupExpanded({ groupId: "anthropic", expandedIds: expanded, groupCount: 4, query: "" }),
    ).toBe(true);
    expect(
      isProviderGroupExpanded({ groupId: "openai", expandedIds: expanded, groupCount: 4, query: "" }),
    ).toBe(false);
  });

  it("keeps a zero-group case open rather than falling through to closed", () => {
    // Defensive: an empty list renders the empty state, but the predicate must not claim "collapsed"
    // for a group that does not exist.
    expect(
      isProviderGroupExpanded({ groupId: "redrob", expandedIds: none, groupCount: 0, query: "" }),
    ).toBe(true);
  });
});
