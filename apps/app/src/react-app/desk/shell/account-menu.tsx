/** @jsxImportSource react */
import { useRef } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { User } from "lucide-react";
import { Avatar, Menu, icons, type MenuItem } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { recheckRedrobKey } from "../../domains/billing/redrob-pay-sheet";
import { PROFILE_QUERY_KEY } from "../settings/profile-group";
import { useDeskConnection } from "./desk-connection";
import { useFrameStore } from "../store/frame-store";


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
    items.push({ id: "connect", label: t("desk.account_login"), icon: icons.settings(ICON), onSelect: actions.onConnect });
    items.push({ id: "connect-sep", type: "separator" });
  }
  items.push(
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
  );
  return items;
}

/** The trigger's face: when connected, the person's avatar + display name; when not, an empty avatar + a log-in prompt. */
export function AccountLabel(props: { connected: boolean | null; displayName: string | null }) {
  const line = connectionLine(props.connected);
  const name = props.displayName?.trim() || "";
  // Connected with a name -> that name; otherwise the log-in / sign-up prompt instead of the brand.
  const connected = props.connected === true;
  const title = connected && name ? name : t("desk.account_login");
  return (
    <span className="desk-account__label">
      {connected && name ? (
        // No profile photo exists in the data model, so a seeded initial-avatar stands in for the person.
        <Avatar name={name} seed={name} size="sm" />
      ) : (
        // Not connected: a neutral person-glyph placeholder (there is no profile yet).
        <span className="desk-account__avatar-placeholder" aria-hidden="true">
          <User size={16} strokeWidth={2} />
        </span>
      )}
      <span className="desk-account__text">
        <b>{title}</b>
        {line ? <span>{line}</span> : null}
      </span>
    </span>
  );
}

/** The foot of the sidebar: the one way into Settings, and the shortcuts and feedback dialogs. */
export function AccountMenu() {
  const navigate = useNavigate();
  const connected = useRedrobKeyConnected();
  const client = useDeskConnection((state) => state.client);
  const profile = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    enabled: Boolean(client),
    queryFn: () => (client ? client.getProfile() : Promise.resolve(null)),
    staleTime: 60_000,
  });
  const displayName = profile.data?.displayName ?? null;
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
    // "Log in or sign up": connecting a Redrob key/workspace lives in Settings.
    onConnect: () => navigate(SETTINGS_PATH),
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
        label={<AccountLabel connected={connected} displayName={displayName} />}
        items={items}
      />
    </div>
  );
}
