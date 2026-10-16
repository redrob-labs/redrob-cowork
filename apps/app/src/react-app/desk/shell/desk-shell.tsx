/** @jsxImportSource react */
import { useSyncExternalStore, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useHref } from "react-router";
import { AppShell, IconButton, ThemeSwitch, icons, type AppShellProps } from "@redrob-labs/ui";
import { TextSearch } from "lucide-react";

import { getInitialThemeMode, setThemeMode, subscribeToTheme } from "../../../app/theme";
import { t } from "../../../i18n";
import { resolveExtensionIconSrc } from "../../design-system/extension-icon-src";
import { DeskSidePanel } from "../panel/desk-side-panel";
import { useUiStateStore } from "../../shell/ui-state-store";
import { useFrameStore } from "../store/frame-store";
import { useSessionFindStore } from "../../domains/session/surface/find-store";
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
  /** Hide the shell's top header entirely (the empty new-chat home: no title, nothing to put there). */
  bareTop?: boolean;
  /**
   * Hide the shell's top header like `bareTop`, but WITHOUT the chat-home's overflow:visible override.
   * `bareTop` is scoped to the empty chat home, where it also opens the work subtree's overflow so an
   * upward status popover isn't clipped - correct there (no transcript to scroll), wrong for a tall
   * scrolling page like Trending AI, where it turned the scroll container off and clipped the lower
   * shelves. A screen that only wants the empty header gone keeps its own scroll with this instead.
   */
  headless?: boolean;
};

const MARK_SRC = resolveExtensionIconSrc("/brand/redrob/redrob-mark-blue.svg");

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

export function deskShellClassName(fill: boolean, panelOpen: boolean, bareTop = false, headless = false): string {
  return ["desk-shell", fill ? "desk-shell--fill" : null, panelOpen ? "desk-shell--panel" : null, bareTop ? "desk-shell--bare-top" : null, headless ? "desk-shell--headless" : null]
    .filter(Boolean)
    .join(" ");
}

/**
 * The frame around every Desk screen: the menu, the theme, the account menu after any
 * `aside` the screen brings, and the side panel button last in the header.
 */
export function DeskShell(props: DeskShellProps) {
  const panelOpen = useFrameStore((state) => state.panel.open);
  const togglePanel = useFrameStore((state) => state.togglePanel);
  return <DeskShellView {...props} panelOpen={panelOpen} onTogglePanel={togglePanel} />;
}

export type DeskShellViewProps = DeskShellProps & { panelOpen: boolean; onTogglePanel: () => void };

/**
 * `DeskShell` with the panel state passed in. While the panel is open it sits to the right
 * of the work and the screen's own rail steps aside for it.
 */
export function DeskShellView(props: DeskShellViewProps) {
  const { panelOpen } = props;
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
  // One sidebar state for every screen, so the title bar's toggle and Ctrl+B fold this menu too.
  const sidebarOpen = useUiStateStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStateStore((state) => state.setSidebarOpen);
  // The open chat publishes its header here (round 7, item 6) so the title + Find sit on the shell's
  // top row beside Invite and the side panel, instead of a second header row inside the chat column.
  const chatHeader = useFrameStore((state) => state.chatHeader);
  // Round 8, items 5 + 7: the sidebar is draggable (width from the store, clamped 220-420) and the
  // title-bar toggle fully hides it rather than leaving the DS 64px mini-rail.
  const sideWidth = useUiStateStore((state) => state.workspaceLeftSidebarWidth);
  const setSideWidth = useUiStateStore((state) => state.setWorkspaceLeftSidebarWidth);
  const setSideResizing = useUiStateStore((state) => state.setWorkspaceLeftSidebarResizing);
  const sideResizing = useUiStateStore((state) => state.workspaceLeftSidebarResizing);
  const startSideResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sideWidth;
    setSideResizing(true);
    const onMove = (move: PointerEvent) => setSideWidth(startWidth + (move.clientX - startX));
    const onUp = () => {
      setSideResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const shellClass = [
    deskShellClassName(Boolean(props.fill), panelOpen, Boolean(props.bareTop), Boolean(props.headless)),
    sidebarOpen ? null : "desk-shell--side-hidden",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <DeskFrameContext value={true}>
      <div
        className={shellClass}
        onClickCapture={keepSkipLinkOnScreen}
        style={{ "--app-side-width": `${sideWidth}px` } as CSSProperties}
      >
        {sidebarOpen ? (
          <div
            className="desk-shell__side-resizer"
            data-resizing={sideResizing ? "true" : undefined}
            style={{ left: `calc(${sideWidth}px - 4px)` }}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("desk.resize_sidebar")}
            onPointerDown={startSideResize}
          />
        ) : null}
        <AppShell
          mark={MARK_SRC}
          symbol={MARK_SRC}
          product="Redrob Cowork"
          collapsible
          collapsed={!sidebarOpen}
          onCollapsedChange={(collapsed) => setSidebarOpen(!collapsed)}
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
          title={chatHeader ? chatHeader.title : props.title}
          meta={props.meta}
          rail={panelOpen ? undefined : props.rail}
          foot={props.foot}
          measure={props.measure}
          actions={
            <>
              {props.actions}
              {chatHeader?.findSessionId ? (
                <IconButton
                  label={t("find.in_conversation")}
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    useSessionFindStore.getState().openFind({ sessionId: chatHeader.findSessionId as string })
                  }
                >
                  <TextSearch width={16} height={16} aria-hidden />
                </IconButton>
              ) : null}
              {/* Round 14, item C: the side-panel button belongs to a chat only. It is shown when a
                  chat has published its header (chatHeader), and hidden on Trending AI, Skills,
                  Projects and the other non-chat screens where there is no panel to open. */}
              {chatHeader ? (
                <IconButton
                  label={panelLabel}
                  variant={panelOpen ? "secondary" : "ghost"}
                  size="sm"
                  onClick={props.onTogglePanel}
                >
                  {icons.panelRight({ width: 16, height: 16, "aria-hidden": true })}
                </IconButton>
              ) : null}
            </>
          }
        >
          {props.children}
        </AppShell>
        {panelOpen ? <DeskSidePanel chatId={props.chatId ?? null} /> : null}
      </div>
    </DeskFrameContext>
  );
}
