import type { ScheduleValue } from "@redrob-labs/ui";

import type { RedrobScheduleRule, RedrobScheduleRunState, RedrobScheduleState } from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";
import type { Schedule, ScheduleBoard, WaitingRun } from "../services/types";

/** The picker's value as a rule the server runs on. A file arriving is not something it can watch. */
export function ruleFromPicker(value: ScheduleValue): RedrobScheduleRule | null {
  if (value.mode !== "once" && value.mode !== "repeat") return null;
  if (!value.time || !value.zone) return null;
  return {
    mode: value.mode,
    time: value.time,
    zone: value.zone,
    ...(value.date ? { date: value.date } : {}),
    ...(value.start ? { start: value.start } : {}),
    ...(value.freq ? { freq: value.freq } : {}),
    ...(value.days ? { days: value.days } : {}),
    ...(value.dom ? { dom: value.dom } : {}),
  };
}

function lastRunOf(state: RedrobScheduleRunState, at: number): NonNullable<Schedule["lastRun"]> {
  switch (state) {
    case "running":
      return { state: "running", at, label: t("desk.scheduled_run_running") };
    case "waiting":
      return { state: "blocked", at, label: t("desk.preview_run_waiting") };
    case "done":
      return { state: "done", at, label: t("desk.scheduled_run_done") };
    case "missed":
      return { state: "stopped", at, label: t("desk.scheduled_run_missed") };
    case "failed":
      return { state: "failed", at, label: t("desk.scheduled_run_failed") };
  }
}

/** What a step asks for, in words. */
export function askLabel(permission: string): string {
  if (permission === "bash") return t("desk.scheduled_ask_command");
  if (permission === "edit" || permission === "write") return t("desk.scheduled_ask_edit");
  if (permission === "webfetch") return t("desk.scheduled_ask_web");
  if (permission === "external_directory") return t("desk.scheduled_ask_folder");
  return t("desk.scheduled_ask_unknown");
}

/** The server's schedules and waiting asks as the Scheduled screen shows them. */
export function boardFromState(state: RedrobScheduleState, projectId: string): ScheduleBoard {
  const schedules: Schedule[] = state.schedules.map((schedule) => ({
    id: schedule.id,
    playbookId: schedule.playbookId,
    projectId,
    cadence: schedule.label,
    nextRunAt: schedule.enabled ? schedule.nextRunAt : null,
    lastRun: schedule.lastRun ? lastRunOf(schedule.lastRun.state, schedule.lastRun.at) : null,
    enabled: schedule.enabled,
  }));
  const waiting: WaitingRun[] = state.waiting.map((ask) => ({
    id: ask.id,
    playbookId: state.schedules.find((schedule) => schedule.id === ask.scheduleId)?.playbookId ?? "",
    projectId,
    title: askLabel(ask.permission),
    description: t("desk.scheduled_ask_text"),
    detail: ask.patterns.join(", "),
    askedAt: ask.askedAt,
  }));
  return { schedules, waiting };
}
