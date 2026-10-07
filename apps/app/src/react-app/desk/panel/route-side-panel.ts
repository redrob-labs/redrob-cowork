import type { SidePanelItem } from "../../shell/ui-state-store";
import type { FrameState, PanelTab } from "../store/frame-store";

/** What a session page request is about: the browser, or Files and maybe one file in it. */
export type SidePanelTarget = { tab: PanelTab; file?: string; toggle?: boolean };

export type FramePanelCommand =
  | { kind: "open"; tab: PanelTab }
  | { kind: "file"; id: string }
  | { kind: "toggle"; tab: PanelTab };

export const BROWSER_TARGET: SidePanelTarget = { tab: "browser" };
export const FILES_TARGET: SidePanelTarget = { tab: "files" };

/**
 * Inside the Desk frame the side panel is the frame's: a session page request for its old
 * panel becomes a frame store command. Voice, extensions and closing stay with the session
 * page (null), and outside the frame (`/extensions`) every request does.
 */
export function routeSidePanelRequest(
  panel: SidePanelItem | null,
  inFrame: boolean,
  target: SidePanelTarget = BROWSER_TARGET,
): FramePanelCommand | null {
  if (!inFrame || panel !== "panel") return null;
  if (target.toggle) return { kind: "toggle", tab: target.tab };
  if (target.file) return { kind: "file", id: target.file };
  return { kind: "open", tab: target.tab };
}

/** A toggle closes the panel when it already shows that tab, otherwise opens it there. */
export function applyFramePanelCommand(
  command: FramePanelCommand,
  frame: Pick<FrameState, "panel" | "openPanel" | "closePanel" | "openFile">,
) {
  if (command.kind === "file") frame.openFile(command.id);
  else if (command.kind === "open") frame.openPanel(command.tab);
  else if (frame.panel.open && frame.panel.tab === command.tab) frame.closePanel();
  else frame.openPanel(command.tab);
}
