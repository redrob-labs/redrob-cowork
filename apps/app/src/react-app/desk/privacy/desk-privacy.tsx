/** @jsxImportSource react */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, EmptyState, ProtectionStatus, Skeleton, icons } from "@redrob-labs/ui";

import { isDesktopRuntime } from "../../../app/lib/runtime-env";
import { t } from "../../../i18n";
import type { DeskServices } from "../services/desk-services";
import { createDeskServices } from "../services/real-services";
import type { DeskResult, PrivacyLevel, PrivacyState } from "../services/types";
import { Group, Row } from "../settings/desk-settings";
import { useDeskConnection } from "../shell/desk-connection";
import { DeskShell } from "../shell/desk-shell";
import { privacyLevelLabel } from "../shell/nav";
import { useFrameStore } from "../store/frame-store";

const BUTTON_ICON = { width: 14, height: 14, "aria-hidden": true };

/** The one-time download of the model on this laptop, in gigabytes. */
export const LOCAL_MODEL_DOWNLOAD_GB = 9;

export const PRIVACY_QUERY_KEY = "desk-privacy";

/** The header meta: the level, in words. */
export function privacyLevelMeta(level: PrivacyLevel): string {
  return privacyLevelLabel(level);
}

export type LocalModelRow = {
  title: string;
  description: string;
  action: "turn-on" | "turn-off" | null;
  /** Why the control is unavailable here; null when it can be used. */
  disabledReason: string | null;
};

/** "Keep private work on this laptop": what the row says, and what its button does. */
export function localModelRow(state: Pick<PrivacyState, "localModel">, desktop: boolean): LocalModelRow {
  if (!desktop) {
    return {
      title: t("desk.privacy_off"),
      description: t("desk.privacy_page_local_off_text", { gb: LOCAL_MODEL_DOWNLOAD_GB }),
      action: null,
      disabledReason: t("desk.privacy_page_local_web"),
    };
  }
  if (state.localModel) {
    return {
      title: t("desk.privacy_page_local_on_title"),
      description: t("desk.privacy_page_local_on_text"),
      action: "turn-off",
      disabledReason: null,
    };
  }
  return {
    title: t("desk.privacy_off"),
    description: t("desk.privacy_page_local_off_text", { gb: LOCAL_MODEL_DOWNLOAD_GB }),
    action: "turn-on",
    disabledReason: null,
  };
}

export type LocalModelDeps = {
  privacy: Pick<DeskServices["privacy"], "setLocalModel">;
  showToast: (title: string, text?: string) => void;
};

/** Turns the model on this laptop on or off. In this preview it only changes the sample state. */
export async function setLocalModel(deps: LocalModelDeps, on: boolean): Promise<DeskResult<PrivacyState>> {
  const result = await deps.privacy.setLocalModel(on);
  if (on) deps.showToast(t("desk.privacy_page_ready_title"), t("desk.privacy_page_ready_text"));
  return result;
}

const LEVELS: ReadonlyArray<{ id: "standard" | "high" | "strict"; label: () => string; detail: () => string }> = [
  { id: "standard", label: () => t("desk.privacy_standard"), detail: () => t("desk.privacy_page_level_standard") },
  { id: "high", label: () => t("desk.privacy_high"), detail: () => t("desk.privacy_page_level_high") },
  { id: "strict", label: () => t("desk.privacy_strict"), detail: () => t("desk.privacy_page_level_strict") },
];

const STEPS: ReadonlyArray<{ id: string; title: () => string; text: () => string }> = [
  { id: "read", title: () => t("desk.privacy_page_step1_title"), text: () => t("desk.privacy_page_step1_text") },
  { id: "swap", title: () => t("desk.privacy_page_step2_title"), text: () => t("desk.privacy_page_step2_text") },
  { id: "back", title: () => t("desk.privacy_page_step3_title"), text: () => t("desk.privacy_page_step3_text") },
];

function PrivacyStatus(props: { state: PrivacyState; desktop: boolean }) {
  if (!props.desktop) {
    return (
      <ProtectionStatus size="lg" tone="warn" icon={icons.shield({ width: 28, height: 28, "aria-hidden": true })} title={t("desk.privacy_off_title")}>
        {t("desk.privacy_off_text")}
      </ProtectionStatus>
    );
  }
  if (props.state.level === "off") {
    return (
      <ProtectionStatus size="lg" tone="warn" icon={icons.shield({ width: 28, height: 28, "aria-hidden": true })} title={t("desk.privacy_page_off_title")}>
        {t("desk.privacy_page_off_text")}
      </ProtectionStatus>
    );
  }
  return (
    <ProtectionStatus
      size="lg"
      tone="safe"
      icon={icons.shieldCheck({ width: 28, height: 28, "aria-hidden": true })}
      title={`${t("desk.privacy_on_title")}: ${privacyLevelLabel(props.state.level)}`}
      live={t("desk.privacy_sample")}
    >
      {t("desk.privacy_page_kept", { count: props.state.detailsKeptThisWeek })}
    </ProtectionStatus>
  );
}

export type PrivacyViewProps = {
  state: PrivacyState;
  desktop: boolean;
  busy: boolean;
  onLocalModel: (on: boolean) => void;
};

/** Privacy protection: the status, what it does, the levels (read-only) and the model on this laptop. */
export function PrivacyView(props: PrivacyViewProps) {
  const row = localModelRow(props.state, props.desktop);
  return (
    <div className="desk-settings__main">
      <Alert tone="info" title={t("desk.privacy_page_preview_title")}>
        {t("desk.privacy_page_preview_text")}
      </Alert>
      <PrivacyStatus state={props.state} desktop={props.desktop} />
      <Group title={t("desk.privacy_page_send_title")}>
        {STEPS.map((step) => (
          <Row key={step.id} title={step.title()} description={step.text()} />
        ))}
      </Group>
      <Group title={t("desk.privacy_page_levels_title")}>
        {LEVELS.map((level) => (
          <Row key={level.id} title={level.label()} description={level.detail()}>
            {level.id === props.state.level ? (
              <Badge tone="success" size="sm">
                {t("desk.privacy_page_your_level")}
              </Badge>
            ) : null}
          </Row>
        ))}
      </Group>
      <p className="desk-settings__note">
        {icons.lock(BUTTON_ICON)}
        {t("desk.privacy_page_level_fixed")}
      </p>
      <Group title={t("desk.privacy_page_local_title")}>
        <Row title={row.title} description={row.disabledReason ? `${row.description} ${row.disabledReason}` : row.description}>
          {row.action === "turn-off" ? (
            <Button size="sm" variant="ghost" loading={props.busy} onClick={() => props.onLocalModel(false)}>
              {t("desk.privacy_page_turn_off")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              iconLeft={icons.download(BUTTON_ICON)}
              loading={props.busy}
              disabled={row.action === null}
              onClick={() => props.onLocalModel(true)}
            >
              {t("desk.privacy_page_turn_on")}
            </Button>
          )}
        </Row>
      </Group>
      <Group title={t("desk.privacy_page_where_title")}>
        <Row title={t("desk.privacy_page_where_desktop_title")} description={t("desk.privacy_page_where_desktop_text")} />
        <Row title={t("desk.privacy_page_where_miss_title")} description={t("desk.privacy_page_where_miss_text")} />
      </Group>
    </div>
  );
}

/** `/privacy`, inside the Desk frame. Sample data until privacy protection has a backend. */
export function DeskPrivacyScreen(props: { desktop?: boolean }) {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const services = useMemo(() => createDeskServices({ client, workspaceId }), [client, workspaceId]);
  const desktop = props.desktop ?? isDesktopRuntime();
  const key = [PRIVACY_QUERY_KEY, workspaceId ?? "preview"];
  const privacy = useQuery({ queryKey: key, queryFn: () => services.privacy.get(), staleTime: Infinity });
  const toggle = useMutation({
    mutationFn: (on: boolean) => setLocalModel({ privacy: services.privacy, showToast }, on),
    onSuccess: (result) => queryClient.setQueryData(key, result),
    onError: () => showToast(t("desk.privacy_page_failed"), t("desk.settings_try_again"), "danger"),
  });
  const state = privacy.data?.data;

  return (
    <DeskShell current="privacy" title={t("desk.nav_privacy")} meta={state ? privacyLevelMeta(state.level) : undefined}>
      {privacy.isLoading ? (
        <Skeleton variant="text" lines={5} />
      ) : !state ? (
        <EmptyState title={t("desk.privacy_page_error_title")} description={t("desk.settings_try_again")} />
      ) : (
        <PrivacyView state={state} desktop={desktop} busy={toggle.isPending} onLocalModel={(on) => toggle.mutate(on)} />
      )}
    </DeskShell>
  );
}
