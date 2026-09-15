/** @jsxImportSource react */
import { useEffect, useReducer, useState } from "react";

import { Separator } from "@/components/ui/separator";

import type { OpencodeConnectStatus } from "@/app/types";
import type { RedrobRuntimeConfigStatus, RedrobServerStatus } from "@/app/lib/redrob-server";
import { t } from "@/i18n";
import { LayoutStack } from "../settings-layout";

import { advancedLocalReducer, initialAdvancedLocalState } from "./advanced-view-state";
import {
  AdvancedDeveloperSection,
  AdvancedRuntimeMigrationSection,
  AdvancedRuntimeSection,
} from "./advanced-view-sections";

export type AdvancedViewProps = {
  busy: boolean;
  clientConnected: boolean;
  /**
   * Whether a local workspace is selected, i.e. whether the engine is supposed
   * to be running at all.
   *
   * Without this the card cannot tell "the engine failed" from "the engine was
   * never started", and it reported both as 연결되지 않음. On a first launch with
   * no local workspace the boot path deliberately starts only the Redrob Cowork
   * server and never the engine, so 연결되지 않음 was the steady state of a
   * perfectly healthy install -- which is what a user reported as a bug.
   */
  engineExpected: boolean;
  opencodeConnectStatus: OpencodeConnectStatus | null;
  redrobServerStatus: RedrobServerStatus;
  developerMode: boolean;
  toggleDeveloperMode: () => void;
  opencodeDevModeEnabled: boolean;
  openDebugDeepLink: (rawUrl: string) => Promise<{ ok: boolean; message: string }>;
  canMigrateRuntimeConfig: boolean;
  migrateRuntimeConfig: () => Promise<{ migrated: boolean; keys: string[] }>;
  getRuntimeConfigStatus: () => Promise<RedrobRuntimeConfigStatus>;
};

type AdvancedStatusTone = "ready" | "warning" | "error" | "neutral";

export function AdvancedView(props: AdvancedViewProps) {
  const [localState, dispatchLocal] = useReducer(
    advancedLocalReducer,
    initialAdvancedLocalState,
  );
  const [configStatus, setConfigStatus] = useState<RedrobRuntimeConfigStatus | null>(null);
  const [configStatusBusy, setConfigStatusBusy] = useState(false);
  const [configStatusError, setConfigStatusError] = useState<string | null>(null);
  const {
    deepLinkOpen: debugDeepLinkOpen,
    deepLinkInput: debugDeepLinkInput,
    deepLinkBusy: debugDeepLinkBusy,
    deepLinkStatus: debugDeepLinkStatus,
    migrationBusy,
    migrationStatus,
  } = localState;

  const clientStatusLabel = (() => {
    const status = props.opencodeConnectStatus?.status;
    if (status === "connecting") return t("status.connecting");
    if (status === "error") return t("settings.connection_failed");
    if (props.clientConnected) return t("status.connected");
    // Not connected AND never asked to start is not a failure -- say which.
    return props.engineExpected
      ? t("config.status_not_connected")
      : t("settings.engine_not_started");
  })();

  const clientTone: AdvancedStatusTone = (() => {
    const status = props.opencodeConnectStatus?.status;
    if (status === "connecting") return "warning";
    if (status === "error") return "error";
    if (props.clientConnected) return "ready";
    // Neutral either way: a not-yet-started engine is not an error state, and a
    // genuinely failed one is reported by the detail line below.
    return "neutral";
  })();

  const redrobStatusLabel = (() => {
    switch (props.redrobServerStatus) {
      case "connected":
        return t("config.status_connected");
      case "limited":
        return t("config.status_limited");
      default:
        return t("config.status_not_connected");
    }
  })();

  const redrobTone: AdvancedStatusTone = (() => {
    switch (props.redrobServerStatus) {
      case "connected":
        return "ready";
      case "limited":
        return "warning";
      default:
        return "neutral";
    }
  })();

  const clientDetailLines = props.clientConnected
    ? [t("settings.engine_detail_connected")]
    : props.engineExpected
      // Expected to be running and is not: this is the failure case, so say what
      // breaks and what is still inspectable.
      ? [
          t("settings.engine_detail_failed"),
          t("settings.engine_detail_config_still_readable"),
        ]
      // Never asked to start. Telling the user chat "may fail until Redrob Code
      // restarts" here is wrong twice over: nothing has failed, and there is
      // nothing to restart. Tell them what actually starts it.
      : [t("settings.engine_detail_not_started")];

  const redrobDetailLines = props.redrobServerStatus === "connected"
    ? [t("settings.redrob_detail_connected")]
    : [t("settings.redrob_detail_disconnected")];

  const submitDebugDeepLink = async () => {
    const rawUrl = debugDeepLinkInput.trim();
    if (!rawUrl || props.busy || debugDeepLinkBusy) return;
    dispatchLocal({ type: "deepLinkStart" });
    try {
      const result = await props.openDebugDeepLink(rawUrl);
      if (result.ok) {
        dispatchLocal({ type: "deepLinkSuccess", status: result.message });
      } else {
        dispatchLocal({ type: "deepLinkStatus", status: result.message });
      }
    } catch (error) {
      dispatchLocal({
        type: "deepLinkStatus",
        status: error instanceof Error ? error.message : t("settings.open_deeplink_failed"),
      });
    } finally {
      dispatchLocal({ type: "deepLinkDone" });
    }
  };

  const refreshRuntimeConfigStatus = async () => {
    if (!props.canMigrateRuntimeConfig) {
      setConfigStatus(null);
      return;
    }
    setConfigStatusBusy(true);
    setConfigStatusError(null);
    try {
      setConfigStatus(await props.getRuntimeConfigStatus());
    } catch (error) {
      setConfigStatusError(error instanceof Error ? error.message : t("settings.runtime_config_status_failed"));
    } finally {
      setConfigStatusBusy(false);
    }
  };

  useEffect(() => {
    void refreshRuntimeConfigStatus();
  }, [props.canMigrateRuntimeConfig]);

  /**
   * Whether this workspace actually has legacy config to move.
   *
   * These are the same two arrays the server's migrate route branches on, so an
   * empty pair means pressing Migrate would hit its no-op early return.
   * `configStatus` is null until the first fetch lands, which reads as "nothing
   * to migrate" and keeps the section hidden -- correct for the common case, and
   * the section appears if the fetch comes back with keys.
   */
  const hasMigratableConfig = Boolean(
    configStatus
      && ((configStatus.legacyRedrob?.keys?.length ?? 0) > 0
        || (configStatus.userOpencode?.migratableKeys?.length ?? 0) > 0),
  );

  const migrateRuntimeConfig = async () => {
    if (props.busy || migrationBusy || !props.canMigrateRuntimeConfig) return;
    dispatchLocal({ type: "migrationStart" });
    try {
      const result = await props.migrateRuntimeConfig();
      await refreshRuntimeConfigStatus();
      dispatchLocal({
        type: "migrationStatus",
        status: result.migrated
          ? t("settings.migrate_result_moved", { keys: result.keys.join(", ") })
          : t("settings.migrate_result_nothing"),
      });
    } catch (error) {
      dispatchLocal({
        type: "migrationStatus",
        status: error instanceof Error ? error.message : t("settings.migrate_result_failed"),
      });
    } finally {
      dispatchLocal({ type: "migrationDone" });
    }
  };

  return (
    <LayoutStack>
      <AdvancedRuntimeSection
        clientStatusLabel={clientStatusLabel}
        clientTone={clientTone}
        clientDetailLines={clientDetailLines}
        redrobStatusLabel={redrobStatusLabel}
        redrobTone={redrobTone}
        redrobDetailLines={redrobDetailLines}
      />


      {/*
        Legacy cleanup, so it is only worth showing when there is legacy config
        left. It used to render unconditionally with both buttons enabled, so
        every fresh install offered an action that could do nothing -- a user on
        a new Windows install reported exactly that.

        The signal costs nothing: `GET /workspace/:id/runtime-config` already
        returns the two key arrays the migrate route itself decides on, computed
        by the same functions server-side, and this page already fetches it on
        mount. Empty on both sides means the route would take its no-op early
        return.

        Still shown when the status could not be read, so a user who genuinely
        has legacy config does not lose the action to a failed probe, and in
        developer mode so the diagnostics stay inspectable.
      */}
      {hasMigratableConfig || configStatusError || props.developerMode ? (
        <AdvancedRuntimeMigrationSection
          busy={props.busy}
          canMigrate={props.canMigrateRuntimeConfig}
          migrationBusy={migrationBusy}
          migrationStatus={migrationStatus}
          configStatus={configStatus}
          configStatusBusy={configStatusBusy}
          configStatusError={configStatusError}
          onRefresh={refreshRuntimeConfigStatus}
          onMigrate={migrateRuntimeConfig}
        />
      ) : null}

      <AdvancedDeveloperSection
        busy={props.busy}
        developerMode={props.developerMode}
        opencodeDevModeEnabled={props.opencodeDevModeEnabled}
        deepLinkOpen={debugDeepLinkOpen}
        deepLinkInput={debugDeepLinkInput}
        deepLinkBusy={debugDeepLinkBusy}
        deepLinkStatus={debugDeepLinkStatus}
        onToggleDeveloperMode={props.toggleDeveloperMode}
        onToggleDeepLink={() => dispatchLocal({ type: "toggleDeepLink" })}
        onDeepLinkInput={(input) => dispatchLocal({ type: "deepLinkInput", input })}
        onSubmitDeepLink={submitDebugDeepLink}
      />
    </LayoutStack>
  );
}
