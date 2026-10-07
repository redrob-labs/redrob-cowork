/** @jsxImportSource react */
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button, Input, icons } from "@redrob-labs/ui";

import { t } from "../../../i18n";
import { useDeskComposerStore } from "../composer/composer-state";
import { useDeskConnection } from "../shell/desk-connection";
import { DeskDialog } from "../shell/desk-dialog";
import { useFrameStore } from "../store/frame-store";
import { PROJECTS_QUERY_KEY } from "./desk-projects";
import { createProject, nameFromChatTitle, offersSaveAsProject } from "./projects";

const STALE_MS = 30_000;

export type ProjectDialogViewProps = {
  /** Save as a project, for a chat; otherwise New project. */
  saving: boolean;
  name: string;
  error: string | null;
  busy: boolean;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

/** Asks only for a name. Save as a project says the chat moves in. */
export function ProjectDialogView(props: ProjectDialogViewProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    props.onSubmit();
  };
  return (
    <DeskDialog
      open
      title={props.saving ? t("desk.project_save_title") : t("desk.projects_new")}
      onClose={props.onCancel}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={props.onCancel}>
            {t("desk.project_dialog_cancel")}
          </Button>
          <Button variant="primary" loading={props.busy} onClick={props.onSubmit}>
            {props.saving ? t("desk.project_dialog_save") : t("desk.project_dialog_create")}
          </Button>
        </>
      }
    >
      <form className="desk-project-form" onSubmit={submit}>
        <p className="desk-hint">{props.saving ? t("desk.project_save_lede") : t("desk.project_new_lede")}</p>
        <Input
          id="desk-project-name"
          label={t("desk.project_dialog_name")}
          placeholder={t("desk.project_dialog_name_placeholder")}
          value={props.name}
          error={props.error ?? undefined}
          onChange={(event) => props.onNameChange(event.target.value)}
        />
      </form>
    </DeskDialog>
  );
}

function ProjectForm(props: { chatId: string | null; initialName: string; onClose: () => void }) {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const showToast = useFrameStore((state) => state.showToast);
  const setMemory = useDeskComposerStore((state) => state.setMemory);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(props.initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (busy) return;
    setBusy(true);
    const from = props.chatId && workspaceId ? { chatId: props.chatId, workspaceId } : null;
    createProject({ client, navigate, toast: showToast, close: props.onClose, setMemory }, { name, from })
      .then((result) => {
        if (result.status === "invalid") setError(result.error);
        if (result.status === "created" || result.status === "not-moved") {
          void queryClient.invalidateQueries({ queryKey: [PROJECTS_QUERY_KEY] });
          void queryClient.invalidateQueries({ queryKey: ["desk-nav"] });
        }
      })
      .finally(() => setBusy(false));
  };

  return (
    <ProjectDialogView
      saving={Boolean(props.chatId)}
      name={name}
      error={error}
      busy={busy}
      onNameChange={(next) => {
        setName(next);
        setError(null);
      }}
      onCancel={props.onClose}
      onSubmit={submit}
    />
  );
}

/** The frame's project dialog: New project, or Save as a project with the chat's title filled in. */
export function ProjectDialog(props: { chatId: string | null; onClose: () => void }) {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const title = useQuery({
    queryKey: ["desk-project-chat-title", workspaceId, props.chatId],
    enabled: Boolean(client && workspaceId && props.chatId),
    queryFn: async () =>
      client && workspaceId && props.chatId ? (await client.getSession(workspaceId, props.chatId)).item.title : "",
    staleTime: STALE_MS,
  });
  const initialName = nameFromChatTitle(title.data ?? "");
  // Keyed by the name, so the field fills in once the chat's title arrives.
  return <ProjectForm key={initialName} chatId={props.chatId} initialName={initialName} onClose={props.onClose} />;
}

export function SaveAsProjectButton(props: { onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      iconLeft={icons.folderPlus({ width: 14, height: 14, "aria-hidden": true })}
      onClick={props.onClick}
    >
      {t("desk.project_save_title")}
    </Button>
  );
}

/** The chat header's Save as a project, for a chat in no project. */
export function SaveAsProjectAction(props: { chatId: string | null }) {
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const openModal = useFrameStore((state) => state.openModal);
  const workspace = useQuery({
    queryKey: [PROJECTS_QUERY_KEY, "workspace", workspaceId],
    enabled: Boolean(client && workspaceId),
    queryFn: async () => (await client?.listWorkspaces())?.items.find((entry) => entry.id === workspaceId) ?? null,
    staleTime: STALE_MS,
  });
  if (!offersSaveAsProject({ chatId: props.chatId, workspace: workspace.data ?? null })) return null;
  return <SaveAsProjectButton onClick={() => openModal({ kind: "project", chatId: props.chatId })} />;
}
