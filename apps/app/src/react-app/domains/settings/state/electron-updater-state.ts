/** @jsxImportSource react */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type { ReleaseChannel } from "../../../../app/types";
import { isElectronRuntime, safeStringify } from "../../../../app/utils";
import { t } from "../../../../i18n";
import { useUpdateCheckRequestStore } from "./update-check-request";

export type SettingsUpdateStatus = {
  state: "idle" | "checking" | "available" | "blocked" | "downloading" | "ready" | "error";
  lastCheckedAt?: number | null;
  version?: string;
  date?: string;
  notes?: string;
  totalBytes?: number | null;
  downloadedBytes?: number;
  message?: string;
  failedAction?: "check" | "download" | "install";
} | null;

type ElectronUpdaterBridge = NonNullable<Window["__REDROB_ELECTRON__"]>["updater"] & {
  onDownloadProgress?: (callback: (data: { transferred: number; total: number; percent: number; bytesPerSecond: number }) => void) => (() => void);
};

declare global {
  interface Window {
    __redrobUpdaterEvalBridge?: ElectronUpdaterBridge;
  }
}

type UseElectronUpdaterStateOptions = {
  releaseChannel: ReleaseChannel;
  onReleaseChannelChange: (next: ReleaseChannel) => void;
  updateAutoCheck: boolean;
  updateAutoDownload: boolean;
  setError: (message: string | null) => void;
};

export type ElectronUpdaterEnvState = {
  appVersion: string | null;
  updateEnv: { supported?: boolean; reason?: string | null } | null;
};

export const ELECTRON_UPDATER_UNSUPPORTED_REASON = "settings.electron_updater_bridge_unavailable";

function electronUpdaterUnsupportedReason() {
  return t("settings.electron_updater_bridge_unavailable");
}

export function unsupportedElectronUpdaterEnvState(): ElectronUpdaterEnvState {
  return {
    appVersion: null,
    updateEnv: { supported: false, reason: ELECTRON_UPDATER_UNSUPPORTED_REASON },
  };
}

export function shouldScheduleElectronUpdateAutoCheck(input: {
  updateAutoCheck: boolean;
  updateEnv: ElectronUpdaterEnvState["updateEnv"];
  autoCheckKey: string | null;
  nextAutoCheckKey: string;
}) {
  return input.updateAutoCheck &&
    input.updateEnv?.supported !== false &&
    input.autoCheckKey !== input.nextAutoCheckKey;
}

type ElectronUpdaterEnvAction =
  | { type: "app-version"; appVersion: string | null }
  | { type: "unsupported"; reason: string };

function electronUpdaterEnvReducer(
  state: ElectronUpdaterEnvState,
  action: ElectronUpdaterEnvAction,
): ElectronUpdaterEnvState {
  switch (action.type) {
    case "app-version":
      return { ...state, appVersion: action.appVersion };
    case "unsupported":
      return {
        ...state,
        updateEnv: { supported: false, reason: action.reason },
      };
  }
}

function electronUpdaterBridge(): ElectronUpdaterBridge | null {
  if (typeof window === "undefined") return null;
  if (import.meta.env.DEV && window.__redrobUpdaterEvalBridge) {
    return window.__redrobUpdaterEvalBridge;
  }
  return window.__REDROB_ELECTRON__?.updater ?? null;
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  const serialized = safeStringify(error);
  return serialized && serialized !== "{}" ? serialized : String(error);
}

function releaseNotesToText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && "note" in entry) {
          const note = String((entry as { note?: unknown }).note ?? "");
          return note ? [note] : [];
        }
        return [];
      })
      .join("\n\n") || undefined;
  }
  return undefined;
}

function updateProgress(event: unknown): { downloaded?: number; total?: number } | null {
  if (!event || typeof event !== "object") return null;
  const data = event as { data?: unknown };
  if (!data.data || typeof data.data !== "object") return null;
  const payload = data.data as { chunkLength?: unknown; contentLength?: unknown };
  return {
    downloaded: typeof payload.chunkLength === "number" ? payload.chunkLength : undefined,
    total: typeof payload.contentLength === "number" ? payload.contentLength : undefined,
  };
}

export function useElectronUpdaterState(options: UseElectronUpdaterStateOptions) {
  const {
    releaseChannel,
    onReleaseChannelChange,
    updateAutoCheck,
    updateAutoDownload,
    setError,
  } = options;
  const [updateStatus, setUpdateStatus] = useState<SettingsUpdateStatus>(null);
  const [envState, dispatchEnvState] = useReducer(electronUpdaterEnvReducer, {
    appVersion: null,
    updateEnv: isElectronRuntime()
      ? null
      : { supported: false, reason: electronUpdaterUnsupportedReason() },
  });
  const { appVersion, updateEnv } = envState;
  const autoCheckKeyRef = useRef<string | null>(null);
  const checkRequestRef = useRef(0);
  const releaseChannelRequestRef = useRef(0);
  const availableReleaseChannelRef = useRef<ReleaseChannel | null>(null);
  const downloadedReleaseChannelRef = useRef<ReleaseChannel | null>(null);
  useEffect(() => {
    if (!isElectronRuntime()) {
      dispatchEnvState({ type: "unsupported", reason: electronUpdaterUnsupportedReason() });
      return;
    }
    const bridge = electronUpdaterBridge();
    if (!bridge?.getChannel) {
      dispatchEnvState({ type: "unsupported", reason: electronUpdaterUnsupportedReason() });
      return;
    }
    let cancelled = false;
    void bridge
      .getChannel()
      .then(async (state) => {
        if (cancelled) return;
        dispatchEnvState({ type: "app-version", appVersion: state.currentVersion ?? null });
        if (state.channel && state.channel !== releaseChannel && bridge.setChannel) {
          const nextState = await bridge.setChannel(releaseChannel);
          if (cancelled) return;
          dispatchEnvState({ type: "app-version", appVersion: nextState.currentVersion ?? null });
          if (nextState.channel && nextState.channel !== releaseChannel) {
            onReleaseChannelChange(nextState.channel);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatchEnvState({ type: "unsupported", reason: electronUpdaterUnsupportedReason() });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onReleaseChannelChange, releaseChannel]);

  const downloadUpdate = useCallback(async (channelOverride?: ReleaseChannel) => {
    const releaseChannelRequestId = releaseChannelRequestRef.current;
    const isCurrentReleaseChannel = () =>
      releaseChannelRequestRef.current === releaseChannelRequestId;
    const bridge = electronUpdaterBridge();
    if (!bridge?.download) {
      const message = t("settings.electron_updater_downloads_desktop_only");
      setUpdateStatus({ state: "error", message, failedAction: "download" });
      setError(message);
      return;
    }

    const requestedReleaseChannel =
      channelOverride ??
      availableReleaseChannelRef.current ??
      releaseChannel;
    if (!isCurrentReleaseChannel()) return;

    // Subscribe to incremental progress events from the main process so
    // the UI updates in real time instead of staying stuck at 0 bytes.
    let unsubProgress: (() => void) | null = null;
    if (bridge.onDownloadProgress) {
      unsubProgress = bridge.onDownloadProgress((data) => {
        if (!isCurrentReleaseChannel()) return;
        setUpdateStatus((current) => ({
          ...(current ?? {}),
          state: "downloading",
          downloadedBytes: data.transferred ?? 0,
          totalBytes: data.total ?? current?.totalBytes ?? null,
        }));
      });
    }

    if (!isCurrentReleaseChannel()) return;
    setUpdateStatus((current) => ({
      ...(current ?? {}),
      state: "downloading",
      downloadedBytes: current?.downloadedBytes ?? 0,
      totalBytes: current?.totalBytes ?? null,
    }));
    try {
      const result = await bridge.download();
      if (!isCurrentReleaseChannel()) return;
      if (!result?.ok) {
        setUpdateStatus({
          state: "error",
          message: result?.reason ?? t("settings.update_download_failed"),
          failedAction: "download",
        });
        return;
      }
      availableReleaseChannelRef.current = null;
      downloadedReleaseChannelRef.current = releaseChannel;
      setUpdateStatus((current) => ({
        ...(current ?? {}),
        state: "ready",
      }));
    } catch (error) {
      if (!isCurrentReleaseChannel()) return;
      setUpdateStatus({
        state: "error",
        message: describeError(error),
        failedAction: "download",
      });
    } finally {
      unsubProgress?.();
    }
  }, [
    onReleaseChannelChange,
    releaseChannel,
    setError,
  ]);

  const runCheckForUpdates = useCallback(async (
    channelOverride?: ReleaseChannel,
    manual = false,
  ) => {
    if (!isElectronRuntime()) return;
    const requestId = checkRequestRef.current + 1;
    checkRequestRef.current = requestId;
    const isCurrentRequest = () => checkRequestRef.current === requestId;
    const requestedReleaseChannel = channelOverride ?? releaseChannel;
    const bridge = electronUpdaterBridge();
    if (!bridge?.check) {
      const message = t("settings.electron_update_checks_desktop_only");
      setUpdateStatus({ state: "error", message, failedAction: "check" });
      setError(message);
      return;
    }

    setUpdateStatus({ state: "checking" });
    try {
      // With no control plane there is no organization update policy: the
      // electron-updater feed for the selected channel is the only authority
      // on what version is available.
      const result = await bridge.check(requestedReleaseChannel);
      if (!isCurrentRequest()) return;
      dispatchEnvState({ type: "app-version", appVersion: result.currentVersion ?? null });
      const checkedReleaseChannel = result.channel ?? requestedReleaseChannel;
      if (result.reason === "unavailable") {
        setUpdateStatus({
          state: "idle",
          message: t("settings.auto_updates_packaged_only"),
        });
        return;
      }
      if (result.reason) {
        setUpdateStatus({
          state: "error",
          message: result.reason,
          failedAction: "check",
        });
        return;
      }
      const availableAllowed = result.available;
      const nextStatus: Exclude<SettingsUpdateStatus, null> = availableAllowed
        ? {
            state: "available",
            lastCheckedAt: Date.now(),
            version: result.latestVersion ?? undefined,
            date: result.releaseDate ?? undefined,
            notes: releaseNotesToText(result.releaseNotes),
          }
        : {
            state: "idle",
            lastCheckedAt: Date.now(),
            version: result.latestVersion ?? undefined,
            date: result.releaseDate ?? undefined,
            notes: releaseNotesToText(result.releaseNotes),
          };
      availableReleaseChannelRef.current = availableAllowed
        ? checkedReleaseChannel
        : null;
      downloadedReleaseChannelRef.current = null;
      setUpdateStatus(nextStatus);
      if (availableAllowed && updateAutoDownload) {
        await downloadUpdate(checkedReleaseChannel);
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      setUpdateStatus({
        state: "error",
        message: describeError(error),
        failedAction: "check",
      });
    }
  }, [appVersion, downloadUpdate, onReleaseChannelChange, releaseChannel, setError, updateAutoDownload]);

  const checkForUpdates = useCallback(
    (channelOverride?: ReleaseChannel) => runCheckForUpdates(channelOverride, true),
    [runCheckForUpdates],
  );

  useEffect(() => {
    const key = `${releaseChannel}:${appVersion ?? "unknown"}`;
    if (!shouldScheduleElectronUpdateAutoCheck({
      updateAutoCheck,
      updateEnv,
      autoCheckKey: autoCheckKeyRef.current,
      nextAutoCheckKey: key,
    })) return;
    autoCheckKeyRef.current = key;
    void runCheckForUpdates(undefined, false);
  }, [appVersion, releaseChannel, runCheckForUpdates, updateAutoCheck, updateEnv?.supported]);

  // Run a check when the native "Check for Updates..." menu item was used.
  const updateCheckRequestedAt = useUpdateCheckRequestStore((state) => state.requestedAt);
  useEffect(() => {
    if (updateCheckRequestedAt == null || updateEnv?.supported === false) return;
    useUpdateCheckRequestStore.getState().clearUpdateCheckRequest();
    void checkForUpdates();
  }, [checkForUpdates, updateCheckRequestedAt, updateEnv?.supported]);

  const installUpdateAndRestart = useCallback(async () => {
    const releaseChannelRequestId = releaseChannelRequestRef.current;
    const isCurrentReleaseChannel = () =>
      releaseChannelRequestRef.current === releaseChannelRequestId;
    const bridge = electronUpdaterBridge();
    if (!bridge?.installAndRestart) {
      const message = t("settings.electron_update_install_desktop_only");
      setUpdateStatus({ state: "error", message, failedAction: "install" });
      setError(message);
      return;
    }
    try {
      const result = await bridge.installAndRestart();
      if (!isCurrentReleaseChannel()) return;
      if (!result?.ok) {
        if (result?.reason === "update-not-downloaded") {
          // The main-side staged download was invalidated; re-check so the UI
          // returns to a working stable-targeted download/install flow.
          downloadedReleaseChannelRef.current = null;
          availableReleaseChannelRef.current = null;
          await runCheckForUpdates(undefined, true);
          return;
        }
        setUpdateStatus({
          state: "error",
          message: result?.reason ?? t("settings.update_install_failed"),
          failedAction: "install",
        });
      }
    } catch (error) {
      if (!isCurrentReleaseChannel()) return;
      setUpdateStatus({
        state: "error",
        message: describeError(error),
        failedAction: "install",
      });
    }
  }, [runCheckForUpdates, setError]);

  const setReleaseChannel = useCallback(
    async (next: ReleaseChannel) => {
      const requestId = releaseChannelRequestRef.current + 1;
      releaseChannelRequestRef.current = requestId;
      checkRequestRef.current += 1;
      const bridge = electronUpdaterBridge();
      try {
        const allowedReleaseChannel = next;
        onReleaseChannelChange(allowedReleaseChannel);
        if (!bridge?.setChannel) return;
        const state = await bridge.setChannel(allowedReleaseChannel);
        if (releaseChannelRequestRef.current !== requestId) return;
        dispatchEnvState({ type: "app-version", appVersion: state.currentVersion ?? null });
        if (state.channel && state.channel !== allowedReleaseChannel) {
          onReleaseChannelChange(state.channel);
        }
        await checkForUpdates(state.channel ?? allowedReleaseChannel);
      } catch (error) {
        if (releaseChannelRequestRef.current !== requestId) return;
        setUpdateStatus({
          state: "error",
          message: describeError(error),
          failedAction: "check",
        });
      }
    },
    [checkForUpdates, onReleaseChannelChange],
  );

  return {
    appVersion,
    updateEnv,
    updateStatus,
    checkForUpdates,
    downloadUpdate,
    installUpdateAndRestart,
    setReleaseChannel,
  };
}
