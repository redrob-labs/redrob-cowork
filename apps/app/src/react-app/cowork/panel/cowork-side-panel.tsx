/** @jsxImportSource react */
import type { ReactNode } from "react";
import { EmptyState, IconButton, icons } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { getSidePanelSessionKey } from "../../domains/session/panel/side-panel-session";
import { getElectronBrowser } from "../../domains/session/panel/utils";
import { useFrameStore, type PanelTab } from "../store/frame-store";
import { CoworkBrowser } from "./cowork-browser";
import { CoworkPanelFiles } from "./cowork-panel-files";

const ICON = { width: 15, height: 15, "aria-hidden": true };

export function panelTitle(tab: PanelTab): string {
  return tab === "browser" ? t("cowork.panel_browser") : t("cowork.panel_files");
}

/** The header's one switch: to Files from the browser, to the browser from Files. */
export function panelSwitch(tab: PanelTab): { to: PanelTab; label: string; icon: ReactNode } {
  return tab === "browser"
    ? { to: "files", label: t("cowork.panel_show_files"), icon: icons.folderOpen(ICON) }
    : { to: "browser", label: t("cowork.panel_show_browser"), icon: icons.globe(ICON) };
}

export type CoworkSidePanelViewProps = {
  tab: PanelTab;
  onSwitch: (tab: PanelTab) => void;
  onClose: () => void;
  children?: ReactNode;
};

/**
 * The panel beside the work: a title, one button to switch, one to close, and the body.
 * No chooser and no tabs. Esc is left to dialogs, so it does not close the panel.
 */
export function CoworkSidePanelView(props: CoworkSidePanelViewProps) {
  const title = panelTitle(props.tab);
  const next = panelSwitch(props.tab);
  return (
    <aside className="cowork-panel" aria-label={title}>
      <div className="cowork-panel__top">
        <h2 className="cowork-panel__title">{title}</h2>
        <div className="cowork-panel__actions">
          <IconButton label={next.label} size="sm" onClick={() => props.onSwitch(next.to)}>
            {next.icon}
          </IconButton>
          <IconButton label={t("cowork.panel_dismiss")} size="sm" onClick={props.onClose}>
            {icons.close(ICON)}
          </IconButton>
        </div>
      </div>
      <div className={props.tab === "browser" ? "cowork-panel__body cowork-panel__body--flush" : "cowork-panel__body"}>
        {props.children}
      </div>
    </aside>
  );
}

/**
 * The app's built-in browser, in the Cowork's own chrome (`CoworkBrowser`): it reports its page
 * bounds so Electron lays the native page there, and hides that page when it unmounts (the
 * panel closing or switching to Files). Outside the desktop app there is no browser to show.
 */
function CoworkPanelBrowser(props: { sessionKey: string }) {
  if (getElectronBrowser()) return <CoworkBrowser sessionKey={props.sessionKey} />;
  return (
    <div className="cowork-panel__empty">
      <EmptyState
        compact
        icon={icons.globe({ width: 20, height: 20, "aria-hidden": true })}
        title={t("cowork.panel_browser_empty_title")}
        description={t("cowork.panel_browser_desktop_only")}
      />
    </div>
  );
}

/**
 * The side panel, open on the frame store's tab. `chatId` scopes the browser tabs to the
 * open chat; with none they live under the app's no-session key, as in the old panel.
 */
export function CoworkSidePanel(props: { chatId: string | null }) {
  const tab = useFrameStore((state) => state.panel.tab);
  const openPanel = useFrameStore((state) => state.openPanel);
  const closePanel = useFrameStore((state) => state.closePanel);
  return (
    <CoworkSidePanelView tab={tab} onSwitch={openPanel} onClose={closePanel}>
      {tab === "browser" ? <CoworkPanelBrowser sessionKey={getSidePanelSessionKey(props.chatId)} /> : <CoworkPanelFiles chatId={props.chatId} />}
    </CoworkSidePanelView>
  );
}
