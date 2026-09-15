import { describe, expect, test } from "bun:test";

import {
  filterSettingsTabs,
  matchesSettingsTab,
} from "../src/react-app/domains/settings/shell/settings-search";
import { getWorkspaceSettingsTabs } from "../src/react-app/domains/settings/shell/settings-tabs";

describe("matchesSettingsTab", () => {
  test("matches the translated label, which can differ from the tab id", () => {
    // `extensions` renders as "Library": an id-substring filter would miss it.
    expect(matchesSettingsTab("extensions", "library")).toBe(true);
    expect(matchesSettingsTab("ai", "providers")).toBe(true);
  });

  test("still matches the tab id", () => {
    expect(matchesSettingsTab("permissions", "permissions")).toBe(true);
  });

  test("matches words from the description", () => {
    // The description is what a user searching by intent types.
    expect(matchesSettingsTab("appearance", "appearance")).toBe(true);
  });

  test("rejects a query that matches nothing on the tab", () => {
    expect(matchesSettingsTab("appearance", "zzzznotathing")).toBe(false);
  });

  test("an empty query matches every tab", () => {
    expect(matchesSettingsTab("advanced", "  ")).toBe(true);
  });
});

describe("filterSettingsTabs", () => {
  test("keeps declared order and returns every tab for an empty query", () => {
    expect(filterSettingsTabs(getWorkspaceSettingsTabs(), "")).toEqual([
      "preferences",
      "permissions",
      "extensions",
      "advanced",
    ]);
  });

  test("narrows to the matching tabs", () => {
    expect(filterSettingsTabs(getWorkspaceSettingsTabs(), "permission")).toEqual(["permissions"]);
  });

  test("returns an empty list when nothing matches, so the group can hide", () => {
    expect(filterSettingsTabs(getWorkspaceSettingsTabs(), "zzzznotathing")).toEqual([]);
  });
});
