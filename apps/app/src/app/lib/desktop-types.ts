// Type definitions for the desktop bridge.
// The payload shapes and the per-command contract live in
// packages/types/src/desktop-ipc.ts (shared with the Electron main process);
// this module re-exports them as the app-side import path.

import type { WorkspaceWire } from "@redrob/types/workspace";

export type {
  AppBuildInfo,
  BrandIconApplyResult,
  BrandIconState,
  CacheResetResult,
  DesktopBootstrapConfig,
  DesktopDistributionInfo,
  DesktopIntegrationIssue,
  DesktopIntegrationResult,
  DesktopIntegrationStatus,
  DesktopCommandArgs,
  DesktopCommandInvokers,
  DesktopCommandMap,
  DesktopCommandName,
  DesktopCommandResult,
  DesktopFetchInit,
  DesktopFetchResult,
  EngineDoctorResult,
  EngineInfo,
  EngineInstallResult,
  EvalRelaunchResult,
  ExecResult,
  LocalSkillCard,
  LocalSkillContent,
  NukeManifestPreview,
  NukeOptions,
  NukeReceipt,
  NukeReceiptError,
  OpencodeCommandDraft,
  OpencodeConfigFile,
  OpencodeExecutionEnvEntry,
  OpencodeExecutionSnapshot,
  RedrobDockerCleanupResult,
  RedrobServerInfo,
  SharedLanguageReading,
  UpdaterEnvironment,
  WorkspaceCreateInput,
  WorkspaceCreateRemoteInput,
  WorkspaceExportSummary,
  WorkspaceList,
  WorkspaceRedrobConfig,
  WorkspaceUpdateRemoteInput,
} from "@redrob/types/desktop-ipc";

// Canonical wire shape shared with redrob-server and the desktop bridge.
// Single source of truth: packages/types/src/workspace.ts.
export type WorkspaceInfo = WorkspaceWire;

// Window-control contract for the custom title bar (Windows/Linux). Mirrored
// from packages/types/src/desktop-ipc.ts (main.mjs `WINDOW_CONTROL_ACTIONS`),
// and owned here as the app-side definition so the title-bar UI stays
// self-contained — the framework-agnostic layer, like BrowserPanelTab below.
/** The actions `__windowControl` accepts. */
export type WindowControlAction = "minimize" | "toggleMaximize" | "close";

/** Whether the calling window is maximised or full screen, for the title bar's Maximise/Restore button. */
export type WindowState = { maximized: boolean; fullScreen: boolean };

// Browser tab state mirrored across the desktop IPC bridge. Owned here (the
// framework-agnostic layer); the session panel store re-exports it.
export type BrowserPanelTab = {
  id: string;
  type: "browser";
  label: string;
  url: string;
  favicon: string | null;
  /** `error`: the page did not load (the desktop app's `did-fail-load` on the main frame). */
  status: "loading" | "ready" | "error";
  canGoBack: boolean;
  canGoForward: boolean;
};
