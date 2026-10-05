/** @jsxImportSource react */
import { useSyncExternalStore, type MouseEvent } from "react";
import { useHref } from "react-router";
import { AppShell, IconButton, ThemeSwitch, icons, type AppShellProps } from "@redrob-labs/ui";

import { getInitialThemeMode, setThemeMode, subscribeToTheme } from "../../../app/theme";
import { t } from "../../../i18n";
import { resolveExtensionIconSrc } from "../../design-system/extension-icon-src";
import { useFrameStore } from "../store/frame-store";
import { AccountMenu } from "./account-menu";
import { DeskFrameContext } from "./desk-frame";
import { buildDeskNav, type DeskNavId } from "./nav";
import { useDeskNavData } from "./use-desk-nav-data";

export type DeskShellProps = Pick<
  AppShellProps,
  "title" | "meta" | "actions" | "rail" | "foot" | "measure" | "aside" | "children"
> & {
  /** The menu place to mark as current. */
  current?: DeskNavId | null;
  /** The open chat, marked in Recent. */
  chatId?: string | null;
  /** The work fills the column edge to edge and scrolls itself (the chat). */
  fill?: boolean;
};

const MARK_SRC = resolveExtensionIconSrc("/redrob-mark.svg");

/**
 * The skip link targets `#rr-shell-main`. Under the HashRouter that hash is a route, so
 * following it would leave the screen; move focus to the work instead.
 */
function keepSkipLinkOnScreen(event: MouseEvent<HTMLDivElement>) {
  if (!(event.target instanceof Element) || !event.target.closest(".rr-shell__skip")) return;
  event.preventDefault();
  document.getElementById("rr-shell-main")?.focus();
}

/** The side panel button says what pressing it does. */
export function panelToggleLabel(open: boolean): string {
  return open ? t("desk.panel_close") : t("desk.panel_open");
}

/**
 * The frame around every Desk screen: the menu, the theme, the account menu after any
 * `aside` the screen brings, and the side panel button last in the header.
 */
export function DeskShell(props: DeskShellProps) {
  const panelOpen = useFrameStore((state) => state.panel.open);
  const togglePanel = useFrameStore((state) => state.togglePanel);
  // The app's theme store stays the source of truth; the switch only reflects and sets it.
  const themeMode = useSyncExternalStore(subscribeToTheme, getInitialThemeMode, getInitialThemeMode);
  const root = useHref("/").replace(/\/$/, "");
  const nav = buildDeskNav({
    ...useDeskNavData(),
    current: props.current,
    chatId: props.chatId,
    toHref: (path) => `${root}${path}`,
  });
  const panelLabel = panelToggleLabel(panelOpen);

  return (
    <DeskFrameContext value={true}>
      <div
        className={props.fill ? "desk-shell desk-shell--fill" : "desk-shell"}
        onClickCapture={keepSkipLinkOnScreen}
      >
        <AppShell
          mark={MARK_SRC}
          symbol={MARK_SRC}
          collapsible
          nav={nav}
          navLabel={t("desk.nav_label")}
          skipLabel={t("desk.skip_to_work")}
          collapseLabel={t("desk.fold_menu")}
          expandLabel={t("desk.open_menu")}
          theme={
            <ThemeSwitch
              size="sm"
              value={themeMode}
              onChange={setThemeMode}
              label={t("settings.theme_title")}
              labels={{
                system: t("settings.theme_system"),
                light: t("settings.theme_light"),
                dark: t("settings.theme_dark"),
              }}
            />
          }
          aside={
            <>
              {props.aside}
              <AccountMenu />
            </>
          }
          title={props.title}
          meta={props.meta}
          rail={props.rail}
          foot={props.foot}
          measure={props.measure}
          actions={
            <>
              {props.actions}
              <IconButton
                label={panelLabel}
                variant={panelOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={togglePanel}
              >
                {icons.panelRight({ width: 16, height: 16, "aria-hidden": true })}
              </IconButton>
            </>
          }
        >
          {props.children}
        </AppShell>
      </div>
    </DeskFrameContext>
  );
}
