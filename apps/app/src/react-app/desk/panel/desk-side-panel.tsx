/** @jsxImportSource react */
import type { ReactNode } from "react";
import { EmptyState, IconButton, icons } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { BrowserPanelTab, SessionPanelState } from "../../domains/session/panel/panel-tab-store";
import { getSidePanelSessionKey } from "../../domains/session/panel/side-panel-session";
import { getElectronBrowser } from "../../domains/session/panel/utils";
import { useFrameStore, type PanelTab } from "../store/frame-store";
import { DeskBrowser } from "./desk-browser";
import { DeskPanelFiles } from "./desk-panel-files";

const ICON = { width: 15, height: 15, "aria-hidden": true };

export function panelTitle(tab: PanelTab): string {
  return tab === "browser" ? t("desk.panel_browser") : t("desk.panel_files");
}

/** The header's one switch: to Files from the browser, to the browser from Files. */
export function panelSwitch(tab: PanelTab): { to: PanelTab; label: string; icon: ReactNode } {
  return tab === "browser"
    ? { to: "files", label: t("desk.panel_show_files"), icon: icons.folderOpen(ICON) }
    : { to: "browser", label: t("desk.panel_show_browser"), icon: icons.globe(ICON) };
}

/**
 * The browser tab the panel shows: the session's active tab when it is a page, otherwise
 * its first page. Artifact tabs belong to the old panel and never show here.
 */
export function panelBrowserTab(session: SessionPanelState): BrowserPanelTab | null {
  const active = session.tabs.find((tab) => tab.id === session.activeTabId);
  if (active?.type === "browser") return active;
  return session.tabs.find((tab): tab is BrowserPanelTab => tab.type === "browser") ?? null;
}

export type DeskSidePanelViewProps = {
  tab: PanelTab;
  onSwitch: (tab: PanelTab) => void;
  onClose: () => void;
  children?: ReactNode;
};

/**
 * The panel beside the work: a title, one button to switch, one to close, and the body.
 * No chooser and no tabs. Esc is left to dialogs, so it does not close the panel.
 */
export function DeskSidePanelView(props: DeskSidePanelViewProps) {
  const title = panelTitle(props.tab);
  const next = panelSwitch(props.tab);
  return (
    <aside className="desk-panel" aria-label={title}>
      <div className="desk-panel__top">
        <h2 className="desk-panel__title">{title}</h2>
        <div className="desk-panel__actions">
          <IconButton label={next.label} size="sm" onClick={() => props.onSwitch(next.to)}>
            {next.icon}
          </IconButton>
          <IconButton label={t("desk.panel_dismiss")} size="sm" onClick={props.onClose}>
            {icons.close(ICON)}
          </IconButton>
        </div>
      </div>
      <div className={props.tab === "browser" ? "desk-panel__body desk-panel__body--flush" : "desk-panel__body"}>
        {props.children}
      </div>
    </aside>
  );
}

/**
 * The app's built-in browser, in the Desk's own chrome (`DeskBrowser`): it reports its page
 * bounds so Electron lays the native page there, and hides that page when it unmounts (the
 * panel closing or switching to Files). Outside the desktop app there is no browser to show.
 */
function DeskPanelBrowser(props: { sessionKey: string }) {
  if (getElectronBrowser()) return <DeskBrowser sessionKey={props.sessionKey} />;
  return (
    <div className="desk-panel__empty">
      <EmptyState
        compact
        icon={icons.globe({ width: 20, height: 20, "aria-hidden": true })}
        title={t("desk.panel_browser_empty_title")}
        description={t("desk.panel_browser_desktop_only")}
      />
    </div>
  );
}

/**
 * The side panel, open on the frame store's tab. `chatId` scopes the browser tabs to the
 * open chat; with none they live under the app's no-session key, as in the old panel.
 */
export function DeskSidePanel(props: { chatId: string | null }) {
  const tab = useFrameStore((state) => state.panel.tab);
  const openPanel = useFrameStore((state) => state.openPanel);
  const closePanel = useFrameStore((state) => state.closePanel);
  return (
    <DeskSidePanelView tab={tab} onSwitch={openPanel} onClose={closePanel}>
      {tab === "browser" ? <DeskPanelBrowser sessionKey={getSidePanelSessionKey(props.chatId)} /> : <DeskPanelFiles chatId={props.chatId} />}
    </DeskSidePanelView>
  );
}
