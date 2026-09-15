/**
 * Settings tab metadata: which tabs exist, their icon, label, and description.
 *
 * Split out of `settings-page.tsx` so non-view code (the nav filter) can read a
 * tab's translated text without importing the settings view — that import
 * direction would be a cycle. Everything here is a function, never a
 * module-level constant: a label resolved at module load would freeze the
 * English string before the user's locale is known.
 */

import {
  BrainCircuit,
  Bug,
  Cog,
  FolderLock,
  Paintbrush,
  Puzzle,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
} from "lucide-react";

import { t } from "../../../../i18n";
import type { PlatformCapabilities } from "../../../../app/lib/platform-capabilities";
import type { SettingsTab } from "../../../../app/types";

export function getSettingsTabIcon(tab: SettingsTab) {
  switch (tab) {
    case "ai":
      return Zap;
    case "preferences":
      return SlidersHorizontal;
    case "permissions":
      return FolderLock;
    case "skills":
      return Sparkles;
    case "memory":
      return BrainCircuit;
    case "extensions":
      return Puzzle;
    case "environment":
      return Terminal;
    case "advanced":
      return Wrench;
    case "appearance":
      return Paintbrush;
    case "updates":
      return RefreshCcw;
    case "recovery":
      return ShieldCheck;
    case "debug":
      return Bug;
    default:
      return Cog;
  }
}

export function getSettingsTabLabel(tab: SettingsTab) {
  switch (tab) {
    case "ai":
      return t("settings.tab_ai");
    case "preferences":
      return t("settings.tab_preferences");
    case "permissions":
      return t("settings.tab_permissions");
    case "skills":
      return t("settings.tab_skills");
    case "memory":
      return t("memory.tab_label");
    case "extensions":
      return t("settings.tab_extensions");
    case "environment":
      return t("settings.tab_environment");
    case "advanced":
      return t("settings.tab_advanced");
    case "appearance":
      return t("settings.tab_appearance");
    case "updates":
      return t("settings.tab_updates");
    case "recovery":
      return t("settings.tab_recovery");
    case "debug":
      return t("settings.tab_debug");
    case "general":
      return t("settings.tab_general");
    default:
      return t("settings.tab_general");
  }
}

export function getSettingsTabDescription(tab: SettingsTab) {
  switch (tab) {
    case "ai":
      return t("settings.tab_description_ai");
    case "preferences":
      return t("settings.tab_description_preferences");
    case "permissions":
      return t("settings.tab_description_permissions");
    case "skills":
      return t("settings.tab_description_skills");
    case "memory":
      return t("memory.tab_description");
    case "extensions":
      return t("settings.tab_description_extensions");
    case "environment":
      return t("settings.tab_description_environment");
    case "advanced":
      return t("settings.tab_description_advanced");
    case "appearance":
      return t("settings.tab_description_appearance");
    case "updates":
      return t("settings.tab_description_updates");
    case "recovery":
      return t("settings.tab_description_recovery");
    case "debug":
      return t("settings.tab_description_debug");
    case "general":
      return t("settings.tab_description_general_overview");
    default:
      return t("settings.tab_description_general");
  }
}

export function getWorkspaceSettingsTabs(): SettingsTab[] {
  return ["preferences", "permissions", "extensions", "advanced"];
}

export function getGlobalSettingsTabs(
  developerMode: boolean,
  capabilities: Pick<PlatformCapabilities, "autoUpdate" | "localRuntimeControl">,
  memoryEnabled: boolean,
): SettingsTab[] {
  const tabs: SettingsTab[] = ["ai", "appearance", "environment"];
  if (memoryEnabled) tabs.push("memory");
  if (capabilities.autoUpdate) tabs.push("updates");
  if (capabilities.localRuntimeControl) tabs.push("recovery");
  if (developerMode) tabs.push("debug");
  return tabs;
}

export function isSettingsTabBeta(_tab: SettingsTab) {
  return false;
}

export function isSettingsTabActive(activeTab: SettingsTab, tab: SettingsTab) {
  return activeTab === tab;
}
