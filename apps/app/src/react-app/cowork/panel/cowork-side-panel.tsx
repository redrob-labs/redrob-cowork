/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { CoworkPanelFiles, CoworkFilePreview } from "./cowork-panel-files";
import { fileFromTarget } from "./cowork-files";
import { useCoworkConnection } from "../shell/cowork-connection";
import { prettyArtifactTitle } from "@/lib/artifacts";
import type { OpenTarget } from "../../domains/session/artifacts/open-target";
import { CoworkLiveDraft } from "./cowork-live-draft";
import { artifactPathMatches, useLiveDraftStore } from "./live-draft";

const ICON = { width: 15, height: 15, "aria-hidden": true };
/** How long a fully revealed draft waits for its real file before the list takes over (ms). */
const DRAFT_HANDOFF_TIMEOUT_MS = 4000;

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
 * One artifact row: type icon + name; clicking opens it on its own in the Artifacts tab (round 8,
 * via the frame store's openArtifact). The panel lives in the Cowork shell, OUTSIDE the session
 * surface's OpenTargetProvider, so the open-target hook would be a silent no-op here.
 */
function CoworkArtifactRow(props: { artifact: ArtifactItem }) {
  const openArtifact = useFrameStore((state) => state.openArtifact);
  const open = () => {
    if (!canOpenArtifact(props.artifact)) return;
    openArtifact(props.artifact.legacy_target.id);
  };
  return (
    <li>
      <button type="button" className="cowork-file-row" onClick={open}>
        <span className="cowork-file__icon">
          <ArtifactIcon className="size-4 text-muted-foreground" type={props.artifact.type} />
        </span>
        <span className="cowork-file-row__text">
          <b>{prettyArtifactTitle(props.artifact.path)}</b>
        </span>
      </button>
    </li>
  );
}

/**
 * Round 8 (M6): one artifact, shown as its output and nothing else - no frame, no folder or time
 * line, no "Written in the chat", no Office / folder buttons. The only control is "All artifacts",
 * back to the list. It reads the file the same way the Files tab previews do (CoworkFilePreview).
 */
function CoworkArtifactView(props: { target: OpenTarget; chatId: string; onBack: () => void }) {
  const client = useCoworkConnection((state) => state.client);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const file = useMemo(() => fileFromTarget(props.target, "", props.chatId), [props.chatId, props.target]);
  return (
    <div className="cowork-artifact-view">
      <button type="button" className="cowork-file__back" onClick={props.onBack}>
        {icons.arrowLeft({ width: 14, height: 14, "aria-hidden": true })}
        {t("cowork.artifacts_back")}
      </button>
      <div className="cowork-artifact-view__body">
        <CoworkFilePreview file={file} client={client} workspaceId={workspaceId} />
      </div>
    </div>
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
  // Round 7 C6: the file being written right now, revealed live above the list.
  const draft = useLiveDraftStore((state) => state.drafts[props.sessionKey] ?? null);
  const finishDraft = useLiveDraftStore((state) => state.finish);
  const openArtifact = useFrameStore((state) => state.openArtifact);
  const selectedId = useFrameStore((state) => state.panel.artifact ?? null);
  // Derived once per targets change, not on every panel render (the store re-renders this often).
  const artifacts = useMemo(
    () => getArtifactsFromMessages([], (targets ?? []).filter(isCollectibleArtifactTarget), { includeTargetFallbacks: true }),
    [targets],
  );
  // Hand-over: once the draft is fully revealed and settled, open the REAL file in its place as soon
  // as the workspace confirms it exists (the verified target can land a moment after the write).
  // If it never shows (a failed write, an unsupported type), fall back to the list after a pause.
  const [revealedCallId, setRevealedCallId] = useState<string | null>(null);
  useEffect(() => {
    if (!draft || revealedCallId !== draft.callId) return;
    const written = artifacts.find((artifact) => artifactPathMatches(artifact.path, draft.path) && canOpenArtifact(artifact));
    if (written) {
      finishDraft(props.sessionKey, draft.callId);
      openArtifact(written.legacy_target.id);
      return;
    }
    const timer = window.setTimeout(() => finishDraft(props.sessionKey, draft.callId), DRAFT_HANDOFF_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [artifacts, draft, finishDraft, openArtifact, props.sessionKey, revealedCallId]);

  if (draft) {
    return (
      <CoworkLiveDraft
        key={draft.callId}
        draft={draft}
        onDone={() => setRevealedCallId(draft.callId)}
      />
    );
  }

  const selected = selectedId ? (targets ?? []).find((target) => target.id === selectedId && isCollectibleArtifactTarget(target)) : null;
  if (selected) {
    return <CoworkArtifactView target={selected} chatId={props.sessionKey} onBack={() => openArtifact(null)} />;
  }

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
