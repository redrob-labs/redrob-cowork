/** @jsxImportSource react */
import { useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { ApprovalStep, EmptyState, ScheduleRow, SectionMark, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import type { ScheduleBoard } from "../services/types";
import { DeskShell } from "../shell/desk-shell";
import { useFrameStore } from "../store/frame-store";
import { PreviewPage, PreviewState } from "./preview-note";
import {
  answerWaiting,
  formatDay,
  formatWhen,
  previewIcon,
  previewKey,
  sampleProjectName,
  samplePlaybook,
  setScheduleEnabled,
  usePreviewServices,
  type BoardActionDeps,
} from "./preview";

/** The header meta: how many schedules run and how many are paused. */
export function scheduledMeta(board: ScheduleBoard): string {
  const on = board.schedules.filter((schedule) => schedule.enabled).length;
  return t("desk.preview_scheduled_meta", { on, paused: board.schedules.length - on });
}

export type ScheduledViewProps = {
  board: ScheduleBoard;
  locale: string;
  onAnswer: (waitingId: string, approved: boolean) => void;
  onToggle: (scheduleId: string, enabled: boolean) => void;
};

/** The runs waiting for an answer first, then every schedule. */
export function ScheduledView(props: ScheduledViewProps) {
  const { board, locale } = props;
  const waiting = board.waiting.length;
  return (
    <>
      <section className="desk-settings__group">
        <SectionMark
          label={waiting ? t("desk.preview_waiting_count", { count: waiting }) : t("desk.preview_waiting")}
          as="heading"
          level={2}
        />
        {waiting ? (
          <>
            <p className="desk-settings__description">{t("desk.preview_waiting_lede")}</p>
            <ul className="desk-preview__list">
              {board.waiting.map((run) => {
                const playbook = samplePlaybook(run.playbookId);
                return (
                  <li key={run.id} className="desk-preview__wait">
                    <p className="desk-preview__meta">
                      {playbook ? previewIcon(playbook.icon, 14) : null}
                      <span>{playbook?.name}</span>
                      <span aria-hidden="true">-</span>
                      <span>{sampleProjectName(run.projectId)}</span>
                      <span aria-hidden="true">-</span>
                      <span>{t("desk.preview_asked", { when: formatWhen(run.askedAt, locale) })}</span>
                    </p>
                    <ApprovalStep
                      title={run.title}
                      description={run.description}
                      detail={run.detail}
                      approveLabel={t("desk.preview_go_ahead")}
                      rejectLabel={t("desk.preview_not_now")}
                      onApprove={() => props.onAnswer(run.id, true)}
                      onReject={() => props.onAnswer(run.id, false)}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <EmptyState
            compact
            icon={icons.circleCheck({ width: 18, height: 18, "aria-hidden": true })}
            title={t("desk.preview_waiting_none")}
          />
        )}
      </section>
      <section className="desk-settings__group">
        <SectionMark
          label={t("desk.preview_on_schedule")}
          as="heading"
          level={2}
          trailing={
            <Link className="desk-settings__action" to="/playbooks">
              {icons.plus({ width: 14, height: 14, "aria-hidden": true })}
              {t("desk.preview_schedule_a_playbook")}
            </Link>
          }
        />
        <ul className="desk-preview__list">
          {board.schedules.map((schedule) => {
            const name = samplePlaybook(schedule.playbookId)?.name ?? "";
            return (
              <li key={schedule.id}>
                <ScheduleRow
                  name={name}
                  cadence={schedule.cadence}
                  nextRun={schedule.nextRunAt === null ? undefined : formatDay(schedule.nextRunAt, locale)}
                  lastRun={
                    schedule.lastRun
                      ? { state: schedule.lastRun.state, at: formatWhen(schedule.lastRun.at, locale), label: schedule.lastRun.label }
                      : undefined
                  }
                  enabled={schedule.enabled}
                  switchLabel={t("desk.preview_schedule_switch", { name })}
                  onToggle={(event) => props.onToggle(schedule.id, event.target.checked)}
                />
                <p className="desk-preview__meta">{t("desk.preview_in_project", { name: sampleProjectName(schedule.projectId) })}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** `/scheduled`. Answers and pauses change only the sample state, which the menu's count reads too. */
export function ScheduledScreen() {
  const { services, scope } = usePreviewServices();
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const query = useQuery({ queryKey: previewKey(scope, "board"), queryFn: () => services.schedules.list(), staleTime: Infinity });
  const deps: BoardActionDeps = { schedules: services.schedules, queryClient, scope, showToast };
  const board = query.data?.data;

  return (
    <DeskShell current="scheduled" title={t("desk.nav_scheduled")} meta={board ? scheduledMeta(board) : undefined}>
      <PreviewPage note={t("desk.preview_scheduled_note")}>
        <PreviewState query={query}>
          {(data) => (
            <ScheduledView
              board={data}
              locale={locale}
              onAnswer={(id, approved) => void answerWaiting(deps, id, approved)}
              onToggle={(id, enabled) => void setScheduleEnabled(deps, id, enabled)}
            />
          )}
        </PreviewState>
      </PreviewPage>
    </DeskShell>
  );
}
