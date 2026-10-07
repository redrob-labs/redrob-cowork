/** @jsxImportSource react */
import { useRef } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Menu, icons, type MenuItem } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { resolveExtensionIconSrc } from "../../design-system/extension-icon-src";
import { recheckRedrobKey } from "../../domains/billing/redrob-pay-sheet";
import { useFrameStore } from "../store/frame-store";

const MARK_SRC = resolveExtensionIconSrc("/redrob-mark.svg");

/** The build's version, the same one the feedback link reports. Empty in a bare test run. */
export const APP_VERSION = String(import.meta.env.VITE_REDROB_APP_VERSION ?? "").trim();

/** The settings screen the menu opens; `/settings/*` takes the tab after it. */
export const SETTINGS_PATH = "/settings/general";

/** Refetched after Settings changes the key, so the menu and Plan and usage say so at once. */
export const REDROB_KEY_QUERY_KEY: readonly string[] = ["desk", "redrob-key"];

/**
 * Whether Redrob Code holds the person's Redrob key: true or false once known, null while
 * the first answer is on its way. A server that cannot be reached counts as not connected.
 */
export function useRedrobKeyConnected(): boolean | null {
  const status = useQuery({
    queryKey: REDROB_KEY_QUERY_KEY,
    queryFn: recheckRedrobKey,
    retry: false,
    staleTime: 30_000,
  });
  if (status.isPending) return null;
  return status.data === true;
}

/** The line under the name. Nothing while the answer is still loading. */
export function connectionLine(connected: boolean | null): string | null {
  if (connected === null) return null;
  return connected ? t("desk.account_connected") : t("desk.account_not_connected");
}

export function versionLabel(version: string): string {
  return version ? t("desk.account_version", { version }) : t("desk.account_product");
}

export type AccountMenuActions = {
  version: string;
  developerMode: boolean;
  onSettings: () => void;
  onShortcuts: () => void;
  onFeedback: () => void;
  onDeveloperMode: (on: boolean) => void;
};

const ICON = { width: 14, height: 14, "aria-hidden": true };

/** Settings, Keyboard shortcuts, Send feedback, then the version and developer mode. No sign out: there is no account. */
export function accountMenuItems(actions: AccountMenuActions): MenuItem[] {
  return [
    { id: "settings", label: t("desk.account_settings"), icon: icons.settings(ICON), onSelect: actions.onSettings },
    { id: "shortcuts", label: t("desk.account_shortcuts"), icon: icons.keyboard(ICON), onSelect: actions.onShortcuts },
    { id: "feedback", label: t("desk.account_feedback"), icon: icons.comment(ICON), onSelect: actions.onFeedback },
    { id: "separator", type: "separator" },
    { id: "version", label: versionLabel(actions.version), disabled: true },
    {
      id: "developer-mode",
      label: actions.developerMode ? t("desk.developer_mode_off") : t("desk.developer_mode_on"),
      icon: icons.code(ICON),
      onSelect: () => actions.onDeveloperMode(!actions.developerMode),
    },
  ];
}

/** The trigger's face: the Redrob mark, the name, and whether the key is connected. */
export function AccountLabel(props: { connected: boolean | null }) {
  const line = connectionLine(props.connected);
  return (
    <span className="desk-account__label">
      <Avatar name={t("desk.account_name")} src={MARK_SRC} size="sm" />
      <span className="desk-account__text">
        <b>{t("desk.account_name")}</b>
        {line ? <span>{line}</span> : null}
      </span>
    </span>
  );
}

/** The foot of the sidebar: the one way into Settings, and the shortcuts and feedback dialogs. */
export function AccountMenu() {
  const navigate = useNavigate();
  const connected = useRedrobKeyConnected();
  const developerMode = useFrameStore((state) => state.developerMode);
  const setDeveloperMode = useFrameStore((state) => state.setDeveloperMode);
  const openModal = useFrameStore((state) => state.openModal);
  const showToast = useFrameStore((state) => state.showToast);
  const rootRef = useRef<HTMLDivElement>(null);

  // The chosen item leaves the page as the menu closes, so focus moves to the trigger
  // first: that is what the dialog remembers and hands focus back to.
  const openDialog = (kind: "keys" | "feedback") => {
    rootRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
    openModal({ kind });
  };

  const items = accountMenuItems({
    version: APP_VERSION,
    developerMode,
    onSettings: () => navigate(SETTINGS_PATH),
    onShortcuts: () => openDialog("keys"),
    onFeedback: () => openDialog("feedback"),
    onDeveloperMode: (on) => {
      setDeveloperMode(on);
      showToast(on ? t("desk.developer_mode_on_toast") : t("desk.developer_mode_off_toast"));
    },
  });
  const line = connectionLine(connected);

  return (
    <div className="desk-account" ref={rootRef}>
      <Menu
        variant="ghost"
        placement="up"
        align="left"
        ariaLabel={line ? t("desk.account_menu_label_status", { status: line }) : t("desk.account_menu_label")}
        label={<AccountLabel connected={connected} />}
        items={items}
      />
    </div>
  );
}
