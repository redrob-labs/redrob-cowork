/** @jsxImportSource react */
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button, Input, icons } from "@redrob-labs/ui";

import { pickDirectory } from "../../../app/lib/desktop";
import { isDesktopRuntime } from "../../../app/lib/runtime-env";
import { t } from "../../../i18n";
import { useCoworkComposerStore } from "../composer/composer-state";
import { useCoworkConnection } from "../shell/cowork-connection";
import { CoworkDialog } from "../shell/cowork-dialog";
import { useFrameStore } from "../store/frame-store";
import { PROJECTS_QUERY_KEY, singleFolder } from "./cowork-projects";
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
  /** A folder the person chose for the project; null keeps Cowork's own folder. */
  folder: string | null;
  /** Choosing a folder needs the desktop app's picker. */
  canChooseFolder: boolean;
  // Opens the system folder picker.
  onChooseFolder: () => void;
  // Goes back to Cowork's own folder.
  onResetFolder: () => void;
};

/** The last part of a path, for the folder row: `C:\Users\me\Clients\Acme` reads "Acme". */
function folderLabel(path: string): string {
  // Either separator, so Windows and POSIX paths both work; a bare root keeps the whole path.
  return path.split(/[\\/]+/).filter(Boolean).pop() ?? path;
}

// Names the folder group for assistive tech; one dialog is open at a time, so a fixed id is safe.
const FOLDER_LABEL_ID = "cowork-project-folder-label";

/**
 * Where the project's files go. By default Cowork keeps them in a folder it makes; Choose folder
 * opens the system picker so a project can live in a folder of the person's (a client folder, a
 * repo).
 *
 * Laid out with the DS field anatomy (`rr-field`, `rr-field__label`, `rr-field__hint`) so the label,
 * its gap and the hint match the Name field above it. The row is one white card: a folder tile, a
 * title over a sub line (the default and what it means, or the chosen folder's name over its full
 * path) and Choose folder… / Change… on the right. A chosen folder adds a hint with a way back to
 * Cowork's folder. Without the desktop picker the row only explains the default.
 */
export function ProjectFolderField(props: {
  folder: string | null;
  canChoose: boolean;
  busy: boolean;
  onChoose: () => void;
  onReset: () => void;
}) {
  // A folder of the person's, rather than Cowork's default.
  const chosen = props.folder !== null;
  return (
    <div className="rr-field cowork-project-folder" role="group" aria-labelledby={FOLDER_LABEL_ID}>
      {/* The field label, styled like Name above it. */}
      <span className="rr-field__label" id={FOLDER_LABEL_ID}>
        {t("cowork.project_dialog_folder")}
      </span>
      {/* One card: folder tile, title over sub line, and the choose button. */}
      <div className="cowork-project-folder__row" data-chosen={chosen || undefined}>
        <span className="cowork-project-folder__tile">{icons.folder({ width: 16, height: 16, "aria-hidden": true })}</span>
        <span className="cowork-project-folder__text">
          {/* The chosen folder's name, or what the default means. */}
          <span className="cowork-project-folder__title">
            {props.folder ? folderLabel(props.folder) : t("cowork.project_dialog_folder_cowork")}
          </span>
          {/* The full path can be long: it truncates at the end and shows whole on hover. */}
          <span className="cowork-project-folder__sub" title={props.folder ?? undefined}>
            {props.folder ?? t("cowork.project_dialog_folder_cowork_sub")}
          </span>
        </span>
        {/* Only the desktop app has a folder picker. */}
        {props.canChoose ? (
          <Button size="sm" variant="secondary" disabled={props.busy} onClick={props.onChoose}>
            {chosen ? t("cowork.project_dialog_folder_change") : t("cowork.project_dialog_folder_choose")}
          </Button>
        ) : null}
      </div>
      {/* A chosen folder says where files go, with the way back to the default. */}
      {chosen ? (
        <span className="rr-field__hint cowork-project-folder__hint">
          {t("cowork.project_dialog_folder_hint")}{" "}
          <button type="button" className="cowork-project-folder__reset" disabled={props.busy} onClick={props.onReset}>
            {t("cowork.project_dialog_folder_reset")}
          </button>
        </span>
      ) : null}
    </div>
  );
}

/** Asks for a name and, optionally, a folder of the person's. Save as a project says the chat moves in. */
export function ProjectDialogView(props: ProjectDialogViewProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    props.onSubmit();
  };
  return (
    <CoworkDialog
      open
      title={props.saving ? t("cowork.project_save_title") : t("cowork.projects_new")}
      onClose={props.onCancel}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={props.onCancel}>
            {t("cowork.project_dialog_cancel")}
          </Button>
          <Button variant="primary" loading={props.busy} onClick={props.onSubmit}>
            {props.saving ? t("cowork.project_dialog_save") : t("cowork.project_dialog_create")}
          </Button>
        </>
      }
    >
      <form className="cowork-project-form" onSubmit={submit}>
        <p className="cowork-hint">{props.saving ? t("cowork.project_save_lede") : t("cowork.project_new_lede")}</p>
        <Input
          id="cowork-project-name"
          label={t("cowork.project_dialog_name")}
          placeholder={t("cowork.project_dialog_name_placeholder")}
          value={props.name}
          error={props.error ?? undefined}
          onChange={(event) => props.onNameChange(event.target.value)}
        />
        {/* Where the project's files go; Cowork's own folder unless one is chosen. */}
        <ProjectFolderField
          folder={props.folder}
          canChoose={props.canChooseFolder}
          busy={props.busy}
          onChoose={props.onChooseFolder}
          onReset={props.onResetFolder}
        />
      </form>
    </CoworkDialog>
  );
}

function ProjectForm(props: { chatId: string | null; fromWorkspaceId: string | null; initialName: string; onClose: () => void }) {
  const client = useCoworkConnection((state) => state.client);
  // The project the chat is in now, which Save as a project moves it out of.
  const workspaceId = props.fromWorkspaceId;
  const showToast = useFrameStore((state) => state.showToast);
  const setMemory = useCoworkComposerStore((state) => state.setMemory);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(props.initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A folder of the person's for the project; null keeps Cowork's own (the default).
  const [folder, setFolder] = useState<string | null>(null);
  const chooseFolder = () => {
    pickDirectory({ title: t("cowork.project_dialog_folder_pick_title") })
      // A cancelled picker returns nothing and keeps the current choice.
      .then((selection) => {
        const picked = singleFolder(selection);
        if (picked) setFolder(picked);
      })
      // A picker that fails to open leaves the default in place and says so.
      .catch(() => showToast(t("cowork.project_folder_failed_title"), t("cowork.project_folder_failed_text"), "danger"));
  };

  const submit = () => {
    if (busy) return;
    setBusy(true);
    const from = props.chatId && workspaceId ? { chatId: props.chatId, workspaceId } : null;
    // A chosen folder makes a local project on it; none keeps Cowork's managed folder.
    createProject({ client, navigate, toast: showToast, close: props.onClose, setMemory }, { name, from, folder })
      .then((result) => {
        if (result.status === "invalid") setError(result.error);
        if (result.status === "created" || result.status === "not-moved") {
          void queryClient.invalidateQueries({ queryKey: [PROJECTS_QUERY_KEY] });
          void queryClient.invalidateQueries({ queryKey: ["cowork-nav"] });
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
      folder={folder}
      // The picker is an Electron dialog; the web build explains the default only.
      canChooseFolder={isDesktopRuntime()}
      onChooseFolder={chooseFolder}
      onResetFolder={() => setFolder(null)}
    />
  );
}

/**
 * The frame's project dialog: New project, or Save as a project with the chat's title filled in.
 * `fromWorkspaceId` is the project the chat is in now (a chat "..." menu can name any chat); it
 * defaults to the open one.
 */
export function ProjectDialog(props: { chatId: string | null; fromWorkspaceId?: string; onClose: () => void }) {
  const client = useCoworkConnection((state) => state.client);
  const openWorkspaceId = useCoworkConnection((state) => state.workspaceId);
  // A chat "..." menu names the chat's own project; otherwise it is the open one.
  const workspaceId = props.fromWorkspaceId ?? openWorkspaceId;
  const title = useQuery({
    queryKey: ["cowork-project-chat-title", workspaceId, props.chatId],
    enabled: Boolean(client && workspaceId && props.chatId),
    queryFn: async () =>
      client && workspaceId && props.chatId ? (await client.getSession(workspaceId, props.chatId)).item.title : "",
    staleTime: STALE_MS,
  });
  const initialName = nameFromChatTitle(title.data ?? "");
  // Keyed by the name, so the field fills in once the chat's title arrives.
  return <ProjectForm key={initialName} chatId={props.chatId} fromWorkspaceId={workspaceId} initialName={initialName} onClose={props.onClose} />;
}

export function SaveAsProjectButton(props: { onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      iconLeft={icons.folderPlus({ width: 14, height: 14, "aria-hidden": true })}
      onClick={props.onClick}
    >
      {t("cowork.project_save_title")}
    </Button>
  );
}

/** The chat header's Save as a project, for a chat in no project. */
export function SaveAsProjectAction(props: { chatId: string | null }) {
  const client = useCoworkConnection((state) => state.client);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
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
