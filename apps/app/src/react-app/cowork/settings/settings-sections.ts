import type { SettingsTab } from "../../../app/types";
import { t } from "../../../i18n";
import type { DesktopNotificationPreference } from "../../kernel/desktop-notification-preferences";
import type { CoworkProjectClient } from "../shell/cowork-connection";

/** The three sections anyone sees: how Cowork behaves, the folders it may use, the AI and its cost. */
export const COWORK_SETTINGS_SECTIONS = ["general", "folders", "plan"] as const;
export type CoworkSettingsSection = (typeof COWORK_SETTINGS_SECTIONS)[number];

/** Where every unknown or refused settings address lands. */
export const COWORK_SETTINGS_HOME = "/settings/general";

/**
 * The developer pages linked from the section list while developer mode is on. They are the
 * existing settings pages, rendered by `SettingsRoute` with its own sidebar.
 */
export const DEVELOPER_SETTINGS_TABS: readonly SettingsTab[] = [
  "ai",
  "extensions",
  "preferences",
  "permissions",
  "appearance",
  "advanced",
  "environment",
  "updates",
  "recovery",
  "debug",
];

/** Every first segment `parseSettingsPath` reads as a developer page, the old aliases included. */
const DEVELOPER_SECTION_HEADS = new Set<string>([...DEVELOPER_SETTINGS_TABS, "memory", "connect", "skills", "mcp"]);

export type SettingsSectionRoute =
  | { kind: "cowork"; section: CoworkSettingsSection }
  | { kind: "developer" }
  | { kind: "redirect"; to: string };

function isCoworkSettingsSection(value: string): value is CoworkSettingsSection {
  return COWORK_SETTINGS_SECTIONS.some((section) => section === value);
}

/**
 * What `/settings/<section>` shows. The three Cowork sections always; a developer page only
 * while developer mode is on; anything else goes to General.
 */
export function resolveSettingsSection(section: string | null | undefined, developerMode: boolean): SettingsSectionRoute {
  const head = (section ?? "").trim().split("/")[0] ?? "";
  if (isCoworkSettingsSection(head)) return { kind: "cowork", section: head };
  if (developerMode && DEVELOPER_SECTION_HEADS.has(head)) return { kind: "developer" };
  return { kind: "redirect", to: COWORK_SETTINGS_HOME };
}

/** `/settings/general`, `/workspace/<id>/settings/plan`: the Cowork sections, inside the frame. */
export function isCoworkSettingsPath(pathname: string): boolean {
  return /^\/(workspace\/[^/]+\/)?settings\/(general|folders|plan)(\/|$)/.test(pathname);
}

export function settingsSectionPath(section: CoworkSettingsSection | SettingsTab): string {
  return `/settings/${section}`;
}

export function coworkSettingsSectionLabel(section: CoworkSettingsSection): string {
  switch (section) {
    case "general":
      return t("cowork.settings_general");
    case "folders":
      return t("cowork.settings_folders");
    case "plan":
      return t("cowork.settings_plan");
  }
}

export function coworkSettingsSectionLede(section: CoworkSettingsSection): string {
  switch (section) {
    case "general":
      return t("cowork.settings_general_lede");
    case "folders":
      return t("cowork.settings_folders_lede");
    case "plan":
      return t("cowork.settings_plan_lede");
  }
}

/** Text size, as the zoom factor the existing font zoom applies (Ctrl and plus, minus, zero). */
export const TEXT_SIZES = [
  { id: "small", zoom: 0.9 },
  { id: "default", zoom: 1 },
  { id: "large", zoom: 1.1 },
] as const;
export type TextSize = (typeof TEXT_SIZES)[number]["id"];

export function zoomForTextSize(size: TextSize): number {
  return TEXT_SIZES.find((entry) => entry.id === size)?.zoom ?? 1;
}

/** The nearest of the three, so a zoom set from the keyboard still reads as one of them. */
export function textSizeForZoom(zoom: number | null): TextSize {
  if (zoom === null || !Number.isFinite(zoom)) return "default";
  if (zoom < 0.95) return "small";
  if (zoom > 1.05) return "large";
  return "default";
}

export function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZES.some((entry) => entry.id === value);
}

export function textSizeLabel(size: TextSize): string {
  switch (size) {
    case "small":
      return t("cowork.settings_text_small");
    case "default":
      return t("cowork.settings_text_default");
    case "large":
      return t("cowork.settings_text_large");
  }
}

/**
 * "Tell me when a long task finishes" is the desktop notification preference set to every
 * event: a finished task is a routine notice, which "important only" never sends.
 */
export function notifiesWhenDone(preference: DesktopNotificationPreference): boolean {
  return preference === "all";
}

export function notificationPreference(on: boolean): DesktopNotificationPreference {
  return on ? "all" : "off";
}

/** A folder by its name and its place in plain words. Never the path. */
export type FolderPlace = { name: string; where: string };

/** `C:\Users\<name>`, `/Users/<name>`, `/home/<name>`: the user folder, when the computer's is not known. */
const HOME_PATTERN = /^(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/]+/i;

function segments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}

export function folderPlace(path: string, home?: string | null): FolderPlace {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  const parts = segments(trimmed);
  const drive = /^([A-Za-z]):/.exec(trimmed)?.[1]?.toUpperCase() ?? null;
  const name = parts[parts.length - 1] ?? trimmed;

  const homeRoot = home?.trim() || HOME_PATTERN.exec(trimmed)?.[0] || "";
  const homeParts = segments(homeRoot);
  const insideHome =
    homeParts.length > 0 &&
    homeParts.length < parts.length &&
    homeParts.every((part, index) => part.toLowerCase() === parts[index]?.toLowerCase());
  if (insideHome) {
    const rest = parts.slice(homeParts.length);
    const parent = rest[rest.length - 2];
    return { name, where: parent ? t("cowork.settings_folder_in", { folder: parent }) : t("cowork.settings_folder_in_home") };
  }

  if (drive) {
    if (parts.length <= 1) return { name: t("cowork.settings_folder_drive_name", { drive }), where: t("cowork.settings_folder_on_computer") };
    return { name, where: t("cowork.settings_folder_on_drive", { drive }) };
  }

  const parent = parts[parts.length - 2];
  return { name, where: parent ? t("cowork.settings_folder_in", { folder: parent }) : t("cowork.settings_folder_on_computer") };
}

export type RemoveFolderDeps = {
  /** Null in the preview, where only the list on screen changes. */
  client: Pick<CoworkProjectClient, "setAuthorizedFolders"> | null;
  workspaceId: string | null;
  folders: readonly string[];
  showToast: (title: string, text?: string) => void;
};

/** Takes Cowork's access to one folder away, says so, and answers the folders left. */
export async function removeFolder(deps: RemoveFolderDeps, folder: string): Promise<string[]> {
  const rest = deps.folders.filter((entry) => entry !== folder);
  if (deps.client && deps.workspaceId) await deps.client.setAuthorizedFolders(deps.workspaceId, rest);
  deps.showToast(t("cowork.settings_folder_removed"), t("cowork.settings_folder_removed_text", { name: folderPlace(folder).name }));
  return rest;
}
