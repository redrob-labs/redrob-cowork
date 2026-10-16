/** @jsxImportSource react */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, EmptyState, ProtectionStatus, Skeleton, icons } from "@redrob-labs/ui";

import { isDesktopRuntime } from "../../../app/lib/runtime-env";
import { t } from "../../../i18n";
import { createCoworkServices } from "../services/real-services";
import type { PrivacyLevel, PrivacyState } from "../services/types";
import { Group, Row } from "../settings/cowork-settings";
import { useCoworkConnection } from "../shell/cowork-connection";
import { CoworkShell } from "../shell/cowork-shell";
import { privacyLevelLabel } from "../shell/nav";
import { useFrameStore } from "../store/frame-store";

const BUTTON_ICON = { width: 14, height: 14, "aria-hidden": true };

export const PRIVACY_QUERY_KEY = "cowork-privacy";

/** The header meta: the level, in words. */
export function privacyLevelMeta(level: PrivacyLevel): string {
  return privacyLevelLabel(level);
}

const LEVELS: ReadonlyArray<{ id: PrivacyLevel; detail: () => string }> = [
  { id: "off", detail: () => t("cowork.privacy_page_level_off") },
  { id: "standard", detail: () => t("cowork.privacy_page_level_standard") },
  { id: "high", detail: () => t("cowork.privacy_page_level_high") },
  { id: "strict", detail: () => t("cowork.privacy_page_level_strict") },
];

const STEPS: ReadonlyArray<{ id: string; title: () => string; text: () => string }> = [
  { id: "read", title: () => t("cowork.privacy_page_step1_title"), text: () => t("cowork.privacy_page_step1_text") },
  { id: "swap", title: () => t("cowork.privacy_page_step2_title"), text: () => t("cowork.privacy_page_step2_text") },
  { id: "back", title: () => t("cowork.privacy_page_step3_title"), text: () => t("cowork.privacy_page_step3_text") },
];

function PrivacyStatus(props: { state: PrivacyState; desktop: boolean; preview: boolean }) {
  if (!props.desktop) {
    return (
      <ProtectionStatus size="lg" tone="warn" icon={icons.shield({ width: 28, height: 28, "aria-hidden": true })} title={t("cowork.privacy_off_title")}>
        {t("cowork.privacy_off_text")}
      </ProtectionStatus>
    );
  }
  // Sample data never reads as protection.
  if (props.preview || props.state.level === "off") {
    return (
      <ProtectionStatus size="lg" tone="warn" icon={icons.shield({ width: 28, height: 28, "aria-hidden": true })} title={t("cowork.privacy_page_off_title")}>
        {t("cowork.privacy_page_off_text")}
      </ProtectionStatus>
    );
  }
  return (
    <ProtectionStatus
      size="lg"
      tone="safe"
      icon={icons.shieldCheck({ width: 28, height: 28, "aria-hidden": true })}
      title={`${t("cowork.privacy_on_title")}: ${privacyLevelLabel(props.state.level)}`}
      live={t("cowork.privacy_running")}
    >
      {t("cowork.privacy_page_engine")}
    </ProtectionStatus>
  );
}

export type PrivacyViewProps = {
  state: PrivacyState;
  desktop: boolean;
  /** Sample data: shown as off, with nothing to change. */
  preview: boolean;
  busy: boolean;
  onLevel: (level: PrivacyLevel) => void;
};

/** Privacy protection: the status, what Send does and the levels. The masking itself is the engine's. */
export function PrivacyView(props: PrivacyViewProps) {
  const editable = props.desktop && !props.preview && !props.state.locked;
  return (
    <div className="cowork-settings__main">
      {props.preview ? (
        <Alert tone="info" title={t("cowork.privacy_page_preview_title")}>
          {t("cowork.privacy_page_preview_text")}
        </Alert>
      ) : null}
      <PrivacyStatus state={props.state} desktop={props.desktop} preview={props.preview} />
      <Group title={t("cowork.privacy_page_send_title")}>
        {STEPS.map((step) => (
          <Row key={step.id} title={step.title()} description={step.text()} />
        ))}
      </Group>
      <Group title={t("cowork.privacy_page_levels_title")}>
        {LEVELS.map((level) => (
          <Row key={level.id} title={privacyLevelLabel(level.id)} description={level.detail()}>
            {!props.preview && level.id === props.state.level ? (
              <Badge tone="success" size="sm">
                {t("cowork.privacy_page_your_level")}
              </Badge>
            ) : editable ? (
              <Button size="sm" variant="ghost" loading={props.busy} onClick={() => props.onLevel(level.id)}>
                {t("cowork.privacy_page_use_level")}
              </Button>
            ) : null}
          </Row>
        ))}
      </Group>
      {props.state.locked && !props.preview ? (
        <p className="cowork-settings__note">
          {icons.lock(BUTTON_ICON)}
          {props.state.setBy
            ? t("cowork.privacy_page_level_locked_by", { name: props.state.setBy })
            : t("cowork.privacy_page_level_locked")}
        </p>
      ) : null}
      <Group title={t("cowork.privacy_page_where_title")}>
        <Row title={t("cowork.privacy_page_where_desktop_title")} description={t("cowork.privacy_page_where_desktop_text")} />
        <Row title={t("cowork.privacy_page_where_miss_title")} description={t("cowork.privacy_page_where_miss_text")} />
      </Group>
    </div>
  );
}

/** `/privacy`, inside the Cowork frame. Settings live in the workspace; sample data without a server. */
export function CoworkPrivacyScreen(props: { desktop?: boolean }) {
  const client = useCoworkConnection((state) => state.client);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const services = useMemo(() => createCoworkServices({ client, workspaceId }), [client, workspaceId]);
  const desktop = props.desktop ?? isDesktopRuntime();
  const key = [PRIVACY_QUERY_KEY, workspaceId ?? "preview"];
  const privacy = useQuery({ queryKey: key, queryFn: () => services.privacy.get(), staleTime: 30_000 });
  const change = useMutation({
    mutationFn: (patch: { level: PrivacyLevel }) => services.privacy.setLevel(patch.level),
    onSuccess: (result) => {
      queryClient.setQueryData(key, result);
      // The menu and the composer read the level too.
      void queryClient.invalidateQueries({ queryKey: ["cowork-nav"] });
      void queryClient.invalidateQueries({ queryKey: ["cowork-composer"] });
    },
    onError: () => showToast(t("cowork.privacy_page_failed"), t("cowork.settings_try_again"), "danger"),
  });
  const result = privacy.data;
  const state = result?.data;

  return (
    <CoworkShell current="privacy" title={t("cowork.nav_privacy")} meta={result && !result.preview ? privacyLevelMeta(result.data.level) : undefined}>
      {privacy.isLoading ? (
        <Skeleton variant="text" lines={5} />
      ) : !result || !state ? (
        <EmptyState title={t("cowork.privacy_page_error_title")} description={t("cowork.settings_try_again")} />
      ) : (
        <PrivacyView
          state={state}
          desktop={desktop}
          preview={result.preview}
          busy={change.isPending}
          onLevel={(level) => change.mutate({ level })}
        />
      )}
    </CoworkShell>
  );
}
