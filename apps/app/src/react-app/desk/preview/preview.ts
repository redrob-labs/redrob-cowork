import { useMemo } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { describeSchedule, icons, nextScheduledRun, type IconName, type ScheduleValue } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { DeskServices } from "../services/desk-services";
import { PROJECTS } from "../services/fixtures/projects";
import { createDeskServices } from "../services/real-services";
import type { DeskResult, NewSchedule, Project, ScheduleBoard, ScheduleTarget } from "../services/types";
import { ruleFromPicker } from "../scheduled/schedules";
import { useDeskConnection } from "../shell/desk-connection";

/*
 * Helpers for the Skills, Scheduled and History screens. Each reads
 * the Desk services, which are real where a server is connected and sample data otherwise;
 * a result says which, and the screens show the sample note only for sample data.
 */

export const PREVIEW_QUERY_KEY = "desk-preview";

/** `skills` is what is installed; `library`, `taxonomy` and `team` are where skills come from. */
export type PreviewPart = "board" | "history" | "catalog" | "skills" | "library" | "taxonomy" | "team";

export function previewKey(scope: string, part: PreviewPart): string[] {
  return [PREVIEW_QUERY_KEY, scope, part];
}

/** The menu's count of runs waiting (see `useDeskNavData`). */
export function navWaitingKey(scope: string): string[] {
  return ["desk-nav", scope, "waiting"];
}

/** The Desk services for the open project, and the scope its queries are keyed by. */
export function usePreviewServices(): { services: DeskServices; scope: string } {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const services = useMemo(() => createDeskServices({ client, workspaceId }), [client, workspaceId]);
  return { services, scope: workspaceId ?? "preview" };
}

const ICON = { width: 16, height: 16, "aria-hidden": true };

function isIconName(name: string): name is IconName {
  return Object.hasOwn(icons, name);
}

/** A fixture's icon name as the icon, with a neutral one for a name the set does not have. */
export function previewIcon(name: string, size = 16) {
  return icons[isIconName(name) ? name : "repeat"]({ ...ICON, width: size, height: size });
}

export function sampleProjectName(id: string): string {
  return PROJECTS.find((project) => project.id === id)?.name ?? "";
}

/** The sample project a sample schedule runs in, or the first one. */
export function sampleProject(id: string | undefined): Project | undefined {
  return PROJECTS.find((project) => project.id === id) ?? PROJECTS[0];
}

/** "Mon 28 Sep, 08:14", in the person's language. */
export function formatWhen(at: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}

/** "Mon 5 Oct", in the person's language. */
export function formatDay(at: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(new Date(at));
}

/* ---------- Scheduled: answering, pausing, saving, deleting ---------- */

export type BoardActionDeps = {
  schedules: Pick<DeskServices["schedules"], "answer" | "setEnabled" | "save" | "update" | "remove">;
  queryClient: Pick<QueryClient, "setQueryData" | "invalidateQueries">;
  scope: string;
  showToast: (title: string, text?: string, tone?: "danger") => void;
};

/** A toast on sample data says nothing ran; on real data there is nothing to add. */
function sampleNote(result: DeskResult<unknown>): string | undefined {
  return result.preview ? t("desk.preview_toast_text") : undefined;
}

function keepBoard(deps: BoardActionDeps, result: DeskResult<ScheduleBoard>) {
  deps.queryClient.setQueryData(previewKey(deps.scope, "board"), result);
}

/** Answers a waiting run: it leaves the list, and the menu's count follows. */
export async function answerWaiting(deps: BoardActionDeps, waitingId: string, approved: boolean) {
  const result = await deps.schedules.answer(waitingId, approved);
  keepBoard(deps, result);
  void deps.queryClient.invalidateQueries({ queryKey: navWaitingKey(deps.scope) });
  deps.showToast(approved ? t("desk.preview_answered_yes") : t("desk.preview_answered_no"), sampleNote(result));
  return result;
}

export async function setScheduleEnabled(deps: BoardActionDeps, scheduleId: string, enabled: boolean) {
  const result = await deps.schedules.setEnabled(scheduleId, enabled);
  keepBoard(deps, result);
  deps.showToast(enabled ? t("desk.preview_schedule_on") : t("desk.preview_schedule_paused"), sampleNote(result));
  return result;
}

/** Saves a new schedule, or changes the one with `scheduleId`. A toast either way; null when it failed. */
export async function saveSchedule(deps: BoardActionDeps, schedule: NewSchedule, scheduleId?: string) {
  try {
    const result = scheduleId ? await deps.schedules.update(scheduleId, schedule) : await deps.schedules.save(schedule);
    keepBoard(deps, result);
    deps.showToast(t("desk.preview_schedule_saved"), sampleNote(result));
    return result;
  } catch {
    deps.showToast(t("desk.scheduled_save_failed"), t("desk.settings_try_again"), "danger");
    return null;
  }
}

/** Deletes a schedule; the runs it was waiting on leave with it. A toast either way; null when it failed. */
export async function deleteSchedule(deps: BoardActionDeps, scheduleId: string) {
  try {
    const result = await deps.schedules.remove(scheduleId);
    keepBoard(deps, result);
    void deps.queryClient.invalidateQueries({ queryKey: navWaitingKey(deps.scope) });
    deps.showToast(t("desk.scheduled_deleted"), sampleNote(result));
    return result;
  } catch {
    deps.showToast(t("desk.scheduled_delete_failed"), t("desk.settings_try_again"), "danger");
    return null;
  }
}

function isoDay(day: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** The picker's starting point, as the prototype sets it: a schedule run by a file arriving starts on a new file. */
export function initialScheduleValue(schedule: { cadence: string }, today: Date): ScheduleValue {
  return {
    mode: /arrives|sends/.test(schedule.cadence) ? "event" : "repeat",
    date: isoDay(today),
    start: isoDay(today),
    time: "08:00",
    zone: "Asia/Seoul",
    freq: "weekly",
    days: ["1"],
  };
}

/** What the picker chose, as the schedule to save. */
export function scheduleFromPicker(
  target: ScheduleTarget,
  project: Pick<Project, "id" | "name">,
  value: ScheduleValue,
  now: Date,
): NewSchedule {
  const next = value.mode === "event" ? null : nextScheduledRun(value, now);
  // The sentence ends with the next run, which the schedule row shows on its own.
  const sentence = describeSchedule(value, { where: project.name, now }).split(" Next run")[0] ?? "";
  const rule = ruleFromPicker(value);
  return {
    target,
    projectId: project.id,
    cadence: sentence.replace(/\.$/, ""),
    nextRunAt: next ? next.getTime() : null,
    ...(rule ? { rule } : {}),
  };
}
