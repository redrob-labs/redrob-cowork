/** @jsxImportSource react */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Textarea } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import type { DeskServices } from "../services/desk-services";
import type { Playbook, PlaybookDraft } from "../services/types";
import { DeskDialog } from "../shell/desk-dialog";
import { useFrameStore } from "../store/frame-store";
import { previewKey, usePreviewServices } from "../preview/preview";
import { parseTemplate } from "./playbooks";

/** The prompt a playbook sends, without the title and steps the dialog shows on their own. */
export function promptBody(template: string): string {
  const lines = template.replace(/\r\n/g, "\n").split("\n");
  const { title, steps } = parseTemplate(template);
  let index = 0;
  const skipBlank = () => {
    while (index < lines.length && !lines[index]?.trim()) index += 1;
  };
  skipBlank();
  if (title) index += 1;
  skipBlank();
  index += steps.length;
  return lines.slice(index).join("\n").trim();
}

/** The dialog's fields for a playbook, or empty ones for a new playbook from a prompt. */
export function draftFor(playbook: Playbook | null, prompt = ""): PlaybookDraft {
  if (!playbook) return { name: "", description: "", steps: [], prompt };
  return {
    id: playbook.id,
    name: playbook.name,
    description: playbook.summary,
    steps: playbook.steps.map((step) => (step.approval ? `${step.label} (ask first)` : step.label)),
    prompt: promptBody(playbook.prompt ?? ""),
  };
}

export function canSavePlaybook(draft: PlaybookDraft): boolean {
  return Boolean(draft.name.trim() && draft.prompt.trim());
}

export type PlaybookDialogViewProps = {
  draft: PlaybookDraft;
  busy: boolean;
  onChange: (draft: PlaybookDraft) => void;
  onSave: () => void;
  onClose: () => void;
};

export function PlaybookDialogView(props: PlaybookDialogViewProps) {
  const { draft } = props;
  return (
    <DeskDialog
      open
      title={draft.id ? t("desk.playbook_edit_title") : t("desk.playbook_new_title")}
      onClose={props.onClose}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            {t("desk.preview_cancel")}
          </Button>
          <Button variant="primary" disabled={!canSavePlaybook(draft)} loading={props.busy} onClick={props.onSave}>
            {t("desk.playbook_save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          id="desk-playbook-name"
          label={t("desk.playbook_name_label")}
          value={draft.name}
          onChange={(event) => props.onChange({ ...draft, name: event.target.value })}
        />
        <Input
          id="desk-playbook-description"
          label={t("desk.playbook_description_label")}
          value={draft.description}
          onChange={(event) => props.onChange({ ...draft, description: event.target.value })}
        />
        <Textarea
          id="desk-playbook-steps"
          label={t("desk.playbook_steps_label")}
          hint={t("desk.playbook_steps_hint")}
          rows={4}
          value={draft.steps.join("\n")}
          onChange={(event) => props.onChange({ ...draft, steps: event.target.value.split(/\r?\n/) })}
        />
        <Textarea
          id="desk-playbook-prompt"
          label={t("desk.playbook_prompt_label")}
          hint={t("desk.playbook_prompt_hint")}
          rows={6}
          value={draft.prompt}
          onChange={(event) => props.onChange({ ...draft, prompt: event.target.value })}
        />
      </div>
    </DeskDialog>
  );
}

/** Saves a playbook and refreshes the list; a toast either way. */
export async function savePlaybook(
  deps: {
    playbooks: Pick<DeskServices["playbooks"], "save">;
    invalidate: () => void;
    showToast: (title: string, text?: string, tone?: "danger") => void;
  },
  draft: PlaybookDraft,
): Promise<boolean> {
  try {
    await deps.playbooks.save({ ...draft, steps: draft.steps.map((step) => step.trim()).filter(Boolean) });
    deps.invalidate();
    deps.showToast(t("desk.playbook_saved"));
    return true;
  } catch {
    deps.showToast(t("desk.playbook_save_failed"), t("desk.settings_try_again"), "danger");
    return false;
  }
}

/** The frame's playbook dialog: new, from a prompt, or to change one. */
export function PlaybookDialog(props: { playbookId?: string; prompt?: string; onClose: () => void }) {
  const { services, scope } = usePreviewServices();
  const queryClient = useQueryClient();
  const showToast = useFrameStore((state) => state.showToast);
  const existing = useQuery({
    queryKey: [...previewKey(scope, "playbooks"), "one", props.playbookId ?? "new"],
    queryFn: () => (props.playbookId ? services.playbooks.get(props.playbookId) : Promise.resolve(null)),
    enabled: Boolean(props.playbookId),
  });
  const [draft, setDraft] = useState<PlaybookDraft | null>(props.playbookId ? null : draftFor(null, props.prompt));
  const [busy, setBusy] = useState(false);
  const current = draft ?? (existing.data?.data ? draftFor(existing.data.data) : null);
  if (!current) return null;
  return (
    <PlaybookDialogView
      draft={current}
      busy={busy}
      onChange={setDraft}
      onClose={props.onClose}
      onSave={() => {
        setBusy(true);
        void savePlaybook(
          {
            playbooks: services.playbooks,
            invalidate: () => void queryClient.invalidateQueries({ queryKey: previewKey(scope, "playbooks") }),
            showToast,
          },
          current,
        ).then((saved) => {
          setBusy(false);
          if (saved) props.onClose();
        });
      }}
    />
  );
}
