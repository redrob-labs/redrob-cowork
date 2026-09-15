/**
 * Settings nav filtering.
 *
 * Menu items are `SettingsTab` ids whose visible text comes from `t()`, and the
 * label often diverges from the id (`extensions` renders as "Library", `ai` as
 * "AI Providers"). A filter must therefore match the TRANSLATED label and
 * description, not the id — and it must keep matching after the user switches
 * language. Both nav surfaces call this so they cannot drift.
 */

import type { SettingsTab } from "../../../../app/types";
import { getSettingsTabDescription, getSettingsTabLabel } from "./settings-tabs";

/** Text a settings query is matched against, for one tab. */
export function settingsTabHaystack(tab: SettingsTab): string {
  return [tab, getSettingsTabLabel(tab), getSettingsTabDescription(tab)].join(" ").toLowerCase();
}

/**
 * True when every whitespace-separated token in `query` appears in the tab's
 * label, description, or id. An empty query matches every tab.
 */
export function matchesSettingsTab(tab: SettingsTab, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = settingsTabHaystack(tab);
  return tokens.every((token) => haystack.includes(token));
}

/** Filter a group's tabs, preserving their declared order. */
export function filterSettingsTabs(tabs: readonly SettingsTab[], query: string): SettingsTab[] {
  if (!query.trim()) return [...tabs];
  return tabs.filter((tab) => matchesSettingsTab(tab, query));
}
