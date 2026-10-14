/** @jsxImportSource react */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, SchedulePicker, Select, Skeleton, Tabs, Textarea, type ScheduleValue } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import {
  initialScheduleValue,
  previewKey,
  sampleProject,
  saveSchedule,
  scheduleFromPicker,
  usePreviewServices,
} from "../preview/preview";
import type { DeskSkill, Schedule, ScheduleTarget } from "../services/types";
import { DeskDialog } from "../shell/desk-dialog";
import { useDeskConnection } from "../shell/desk-connection";
import { useFrameStore } from "../store/frame-store";
import { ruleFromPicker, ruleToPickerValue } from "./schedules";

/** The server takes up to this many characters of prompt or instructions. */
const TEXT_LIMIT = 20_000;

/** The dialog's fields. Both kinds keep what was typed, so switching back loses nothing. */
export type ScheduleDraft = {
  kind: ScheduleTarget["kind"];
  text: string;
  skill: string;
  instructions: string;
  value: ScheduleValue;
};

/** The fields for a schedule to change, or for a new one (with a prompt or a skill to start from). */
export function scheduleDraft(input: { schedule?: Schedule; prompt?: string; skill?: string; now: Date }): ScheduleDraft {
  const { schedule } = input;
  const start = initialScheduleValue({ cadence: schedule?.cadence ?? "" }, input.now);
  const value = schedule?.rule ? { ...start, ...ruleToPickerValue(schedule.rule) } : start;
  const target = schedule?.target;
  if (target?.kind === "skill") return { kind: "skill", text: "", skill: target.name, instructions: target.instructions ?? "", value };
  if (!target && input.skill) return { kind: "skill", text: "", skill: input.skill, instructions: "", value };
  return { kind: "prompt", text: target?.text ?? input.prompt ?? "", skill: "", instructions: "", value };
}

/** What the draft runs, or null while it is not complete. */
export function targetFromDraft(draft: ScheduleDraft): ScheduleTarget | null {
  if (draft.kind === "prompt") {
    const text = draft.text.trim();
    return text && text.length <= TEXT_LIMIT ? { kind: "prompt", text } : null;
  }
  const instructions = draft.instructions.trim();
  if (!draft.skill || instructions.length > TEXT_LIMIT) return null;
  return instructions ? { kind: "skill", name: draft.skill, instructions } : { kind: "skill", name: draft.skill };
}

/** Save needs something to run and, on real data, a time: the server cannot watch for a file arriving. */
export function canSaveSchedule(draft: ScheduleDraft, real: boolean): boolean {
  return targetFromDraft(draft) !== null && (!real || ruleFromPicker(draft.value) !== null);
}

export type ScheduleDialogViewProps = {
  draft: ScheduleDraft;
  editing: boolean;
  /** Real data hides the file-arrives mode. */
  real: boolean;
  now: Date;
  projectName?: string;
  /** Null while they load. */
  skills: DeskSkill[] | null;
  /** False until the project to run in is known. */
  ready: boolean;
  busy: boolean;
  onChange: (draft: ScheduleDraft) => void;
  onSave: () => void;
  onClose: () => void;
};

function SkillFields(props: Pick<ScheduleDialogViewProps, "draft" | "skills" | "onChange">) {
  const { draft, skills } = props;
  if (!skills) return <Skeleton variant="text" lines={2} />;
  if (!skills.length) return <p className="desk-settings__description">{t("desk.scheduled_no_skills")}</p>;
  return (
    <>
      <Select
        id="desk-schedule-skill"
        label={t("desk.scheduled_skill_label")}
        placeholder={t("desk.scheduled_skill_placeholder")}
        value={draft.skill || undefined}
        options={skills.map((skill) => ({ value: skill.name, label: skill.name, detail: skill.description }))}
        onChange={(_event, option) => props.onChange({ ...draft, skill: typeof option?.value === "string" ? option.value : "" })}
      />
      <Textarea
        id="desk-schedule-instructions"
        label={t("desk.scheduled_instructions_label")}
        hint={t("desk.scheduled_instructions_hint")}
        rows={3}
        value={draft.instructions}
        onChange={(event) => props.onChange({ ...draft, instructions: event.target.value })}
      />
    </>
  );
}

/** A short, human read-back of the chosen schedule, composed from the picker value. */
function scheduleReadback(value: ScheduleValue, real: boolean): string {
  const mode = value.mode ?? "once";
  if (mode === "event" && !real) return t("desk.preview_schedule_mode_event");
  const time = typeof value.time === "string" && value.time ? value.time : "";
  const zone = typeof value.zone === "string" && value.zone ? value.zone.split("/").pop()?.replace(/_/g, " ") ?? "" : "";
  const parts: string[] = [];
  if (mode === "repeat") {
    const freq = typeof value.freq === "string" ? value.freq : "";
    parts.push(t("desk.preview_schedule_mode_repeat"));
    if (freq) parts.push(freq);
  } else {
    parts.push(t("desk.preview_schedule_mode_once"));
    if (typeof value.date === "string" && value.date) parts.push(value.date);
  }
  if (time) parts.push(time);
  if (zone) parts.push(zone);
  return parts.filter(Boolean).join(" · ");
}

/** What to run, when, then review — three steps. */
export function ScheduleDialogView(props: ScheduleDialogViewProps) {
  const { draft } = props;
  const [step, setStep] = useState(0);
  const TOTAL = 3;

  // Step gates: step 1 needs a runnable target; step 2 (on real data) needs a time; step 3 just saves.
  const whatReady = targetFromDraft(draft) !== null;
  const whenReady = !props.real || ruleFromPicker(draft.value) !== null;
  const canNext = step === 0 ? whatReady : step === 1 ? whenReady : true;
  const canSave = props.ready && canSaveSchedule(draft, props.real);

  const stepTitle = [t("desk.scheduled_step_what"), t("desk.scheduled_step_when"), t("desk.scheduled_step_review")][step];

  const runsReadback =
    draft.kind === "prompt"
      ? draft.text.trim()
      : `/${draft.skill}${draft.instructions.trim() ? `: ${draft.instructions.trim()}` : ""}`;

  return (
    <DeskDialog
      open
      title={props.editing ? t("desk.scheduled_edit_title") : t("desk.scheduled_new_title")}
      onClose={props.onClose}
      width={520}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs text-subtle-foreground">
            {t("desk.scheduled_step_count", { step: step + 1, total: TOTAL })}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={step === 0 ? props.onClose : () => setStep((s) => s - 1)}>
              {step === 0 ? t("desk.preview_cancel") : t("common.back")}
            </Button>
            {step < TOTAL - 1 ? (
              <Button variant="primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                {t("common.next")}
              </Button>
            ) : (
              <Button variant="primary" disabled={!props.ready || !canSave} loading={props.busy} onClick={props.onSave}>
                {t("desk.preview_schedule_save")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5 py-1">
        <span className="text-sm font-semibold text-dls-text">{stepTitle}</span>

        {/* Step 1 — What to run */}
        {step === 0 ? (
          <Tabs
            variant="pill"
            label={t("desk.scheduled_what_label")}
            value={draft.kind}
            onChange={(id) => props.onChange({ ...draft, kind: id === "skill" ? "skill" : "prompt" })}
            items={[
              { id: "prompt", label: t("desk.scheduled_kind_prompt") },
              { id: "skill", label: t("desk.scheduled_kind_skill") },
            ]}
          >
            <div className="flex flex-col gap-4 pt-4">
              {draft.kind === "prompt" ? (
                <Textarea
                  id="desk-schedule-prompt"
                  label={t("desk.scheduled_prompt_label")}
                  hint={t("desk.scheduled_prompt_hint")}
                  rows={5}
                  value={draft.text}
                  onChange={(event) => props.onChange({ ...draft, text: event.target.value })}
                />
              ) : (
                <SkillFields draft={draft} skills={props.skills} onChange={props.onChange} />
              )}
            </div>
          </Tabs>
        ) : null}

        {/* Step 2 — When */}
        {step === 1 ? (
          <SchedulePicker
            value={draft.value}
            onChange={(value) => props.onChange({ ...draft, value })}
            now={props.now}
            where={props.projectName}
            weekStart={1}
            label={t("desk.preview_schedule_label")}
            modes={[
              ["once", t("desk.preview_schedule_mode_once")],
              ["repeat", t("desk.preview_schedule_mode_repeat")],
              ...(props.real ? [] : ([["event", t("desk.preview_schedule_mode_event")]] satisfies Array<[string, string]>)),
            ]}
            dateLabel={t("desk.preview_schedule_date")}
            repeatLabel={t("desk.preview_schedule_repeat")}
            timeLabel={t("desk.preview_schedule_time")}
            zoneLabel={t("desk.preview_schedule_zone")}
            startLabel={t("desk.preview_schedule_start")}
          />
        ) : null}

        {/* Step 3 — Review: a roomy read-back of what runs and when, then Save. */}
        {step === 2 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/40 p-4">
              <span className="text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
                {t("desk.scheduled_review_runs")}
              </span>
              <p className="whitespace-pre-wrap break-words text-sm text-dls-text">{runsReadback}</p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/40 p-4">
              <span className="text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
                {t("desk.scheduled_review_schedule")}
              </span>
              <p className="text-sm text-dls-text">{scheduleReadback(draft.value, props.real)}</p>
            </div>
          </div>
        ) : null}
      </div>
    </DeskDialog>
  );
}

/**
 * New schedule, or a change to `schedule`. Real data saves to the open project; sample data
 * changes only the sample schedules, in the schedule's sample project or `sampleProjectId`.
 */
export function ScheduleDialog(props: {
  schedule?: Schedule;
  /** A prompt to start a new schedule from. */
  prompt?: string;
  /** A skill to start a new schedule from. */
  skill?: string;
  sampleProjectId?: string;
  real: boolean;
  now?: Date;
  onClose: () => void;
}) {
  const { services, scope } = usePreviewServices();
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const projects = useQuery({
    queryKey: [...previewKey(scope, "board"), "projects"],
    queryFn: () => services.projects.list(),
    enabled: props.real,
    staleTime: 60_000,
  });
  const skills = useQuery({ queryKey: previewKey(scope, "skills"), queryFn: () => services.skills.list(), staleTime: 30_000 });
  const [now] = useState(() => props.now ?? new Date());
  const [draft, setDraft] = useState(() => scheduleDraft({ schedule: props.schedule, prompt: props.prompt, skill: props.skill, now }));
  const [busy, setBusy] = useState(false);
  const project = props.real
    ? projects.data?.data.find((entry) => entry.id === workspaceId)
    : sampleProject(props.schedule?.projectId ?? props.sampleProjectId);

  const save = async () => {
    const target = targetFromDraft(draft);
    if (!target || !project) return;
    setBusy(true);
    const saved = await saveSchedule(
      { schedules: services.schedules, queryClient, scope, showToast },
      scheduleFromPicker(target, project, draft.value, now),
      props.schedule?.id,
    );
    setBusy(false);
    if (saved) props.onClose();
  };

  return (
    <ScheduleDialogView
      draft={draft}
      editing={Boolean(props.schedule)}
      real={props.real}
      now={now}
      projectName={project?.name}
      skills={skills.data?.data ?? (skills.isError ? [] : null)}
      ready={Boolean(project)}
      busy={busy}
      onChange={setDraft}
      onSave={() => void save()}
      onClose={props.onClose}
    />
  );
}

/** Asks before a schedule is deleted. */
export function DeleteScheduleDialog(props: { name: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <DeskDialog
      open
      title={t("desk.scheduled_delete_title")}
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            {t("desk.preview_cancel")}
          </Button>
          <Button variant="danger" loading={props.busy} onClick={props.onConfirm}>
            {t("desk.scheduled_delete")}
          </Button>
        </>
      }
    >
      <p>{t("desk.scheduled_delete_text", { name: props.name })}</p>
    </DeskDialog>
  );
}
