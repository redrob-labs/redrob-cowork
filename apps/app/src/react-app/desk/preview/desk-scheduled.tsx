/** @jsxImportSource react */
import { useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApprovalStep, Button, EmptyState, ScheduleRow, SectionMark, icons } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { DeleteScheduleDialog, ScheduleDialog } from "../scheduled/schedule-dialog";
import type { Schedule, ScheduleBoard, ScheduleTarget } from "../services/types";
import { DeskShell } from "../shell/desk-shell";
import { useFrameStore } from "../store/frame-store";
import { PreviewPage, PreviewState } from "./preview-note";
import {
  answerWaiting,
  deleteSchedule,
  formatDay,
  formatWhen,
  previewIcon,
  previewKey,
  sampleProjectName,
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
  /** Sample data names sample projects; real data names the workspace's. */
  projectName?: (id: string) => string;
  /** Real schedules run only while the app is open, and the screen says so. */
  real?: boolean;
  onAnswer: (waitingId: string, approved: boolean) => void;
  onToggle: (scheduleId: string, enabled: boolean) => void;
  onNew: () => void;
  onEdit: (schedule: Schedule) => void;
  onDelete: (schedule: Schedule) => void;
};

const ACTION_ICON = { width: 14, height: 14, "aria-hidden": true };

const targetIcon = (target: ScheduleTarget) => previewIcon(target.kind === "skill" ? "sparkle" : "message", 14);

/** The runs waiting for an answer first, then every schedule. */
export function ScheduledView(props: ScheduledViewProps) {
  const { board, locale } = props;
  const waiting = board.waiting.length;
  const projectName = props.projectName ?? sampleProjectName;
  return (
    <>
      {props.real ? <p className="desk-settings__note">{t("desk.scheduled_only_open")}</p> : null}
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
              {board.waiting.map((run) => (
                <li key={run.id} className="desk-preview__wait">
                  <p className="desk-preview__meta">
                    {targetIcon(run.target)}
                    <span>{run.name}</span>
                    <span aria-hidden="true">-</span>
                    <span>{projectName(run.projectId)}</span>
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
              ))}
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
        />
        {board.schedules.length ? null : (
          <EmptyState
            compact
            icon={icons.calendarClock({ width: 18, height: 18, "aria-hidden": true })}
            title={t("desk.scheduled_empty_title")}
            description={t("desk.scheduled_empty_text")}
            action={
              <Button size="sm" variant="secondary" iconLeft={icons.plus(ACTION_ICON)} onClick={props.onNew}>
                {t("desk.scheduled_new")}
              </Button>
            }
          />
        )}
        <ul className="desk-preview__list">
          {board.schedules.map((schedule) => {
            const { name } = schedule;
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
                <p className="desk-preview__meta">
                  {targetIcon(schedule.target)}
                  <span>{t("desk.preview_in_project", { name: projectName(schedule.projectId) })}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconLeft={icons.edit(ACTION_ICON)}
                    aria-label={t("desk.scheduled_edit_label", { name })}
                    onClick={() => props.onEdit(schedule)}
                  >
                    {t("desk.scheduled_edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconLeft={icons.trash(ACTION_ICON)}
                    aria-label={t("desk.scheduled_delete_label", { name })}
                    onClick={() => props.onDelete(schedule)}
                  >
                    {t("desk.scheduled_delete")}
                  </Button>
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** `/scheduled`: the workspace's schedules and the runs waiting on an answer, real where a server is connected. */
export function ScheduledScreen() {
  const { services, scope } = usePreviewServices();
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  // Refreshed while open: the server moves runs along on its own.
  const query = useQuery({ queryKey: previewKey(scope, "board"), queryFn: () => services.schedules.list(), staleTime: 15_000, refetchInterval: 30_000 });
  const projects = useQuery({ queryKey: [...previewKey(scope, "board"), "projects"], queryFn: () => services.projects.list(), staleTime: 60_000 });
  const deps: BoardActionDeps = { schedules: services.schedules, queryClient, scope, showToast };
  const board = query.data?.data;
  const real = query.data ? !query.data.preview : false;
  // The dialog open: a new schedule, or the one being changed.
  const [editing, setEditing] = useState<{ schedule?: Schedule } | null>(null);
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmDelete = async (schedule: Schedule) => {
    setBusy(true);
    await deleteSchedule(deps, schedule.id);
    setBusy(false);
    setDeleting(null);
  };

  return (
    <DeskShell
      current="scheduled"
      title={t("desk.nav_scheduled")}
      meta={board ? scheduledMeta(board) : undefined}
      actions={
        <Button size="sm" variant="secondary" iconLeft={icons.plus(ACTION_ICON)} onClick={() => setEditing({})}>
          {t("desk.scheduled_new")}
        </Button>
      }
    >
      <PreviewPage note={t("desk.preview_scheduled_note")} preview={!real}>
        <PreviewState query={query}>
          {(data) => (
            <ScheduledView
              board={data}
              locale={locale}
              real={real}
              {...(real
                ? { projectName: (id: string) => projects.data?.data.find((entry) => entry.id === id)?.name ?? "" }
                : {})}
              onAnswer={(id, approved) => void answerWaiting(deps, id, approved)}
              onToggle={(id, enabled) => void setScheduleEnabled(deps, id, enabled)}
              onNew={() => setEditing({})}
              onEdit={(schedule) => setEditing({ schedule })}
              onDelete={setDeleting}
            />
          )}
        </PreviewState>
      </PreviewPage>
      {editing ? <ScheduleDialog schedule={editing.schedule} real={real} onClose={() => setEditing(null)} /> : null}
      {deleting ? (
        <DeleteScheduleDialog
          name={deleting.name}
          busy={busy}
          onConfirm={() => void confirmDelete(deleting)}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </DeskShell>
  );
}
