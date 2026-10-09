/** @jsxImportSource react */
import { useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Select, Textarea } from "@redrob-labs/ui";

import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { previewKey, usePreviewServices } from "../preview/preview";
import type { DeskServices } from "../services/desk-services";
import type { SkillDetail, SkillDraft, SkillTaxonomy } from "../services/types";
import { DeskDialog } from "../shell/desk-dialog";
import { useFrameStore } from "../store/frame-store";
import { canSaveSkill, isValidSkillName, SKILL_DESCRIPTION_MAX, skillSlug } from "./skills";
import { invalidateSkills } from "./use-skills";

/** What the dialog holds: the draft, and the title the name follows until the name is typed. */
export type SkillDialogState = { draft: SkillDraft; title: string; nameTouched: boolean };

const NONE = "none";

/** A new skill, maybe with instructions to start from, or the fields of one to change. */
export function skillDialogState(skill: SkillDetail | null, instructions = ""): SkillDialogState {
  if (!skill) return { draft: { name: "", description: "", instructions, editing: false }, title: "", nameTouched: false };
  return {
    draft: { name: skill.name, description: skill.description, instructions: skill.body, editing: true, ...skill.tags },
    title: "",
    nameTouched: true,
  };
}

/** Typing a title fills in the name, until the name is typed itself. */
export function withTitle(state: SkillDialogState, title: string): SkillDialogState {
  return { ...state, title, draft: state.nameTouched ? state.draft : { ...state.draft, name: skillSlug(title) } };
}

/** A tag picked in the dialog. A new profession clears a task that is not one of its own. */
export function withTag(draft: SkillDraft, key: "profession" | "task" | "language", value: string, taxonomy: SkillTaxonomy | null): SkillDraft {
  const next: SkillDraft = { ...draft };
  if (value === NONE || !value) delete next[key];
  else next[key] = value;
  if (key === "profession") {
    const tasks = taxonomy?.professions.find((profession) => profession.id === next.profession)?.tasks ?? [];
    if (!tasks.some((task) => task.id === next.task)) delete next.task;
  }
  return next;
}

export type SkillDialogViewProps = {
  state: SkillDialogState;
  taxonomy: SkillTaxonomy | null;
  locale: string;
  busy: boolean;
  onChange: (state: SkillDialogState) => void;
  onSave: () => void;
  onClose: () => void;
};

export function SkillDialogView(props: SkillDialogViewProps) {
  const { state, taxonomy } = props;
  const { draft } = state;
  const label = (value: { en: string; ko: string }) => (props.locale.startsWith("ko") ? value.ko : value.en);
  const none = { value: NONE, label: t("desk.skill_tag_none") };
  const profession = taxonomy?.professions.find((entry) => entry.id === draft.profession);
  const setTag = (key: "profession" | "task" | "language") => (_event: unknown, option?: { value: string | number }) =>
    props.onChange({ ...state, draft: withTag(draft, key, String(option?.value ?? NONE), taxonomy) });
  const nameError = draft.name && !isValidSkillName(draft.name) ? t("desk.skill_name_invalid") : undefined;
  const descriptionError = draft.description.length > SKILL_DESCRIPTION_MAX ? t("desk.skill_description_too_long") : undefined;

  return (
    <DeskDialog
      open
      title={draft.editing ? t("desk.skill_edit_title") : t("desk.skill_new_title")}
      onClose={props.onClose}
      width={600}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            {t("desk.preview_cancel")}
          </Button>
          <Button variant="primary" disabled={!canSaveSkill(draft)} loading={props.busy} onClick={props.onSave}>
            {t("desk.skill_save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {draft.editing ? null : (
          <Input
            id="desk-skill-title"
            label={t("desk.skill_title_label")}
            value={state.title}
            onChange={(event) => props.onChange(withTitle(state, event.target.value))}
          />
        )}
        <Input
          id="desk-skill-name"
          label={t("desk.skill_name_label")}
          hint={draft.editing ? t("desk.skill_name_fixed") : t("desk.skill_name_hint")}
          error={nameError}
          value={draft.name}
          readOnly={draft.editing}
          onChange={(event) => props.onChange({ ...state, nameTouched: true, draft: { ...draft, name: event.target.value } })}
        />
        <Textarea
          id="desk-skill-description"
          label={t("desk.skill_description_label")}
          hint={t("desk.skill_description_hint")}
          error={descriptionError}
          rows={2}
          value={draft.description}
          onChange={(event) => props.onChange({ ...state, draft: { ...draft, description: event.target.value } })}
        />
        <div className="desk-skills__filters">
          <Select
            id="desk-skill-profession"
            label={t("desk.skills_profession")}
            value={draft.profession ?? NONE}
            options={[none, ...(taxonomy?.professions ?? []).map((entry) => ({ value: entry.id, label: label(entry.label) }))]}
            onChange={setTag("profession")}
          />
          <Select
            id="desk-skill-task"
            label={t("desk.skills_task")}
            value={draft.task ?? NONE}
            disabled={!profession}
            options={[none, ...(profession?.tasks ?? []).map((entry) => ({ value: entry.id, label: label(entry.label) }))]}
            onChange={setTag("task")}
          />
          <Select
            id="desk-skill-language"
            label={t("desk.skills_language")}
            value={draft.language ?? NONE}
            options={[none, ...(taxonomy?.languages ?? []).map((entry) => ({ value: entry.id, label: label(entry.label) }))]}
            onChange={setTag("language")}
          />
        </div>
        <Textarea
          id="desk-skill-instructions"
          label={t("desk.skill_instructions_label")}
          hint={t("desk.skill_instructions_hint")}
          rows={10}
          value={draft.instructions}
          onChange={(event) => props.onChange({ ...state, draft: { ...draft, instructions: event.target.value } })}
        />
      </div>
    </DeskDialog>
  );
}

/** Saves the skill and refreshes the lists; a toast either way. */
export async function saveSkill(
  deps: {
    skills: Pick<DeskServices["skills"], "save">;
    invalidate: () => void;
    showToast: (title: string, text?: string, tone?: "danger") => void;
  },
  draft: SkillDraft,
): Promise<boolean> {
  try {
    const result = await deps.skills.save(draft);
    deps.invalidate();
    deps.showToast(t("desk.skill_saved"), result.preview ? t("desk.preview_toast_text") : undefined);
    return true;
  } catch {
    deps.showToast(t("desk.skill_save_failed"), t("desk.settings_try_again"), "danger");
    return false;
  }
}

/** The frame's skill dialog: a new skill, maybe from a message, or a change to one of the person's own. */
export function SkillDialog(props: { name?: string; instructions?: string; onClose: () => void }) {
  const { services, scope } = usePreviewServices();
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const locale = useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
  const existing = useQuery({
    queryKey: [...previewKey(scope, "skills"), "one", props.name ?? "new"],
    queryFn: () => (props.name ? services.skills.get(props.name) : Promise.resolve(null)),
    enabled: Boolean(props.name),
  });
  const taxonomy = useQuery({ queryKey: previewKey(scope, "taxonomy"), queryFn: () => services.skills.taxonomy(), staleTime: 5 * 60_000 });
  const [state, setState] = useState<SkillDialogState | null>(props.name ? null : skillDialogState(null, props.instructions));
  const [busy, setBusy] = useState(false);
  const current = state ?? (existing.data?.data ? skillDialogState(existing.data.data) : null);
  if (!current) return null;
  return (
    <SkillDialogView
      state={current}
      taxonomy={taxonomy.data?.data ?? null}
      locale={locale}
      busy={busy}
      onChange={setState}
      onClose={props.onClose}
      onSave={() => {
        setBusy(true);
        void saveSkill({ skills: services.skills, invalidate: () => invalidateSkills(queryClient, scope), showToast }, current.draft).then((saved) => {
          setBusy(false);
          if (saved) props.onClose();
        });
      }}
    />
  );
}
