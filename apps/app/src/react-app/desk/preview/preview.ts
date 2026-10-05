import { useMemo } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { describeSchedule, icons, nextScheduledRun, type IconName, type ScheduleValue } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { DeskServices } from "../services/desk-services";
import { runScripted } from "../services/fixture-services";
import { PLAYBOOKS } from "../services/fixtures/playbooks";
import { PROJECTS } from "../services/fixtures/projects";
import { createDeskServices } from "../services/real-services";
import type { DeskResult, NewSchedule, Playbook, Project, ScheduleBoard } from "../services/types";
import { ruleFromPicker } from "../scheduled/schedules";
import { useDeskConnection } from "../shell/desk-connection";
import type { DeskTimers } from "../timers";

/*
 * Helpers for the Playbooks, Scheduled and History screens and the sample run. Each reads
 * the Desk services, which are real where a server is connected and sample data otherwise;
 * a result says which, and the screens show the sample note only for sample data.
 */

export const PREVIEW_QUERY_KEY = "desk-preview";

export type PreviewPart = "playbooks" | "board" | "history" | "catalog";

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

/** The sample playbook a schedule or a run points at. Sample data joins sample data only. */
export function samplePlaybook(id: string): Playbook | undefined {
  return PLAYBOOKS.find((playbook) => playbook.id === id);
}

export function sampleProjectName(id: string): string {
  return PROJECTS.find((project) => project.id === id)?.name ?? "";
}

/** Where a playbook runs: the project that keeps it, or the first one. */
export function projectForPlaybook(playbookId: string): Project | undefined {
  return PROJECTS.find((project) => project.playbookIds.includes(playbookId)) ?? PROJECTS[0];
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

/* ---------- Scheduled: answering, pausing, saving ---------- */

export type BoardActionDeps = {
  schedules: Pick<DeskServices["schedules"], "answer" | "setEnabled" | "save">;
  queryClient: Pick<QueryClient, "setQueryData" | "invalidateQueries">;
  scope: string;
  showToast: (title: string, text?: string) => void;
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

export async function saveSchedule(deps: BoardActionDeps, schedule: NewSchedule) {
  const result = await deps.schedules.save(schedule);
  keepBoard(deps, result);
  deps.showToast(t("desk.preview_schedule_saved"), sampleNote(result));
  return result;
}

function isoDay(day: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** The picker's starting point, as the prototype sets it: a file-triggered playbook starts on a new file. */
export function initialScheduleValue(playbook: Pick<Playbook, "cadence">, today: Date): ScheduleValue {
  return {
    mode: /arrives|sends/.test(playbook.cadence) ? "event" : "repeat",
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
  playbookId: string,
  project: Pick<Project, "id" | "name">,
  value: ScheduleValue,
  now: Date,
): NewSchedule {
  const next = value.mode === "event" ? null : nextScheduledRun(value, now);
  // The sentence ends with the next run, which the schedule row shows on its own.
  const sentence = describeSchedule(value, { where: project.name, now }).split(" Next run")[0] ?? "";
  const rule = ruleFromPicker(value);
  return {
    playbookId,
    projectId: project.id,
    cadence: sentence.replace(/\.$/, ""),
    nextRunAt: next ? next.getTime() : null,
    ...(rule ? { rule } : {}),
  };
}

/* ---------- A playbook run ---------- */

export type RunStep = { id: string; label: string; detail?: string; approval?: string };
export type RunPhase = "running" | "waiting" | "done" | "stopped";
/** `done` steps are finished; the step at `done` is the one in progress or waiting. */
export type RunProgress = { done: number; phase: RunPhase };

export const RUN_START: RunProgress = { done: 0, phase: "running" };

export function runSteps(playbook: Pick<Playbook, "id" | "steps">): RunStep[] {
  return playbook.steps.map((step, index) => ({ id: `${playbook.id}-${index + 1}`, ...step }));
}

/** The first step at or after `from` that asks a person first, or the end. */
export function nextStop(steps: readonly RunStep[], from: number): number {
  const index = steps.findIndex((step, at) => at >= from && Boolean(step.approval));
  return index === -1 ? steps.length : index;
}

/**
 * Plays the steps from `from` up to the next one that asks first, one every 650ms (the
 * prototype's pace), then waits there or finishes. Sample timing only: nothing runs. Returns
 * a cancel function.
 */
export function playRun(
  steps: readonly RunStep[],
  from: number,
  onProgress: (progress: RunProgress) => void,
  options: { stepMs?: number; timers?: DeskTimers } = {},
): () => void {
  const stop = nextStop(steps, from);
  return runScripted(
    steps.slice(from, stop),
    {
      onStep: (_step, index) => onProgress({ done: from + index + 1, phase: "running" }),
      onAnswer: () => onProgress({ done: stop, phase: stop < steps.length ? "waiting" : "done" }),
    },
    options,
  );
}

export function stepState(index: number, progress: RunProgress): "done" | "active" | "todo" {
  if (index < progress.done) return "done";
  if (index === progress.done && (progress.phase === "running" || progress.phase === "waiting")) return "active";
  return "todo";
}

export type RunStatus = { state: "running" | "blocked" | "done" | "stopped"; label: string };

export function runStatus(progress: RunProgress): RunStatus {
  switch (progress.phase) {
    case "running":
      return { state: "running", label: t("desk.preview_run_running") };
    case "waiting":
      return { state: "blocked", label: t("desk.preview_run_waiting") };
    case "done":
      return { state: "done", label: t("desk.preview_run_done") };
    case "stopped":
      return { state: "stopped", label: t("desk.preview_run_stopped") };
  }
}

/** `/run` for one playbook. */
export function runPath(playbookId: string): string {
  return `/run?playbook=${encodeURIComponent(playbookId)}`;
}
