/** @jsxImportSource react */
import { useMemo, type ReactNode } from "react";
import { EmptyState, IconButton, icons } from "@redrob-labs/ui";

import { ArtifactIcon } from "@/components/chat/artifact-icon";
import { getArtifactsFromMessages, type ArtifactItem, canOpenArtifact } from "@/lib/artifacts";
import { usePanelTabStore } from "../../domains/session/panel/panel-tab-store";
import { isCollectibleArtifactTarget } from "../../domains/session/artifacts/open-target";

import { t } from "../../../i18n";
import { getSidePanelSessionKey } from "../../domains/session/panel/side-panel-session";
import { getElectronBrowser } from "../../domains/session/panel/utils";
import { useFrameStore, type PanelTab } from "../store/frame-store";
import { CoworkBrowser } from "./cowork-browser";
import { CoworkPanelFiles } from "./cowork-panel-files";

const ICON = { width: 15, height: 15, "aria-hidden": true };

/** The panel's three tabs, left to right: this chat's artifacts, the workspace files, the in-app browser. */
const PANEL_TABS: readonly PanelTab[] = ["artifacts", "files", "browser"];

/** The human label for a tab, used as the icon button's accessible name + hover title. */
export function panelTabLabel(tab: PanelTab): string {
  if (tab === "artifacts") return t("cowork.panel_artifacts");
  if (tab === "browser") return t("cowork.panel_browser");
  return t("cowork.panel_files");
}

/** The glyph for a tab: sparkle for artifacts, folder for files, globe for the browser. */
function panelTabIcon(tab: PanelTab): ReactNode {
  if (tab === "artifacts") return icons.sparkle(ICON);
  if (tab === "browser") return icons.globe(ICON);
  return icons.folderOpen(ICON);
}

export type CoworkSidePanelViewProps = {
  tab: PanelTab;
  onSwitch: (tab: PanelTab) => void;
  onClose: () => void;
  children?: ReactNode;
};

/**
 * The panel beside the work: a header with three left-aligned tabs (Artifacts, Files, Browser)
 * and a close button, then the body. The header row is 48px with a bottom border so its rule
 * lines up with the shell top bar across the seam (see .cowork-panel__top). Esc is left to
 * dialogs, so it does not close the panel.
 */
export function CoworkSidePanelView(props: CoworkSidePanelViewProps) {
  return (
    <aside className="cowork-panel" aria-label={panelTabLabel(props.tab)}>
      <div className="cowork-panel__top">
        {/* Left-aligned icon tabs: one glyph per tab; the label rides as the hover title
            (IconButton sets title + aria-label from `label`). Active tab is tinted. */}
        <div className="cowork-panel__tabs" role="tablist" aria-label={t("cowork.panel_artifacts")}>
          {PANEL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={props.tab === tab}
              aria-label={panelTabLabel(tab)}
              title={panelTabLabel(tab)}
              className="cowork-panel__tab"
              data-active={props.tab === tab ? "" : undefined}
              onClick={() => props.onSwitch(tab)}
            >
              {panelTabIcon(tab)}
            </button>
          ))}
        </div>
        <div className="cowork-panel__actions">
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
 * panel closing or switching away). Outside the desktop app there is no browser to show.
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
 * One artifact row: type icon + name; clicking opens it in the panel's file view. The panel lives
 * in the Cowork shell, OUTSIDE the session surface's OpenTargetProvider, so the open-target hook
 * would be a silent no-op here; the frame store's openFile (the same path a chat file chip takes)
 * is the one that works.
 */
function CoworkArtifactRow(props: { artifact: ArtifactItem }) {
  const openFile = useFrameStore((state) => state.openFile);
  const open = () => {
    if (!canOpenArtifact(props.artifact)) return;
    openFile(props.artifact.legacy_target.id);
  };
  return (
    <li>
      <button type="button" className="cowork-file-row" onClick={open} title={props.artifact.path}>
        <span className="cowork-file__icon">
          <ArtifactIcon className="size-4 text-muted-foreground" type={props.artifact.type} />
        </span>
        <span className="cowork-file-row__text">
          <b>{props.artifact.name}</b>
        </span>
      </button>
    </li>
  );
}

/**
 * The Artifacts tab (round 2, item 3b): a list of the artifacts this chat has produced, newest
 * first. It reads the transcript artifact targets the session surface already syncs into the
 * panel-tab store (no new data plumbing), so it needs only the chat's session key. Each row opens
 * the artifact through the existing open-target flow. Empty chats show an empty state, mirroring
 * the Files tab.
 */
function CoworkPanelArtifacts(props: { sessionKey: string }) {
  const targets = usePanelTabStore((state) => state.transcriptArtifactTargets[props.sessionKey]);
  // Derived once per targets change, not on every panel render (the store re-renders this often).
  const artifacts = useMemo(
    () => getArtifactsFromMessages([], (targets ?? []).filter(isCollectibleArtifactTarget), { includeTargetFallbacks: true }),
    [targets],
  );

  if (artifacts.length === 0) {
    return (
      <div className="cowork-panel__empty">
        <EmptyState
          compact
          icon={icons.sparkle({ width: 20, height: 20, "aria-hidden": true })}
          title={t("cowork.panel_artifacts_empty_title")}
          description={t("cowork.panel_artifacts_empty_text")}
        />
      </div>
    );
  }

  return (
    <div className="cowork-files">
      <ul className="cowork-files__list">
        {artifacts.map((artifact) => (
          <CoworkArtifactRow key={artifact.id} artifact={artifact} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The side panel, open on the frame store's tab. `chatId` scopes the artifacts and browser tabs
 * to the open chat; with none they live under the app's no-session key.
 */
export function CoworkSidePanel(props: { chatId: string | null }) {
  const tab = useFrameStore((state) => state.panel.tab);
  const openPanel = useFrameStore((state) => state.openPanel);
  const closePanel = useFrameStore((state) => state.closePanel);
  const sessionKey = getSidePanelSessionKey(props.chatId);
  return (
    <CoworkSidePanelView tab={tab} onSwitch={openPanel} onClose={closePanel}>
      {tab === "artifacts" ? (
        <CoworkPanelArtifacts sessionKey={sessionKey} />
      ) : tab === "browser" ? (
        <CoworkPanelBrowser sessionKey={sessionKey} />
      ) : (
        <CoworkPanelFiles chatId={props.chatId} />
      )}
    </CoworkSidePanelView>
  );
}
