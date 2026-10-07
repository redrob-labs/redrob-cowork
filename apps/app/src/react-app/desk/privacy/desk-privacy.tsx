/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, EmptyState, ProtectionStatus, Skeleton, Textarea, icons } from "@redrob-labs/ui";

import { isDesktopRuntime } from "../../../app/lib/runtime-env";
import { t } from "../../../i18n";
import { createDeskServices } from "../services/real-services";
import { clearPrivacySettings } from "./privacy-send";
import type { PrivacyLevel, PrivacyState } from "../services/types";
import { Group, Row } from "../settings/desk-settings";
import { useDeskConnection } from "../shell/desk-connection";
import { DeskShell } from "../shell/desk-shell";
import { privacyLevelLabel } from "../shell/nav";
import { useFrameStore } from "../store/frame-store";

const BUTTON_ICON = { width: 14, height: 14, "aria-hidden": true };

export const PRIVACY_QUERY_KEY = "desk-privacy";

/** The header meta: the level, in words. */
export function privacyLevelMeta(level: PrivacyLevel): string {
  return privacyLevelLabel(level);
}

/** The names box: one per line, blanks and repeats dropped. */
export function parseNames(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
}

const LEVELS: ReadonlyArray<{ id: PrivacyLevel; detail: () => string }> = [
  { id: "off", detail: () => t("desk.privacy_page_level_off") },
  { id: "standard", detail: () => t("desk.privacy_page_level_standard") },
  { id: "high", detail: () => t("desk.privacy_page_level_high") },
  { id: "strict", detail: () => t("desk.privacy_page_level_strict") },
];

const STEPS: ReadonlyArray<{ id: string; title: () => string; text: () => string }> = [
  { id: "read", title: () => t("desk.privacy_page_step1_title"), text: () => t("desk.privacy_page_step1_text") },
  { id: "swap", title: () => t("desk.privacy_page_step2_title"), text: () => t("desk.privacy_page_step2_text") },
  { id: "back", title: () => t("desk.privacy_page_step3_title"), text: () => t("desk.privacy_page_step3_text") },
];

function PrivacyStatus(props: { state: PrivacyState; desktop: boolean; preview: boolean }) {
  if (!props.desktop) {
    return (
      <ProtectionStatus size="lg" tone="warn" icon={icons.shield({ width: 28, height: 28, "aria-hidden": true })} title={t("desk.privacy_off_title")}>
        {t("desk.privacy_off_text")}
      </ProtectionStatus>
    );
  }
  // Sample data never reads as protection.
  if (props.preview || props.state.level === "off") {
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
      live={t("desk.privacy_running")}
    >
      {t("desk.privacy_page_kept", { count: props.state.detailsKeptThisWeek })}
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
  onNames: (names: string[]) => void;
};

/** Privacy protection: the status, what Send does, the levels and the names Strict keeps private. */
export function PrivacyView(props: PrivacyViewProps) {
  const [names, setNames] = useState(props.state.names.join("\n"));
  const editable = props.desktop && !props.preview && !props.state.locked;
  const changed = parseNames(names).join("\n") !== props.state.names.join("\n");
  return (
    <div className="desk-settings__main">
      {props.preview ? (
        <Alert tone="info" title={t("desk.privacy_page_preview_title")}>
          {t("desk.privacy_page_preview_text")}
        </Alert>
      ) : null}
      <PrivacyStatus state={props.state} desktop={props.desktop} preview={props.preview} />
      <Group title={t("desk.privacy_page_send_title")}>
        {STEPS.map((step) => (
          <Row key={step.id} title={step.title()} description={step.text()} />
        ))}
      </Group>
      <Group title={t("desk.privacy_page_levels_title")}>
        {LEVELS.map((level) => (
          <Row key={level.id} title={privacyLevelLabel(level.id)} description={level.detail()}>
            {!props.preview && level.id === props.state.level ? (
              <Badge tone="success" size="sm">
                {t("desk.privacy_page_your_level")}
              </Badge>
            ) : editable ? (
              <Button size="sm" variant="ghost" loading={props.busy} onClick={() => props.onLevel(level.id)}>
                {t("desk.privacy_page_use_level")}
              </Button>
            ) : null}
          </Row>
        ))}
      </Group>
      {props.state.locked && !props.preview ? (
        <p className="desk-settings__note">
          {icons.lock(BUTTON_ICON)}
          {props.state.setBy
            ? t("desk.privacy_page_level_locked_by", { name: props.state.setBy })
            : t("desk.privacy_page_level_locked")}
        </p>
      ) : null}
      {props.preview ? null : (
        <Group title={t("desk.privacy_page_names_title")}>
          <Row title={t("desk.privacy_page_names_title")} description={t("desk.privacy_page_names_text")}>
            <div className="flex w-full flex-col gap-2">
              <Textarea
                aria-label={t("desk.privacy_page_names_title")}
                value={names}
                disabled={!editable}
                rows={4}
                onChange={(event) => setNames(event.currentTarget.value)}
              />
              {editable ? (
                <div>
                  <Button size="sm" variant="secondary" disabled={!changed} loading={props.busy} onClick={() => props.onNames(parseNames(names))}>
                    {t("desk.privacy_page_names_save")}
                  </Button>
                </div>
              ) : null}
            </div>
          </Row>
        </Group>
      )}
      <Group title={t("desk.privacy_page_where_title")}>
        <Row title={t("desk.privacy_page_where_desktop_title")} description={t("desk.privacy_page_where_desktop_text")} />
        <Row title={t("desk.privacy_page_where_miss_title")} description={t("desk.privacy_page_where_miss_text")} />
      </Group>
    </div>
  );
}

/** `/privacy`, inside the Desk frame. Settings live in the workspace; sample data without a server. */
export function DeskPrivacyScreen(props: { desktop?: boolean }) {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const showToast = useFrameStore((state) => state.showToast);
  const queryClient = useQueryClient();
  const services = useMemo(() => createDeskServices({ client, workspaceId }), [client, workspaceId]);
  const desktop = props.desktop ?? isDesktopRuntime();
  const key = [PRIVACY_QUERY_KEY, workspaceId ?? "preview"];
  const privacy = useQuery({ queryKey: key, queryFn: () => services.privacy.get(), staleTime: 30_000 });
  const change = useMutation({
    mutationFn: (patch: { level: PrivacyLevel } | { names: string[] }) =>
      "level" in patch ? services.privacy.setLevel(patch.level) : services.privacy.setNames(patch.names),
    onSuccess: (result, patch) => {
      queryClient.setQueryData(key, result);
      // The menu and the composer read the level too.
      void queryClient.invalidateQueries({ queryKey: ["desk-nav"] });
      void queryClient.invalidateQueries({ queryKey: ["desk-composer"] });
      if ("names" in patch) showToast(t("desk.privacy_page_names_saved"));
    },
    onError: () => showToast(t("desk.privacy_page_failed"), t("desk.settings_try_again"), "danger"),
  });
  const result = privacy.data;
  const state = result?.data;

  return (
    <DeskShell current="privacy" title={t("desk.nav_privacy")} meta={result && !result.preview ? privacyLevelMeta(result.data.level) : undefined}>
      {privacy.isLoading ? (
        <Skeleton variant="text" lines={5} />
      ) : !result || !state ? (
        <EmptyState title={t("desk.privacy_page_error_title")} description={t("desk.settings_try_again")} />
      ) : (
        <PrivacyView
          key={state.names.join("\n")}
          state={state}
          desktop={desktop}
          preview={result.preview}
          busy={change.isPending}
          onLevel={(level) => change.mutate({ level })}
          onNames={(names) => change.mutate({ names })}
        />
      )}
    </DeskShell>
  );
}
