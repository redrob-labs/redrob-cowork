/** @jsxImportSource react */
import { useRef } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu, icons, type MenuItem } from "@redrob-labs/ui";

import { SecureConnectionAvatar } from "../../../components/ui/secure-connection-avatar/SecureConnectionAvatar";

import { t } from "../../../i18n";
import { recheckRedrobKeyStatus } from "../../domains/billing/redrob-pay-sheet";
import { useFrameStore } from "../store/frame-store";

/** The build's version, the same one the feedback link reports. Empty in a bare test run. */
export const APP_VERSION = String(import.meta.env.VITE_REDROB_APP_VERSION ?? "").trim();

/** The settings screen the menu opens; `/settings/*` takes the tab after it. */
export const SETTINGS_PATH = "/settings/general";

/** Refetched after Settings changes the key, so the menu and Plan and usage say so at once. */
export const REDROB_KEY_QUERY_KEY: readonly string[] = ["cowork", "redrob-key"];

/**
 * Whether Redrob Code holds the person's Redrob key: true or false once known, null while
 * the first answer is on its way. A server that cannot be reached counts as not connected.
 */
export function useRedrobKeyConnected(): boolean | null {
  const status = useRedrobKeyStatus();
  return status === null ? null : status.connected;
}

/** What the key is: this app's own, the one Redrob Launcher signed the computer in with, or none. */
export type RedrobKeyLink = "own" | "launcher" | "none";

/** Same query as `useRedrobKeyConnected`, keeping where the key came from. Null while loading. */
export function useRedrobKeyStatus(): { connected: boolean; link: RedrobKeyLink } | null {
  const status = useQuery({
    queryKey: REDROB_KEY_QUERY_KEY,
    queryFn: recheckRedrobKeyStatus,
    retry: false,
    staleTime: 30_000,
  });
  if (status.isPending) return null;
  const connected = status.data?.connected === true;
  return { connected, link: !connected ? "none" : status.data?.source === "launcher" ? "launcher" : "own" };
}

/** The line under the name. Nothing while the answer is still loading. */
export function connectionLine(connected: boolean | null, link: RedrobKeyLink = connected ? "own" : "none"): string | null {
  if (connected === null) return null;
  if (!connected) return t("cowork.account_not_connected");
  return link === "launcher" ? t("cowork.account_launcher") : t("cowork.account_connected");
}

export function versionLabel(version: string): string {
  return version ? t("cowork.account_version", { version }) : t("cowork.account_product");
}

export type AccountMenuActions = {
  version: string;
  developerMode: boolean;
  /** True once a Redrob key is connected; when false, the menu offers a log-in / sign-up entry. */
  connected: boolean | null;
  onSettings: () => void;
  onConnect: () => void;
  onShortcuts: () => void;
  onFeedback: () => void;
  onDeveloperMode: (on: boolean) => void;
};

const ICON = { width: 14, height: 14, "aria-hidden": true };

/** Settings, Keyboard shortcuts, Send feedback, then the version and developer mode. No sign out: there is no account. */
export function accountMenuItems(actions: AccountMenuActions): MenuItem[] {
  const items: MenuItem[] = [];
  // When no Redrob key is connected, the first thing offered is the way to connect one.
  if (actions.connected === false) {
    items.push({ id: "connect", label: t("cowork.account_login"), icon: icons.settings(ICON), onSelect: actions.onConnect });
    items.push({ id: "connect-sep", type: "separator" });
  }
  items.push(
    { id: "settings", label: t("cowork.account_settings"), icon: icons.settings(ICON), onSelect: actions.onSettings },
    { id: "shortcuts", label: t("cowork.account_shortcuts"), icon: icons.keyboard(ICON), onSelect: actions.onShortcuts },
    { id: "feedback", label: t("cowork.account_feedback"), icon: icons.comment(ICON), onSelect: actions.onFeedback },
    { id: "separator", type: "separator" },
    { id: "version", label: versionLabel(actions.version), disabled: true },
    {
      id: "developer-mode",
      label: actions.developerMode ? t("cowork.developer_mode_off") : t("cowork.developer_mode_on"),
      icon: icons.code(ICON),
      onSelect: () => actions.onDeveloperMode(!actions.developerMode),
    },
  );
  return items;
}

/** The trigger's face: when connected, the Redrob mark and the name; when not, an empty avatar and a log-in prompt. */
export function AccountLabel(props: { connected: boolean | null; link?: RedrobKeyLink }) {
  const line = connectionLine(props.connected, props.link);
  const connected = props.connected === true;
  const title = connected ? t("cowork.account_name") : t("cowork.account_login");
  return (
    <span className="cowork-account__label">
      {/*
        Round 32: the avatar is always a neutral person glyph -- there is no personal
        account, so a brand mark here read as "this is you". The empty-profile icon
        reads correctly as a placeholder whether or not a Redrob key is connected.
      */}
      <span className="cowork-account__avatar-placeholder" aria-hidden="true">
        {/*
          The storm "thinking" avatar fills the 32x32 circular placeholder; the wrapper's
          border-radius + overflow clip it to a circle, and the background stays
          var(--surface-sunken) (size + background unchanged). The wrapper falls back to the
          neutral User glyph under reduced motion or when custom elements are unsupported.
        */}
        <SecureConnectionAvatar label={title} />
      </span>
      <span className="cowork-account__text">
        <b>{title}</b>
        {line ? <span>{line}</span> : null}
      </span>
    </span>
  );
}

/** The foot of the sidebar: the one way into Settings, and the shortcuts and feedback dialogs. */
export function AccountMenu() {
  const navigate = useNavigate();
  const status = useRedrobKeyStatus();
  const connected = status === null ? null : status.connected;
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
    connected,
    onSettings: () => navigate(SETTINGS_PATH),
    // "Log in or sign up": connecting a Redrob key lives in Settings.
    onConnect: () => navigate(SETTINGS_PATH),
    onShortcuts: () => openDialog("keys"),
    onFeedback: () => openDialog("feedback"),
    onDeveloperMode: (on) => {
      setDeveloperMode(on);
      showToast(on ? t("cowork.developer_mode_on_toast") : t("cowork.developer_mode_off_toast"));
    },
  });
  const line = connectionLine(connected, status?.link);

  return (
    <div className="cowork-account" ref={rootRef}>
      <Menu
        variant="ghost"
        placement="up"
        align="left"
        ariaLabel={line ? t("cowork.account_menu_label_status", { status: line }) : t("cowork.account_menu_label")}
        label={<AccountLabel connected={connected} link={status?.link} />}
        items={items}
      />
    </div>
  );
}
