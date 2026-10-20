/** @jsxImportSource react */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { Alert, ApprovalStep, Button, EmptyState, Skeleton, icons } from "@redrob-labs/ui";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { openDesktopPath, pickDirectory, workspaceForget } from "../../../app/lib/desktop";
import { isDesktopRuntime } from "../../../app/lib/runtime-env";
import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { deleteProject, renameProject } from "../chats/chat-actions";
import { ConfirmDeleteDialog, InlineRename, RowMoreMenu } from "../chats/chat-menu";
import { refreshChatLists } from "../composer/add-menu";
import { SAMPLE_NOW } from "../services/fixtures/sample-day";
import { useCoworkConnection } from "../shell/cowork-connection";
import { CoworkShell } from "../shell/cowork-shell";
import { formatNavTime } from "../shell/nav";
import { useFrameStore } from "../store/frame-store";
import { allowProjectFolder, folderAskView, useFolderAskStore, type FolderAskView } from "./folder-ask";
import {
  loadProjectDetail,
  loadProjectRows,
  projectChatPath,
  projectPath,
  type ProjectChat,
  type ProjectDetail,
  type ProjectRow,
} from "./projects";

const ROW_ICON = { width: 16, height: 16, "aria-hidden": true };
const BUTTON_ICON = { width: 14, height: 14, "aria-hidden": true };
const STALE_MS = 30_000;

/** The query keys of the Projects screens; a new project or a moved chat refreshes them. */
export const PROJECTS_QUERY_KEY = "cowork-projects";

function useLocale(): string {
  return useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
}

function ProjectFigures(props: { project: Pick<ProjectRow, "chatCount" | "fileCount"> }) {
  return (
    <>
      {props.project.chatCount === null ? null : (
        <span className="cowork-project-row__fig">{t("cowork.projects_chats", { count: props.project.chatCount })}</span>
      )}
      {props.project.fileCount === null ? null : (
        <span className="cowork-project-row__fig">{t("cowork.projects_files", { count: props.project.fileCount })}</span>
      )}
    </>
  );
}

export type ProjectsViewActions = {
  // Saves an inline rename.
  onRename: (project: ProjectRow, value: string) => void;
  // Opens the folder in the system file manager.
  onOpenFolder: (project: ProjectRow) => void;
  // Asks before deleting.
  onDelete: (project: ProjectRow) => void;
};

export type ProjectsViewProps = {
  projects: readonly ProjectRow[];
  now: number;
  locale: string;
  /** The "..." menu on each row (real projects only): Rename, Open project folder, Delete. */
  actions?: ProjectsViewActions;
};

/**
 * Every project: name, one line about it, its counts and when it was last active. With `actions`,
 * each row has a "..." menu on hover or focus (the link's sibling, not inside it): Rename (inline,
 * like chats), Open project folder, and Delete (danger, last).
 */
export function ProjectsView(props: ProjectsViewProps) {
  // The row being renamed in place, by project id.
  const [renaming, setRenaming] = useState<string | null>(null);
  // The row whose menu is open, so it stays highlighted.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  if (props.projects.length === 0) {
    return (
      <EmptyState
        icon={icons.folder({ width: 20, height: 20, "aria-hidden": true })}
        title={t("cowork.projects_empty_title")}
        description={t("cowork.projects_empty_text")}
      />
    );
  }
  // Read once; narrowed for the closures below.
  const actions = props.actions;
  return (
    <div className="cowork-projects">
      <p className="cowork-projects__lede">{t("cowork.projects_lede")}</p>
      <ul className="cowork-projects__list">
        {props.projects.map((project) => (
          <li key={project.id} className="cowork-project-item" data-menu-open={menuFor === project.id || undefined}>
            {/* Renaming: the link becomes the same row with a text box for the name. */}
            {renaming === project.id && actions ? (
              <div className="cowork-project-row">
                <span className="cowork-project-row__icon">{icons.folder(ROW_ICON)}</span>
                <span className="cowork-project-row__text">
                  <InlineRename
                    value={project.name}
                    label={t("cowork.project_name_input")}
                    onSave={(value) => {
                      setRenaming(null);
                      actions.onRename(project, value);
                    }}
                    onCancel={() => setRenaming(null)}
                  />
                </span>
              </div>
            ) : (
              <Link className="cowork-project-row" to={projectPath(project.id)}>
                <span className="cowork-project-row__icon">{icons.folder(ROW_ICON)}</span>
                <span className="cowork-project-row__text">
                  <b>{project.name}</b>
                  <span>{project.about ?? t("cowork.projects_about_none")}</span>
                </span>
                <ProjectFigures project={project} />
                <span className="cowork-project-row__when">
                  {project.lastActiveAt === null ? null : formatNavTime(project.lastActiveAt, props.now, props.locale)}
                </span>
              </Link>
            )}
            {/* The "..." menu beside the link; hidden while renaming. */}
            {actions && renaming !== project.id ? (
              <RowMoreMenu name={project.name} open={menuFor === project.id} onOpenChange={(open) => setMenuFor(open ? project.id : null)}>
                {/* Rename, inline like chats. */}
                <DropdownMenuItem onClick={() => setRenaming(project.id)}>
                  {icons.edit(ROW_ICON)}
                  <span className="cowork-add-menu__text">{t("cowork.chat_rename")}</span>
                </DropdownMenuItem>
                {/* Open project folder; off for a project with no known folder. */}
                <DropdownMenuItem disabled={!project.path} onClick={() => actions.onOpenFolder(project)}>
                  {icons.folderOpen(ROW_ICON)}
                  <span className="cowork-add-menu__text">{t("cowork.project_open_folder")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Delete: last and in danger red; the screen asks first. */}
                <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete(project)}>
                  {icons.trash(ROW_ICON)}
                  <span className="cowork-add-menu__text">{t("cowork.chat_delete")}</span>
                </DropdownMenuItem>
              </RowMoreMenu>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewProjectButton() {
  const openModal = useFrameStore((state) => state.openModal);
  return (
    <Button
      size="sm"
      variant="secondary"
      iconLeft={icons.plus(BUTTON_ICON)}
      onClick={() => openModal({ kind: "project", chatId: null })}
    >
      {t("cowork.projects_new")}
    </Button>
  );
}

/** `/projects`. Sample projects until a chat route has connected to the server. */
export function ProjectsScreen() {
  const client = useCoworkConnection((state) => state.client);
  const locale = useLocale();
  const projects = useQuery({
    queryKey: [PROJECTS_QUERY_KEY, client ? "live" : "preview", "list"],
    queryFn: () => loadProjectRows(client),
    staleTime: STALE_MS,
  });
  const rows = projects.data?.data ?? [];
  const now = projects.data?.preview ? SAMPLE_NOW : Date.now();
  // Rename, open folder and delete for the rows.
  const projectActions = useProjectActions();
  // The project whose delete is being confirmed.
  const [deleting, setDeleting] = useState<ProjectRow | null>(null);

  return (
    <CoworkShell
      current="projects"
      title={t("cowork.nav_projects")}
      meta={projects.data ? t("cowork.projects_meta", { count: rows.length }) : undefined}
      actions={<NewProjectButton />}
    >
      {projects.isLoading ? (
        <Skeleton variant="text" lines={5} />
      ) : projects.isError ? (
        <EmptyState title={t("cowork.projects_error_title")} description={t("cowork.projects_error_text")} />
      ) : (
        <ProjectsView
          projects={rows}
          now={now}
          locale={locale}
          // Sample projects cannot be renamed, opened or deleted, so the menus appear on real data only.
          actions={
            projects.data?.preview
              ? undefined
              : {
                  onRename: (project, value) => void projectActions.rename(project, value),
                  onOpenFolder: (project) => void projectActions.openFolder(project),
                  onDelete: setDeleting,
                }
          }
        />
      )}
      {/* Asks first, with the chat count, and says the folder stays. */}
      {deleting ? (
        <ConfirmDeleteDialog
          title={t("cowork.project_delete_title")}
          text={
            deleting.chatCount
              ? t("cowork.project_delete_text", { name: deleting.name, count: deleting.chatCount })
              : t("cowork.project_delete_text_empty", { name: deleting.name })
          }
          note={t("cowork.project_delete_files_note")}
          onConfirm={() => projectActions.remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </CoworkShell>
  );
}

/**
 * The Projects page's row actions. Rename sets the display name (the folder keeps its own).
 * Open project folder opens it in the system file manager. Delete removes the project and its
 * chats but never its folder or files; deleting the project that is open reloads the app, so
 * the window does not keep running against a project that is gone.
 */
function useProjectActions() {
  // The server; null while offline, which each action reports as a failure.
  const client = useCoworkConnection((state) => state.client);
  // The open project, which needs a reload once it is deleted.
  const openWorkspaceId = useCoworkConnection((state) => state.workspaceId);
  // Failures and deletes say so.
  const showToast = useFrameStore((state) => state.showToast);
  // Every change refreshes the lists the project appears in.
  const queryClient = useQueryClient();
  // Leaves a deleted open project.
  const navigate = useNavigate();
  return {
    rename: async (project: ProjectRow, value: string) => {
      // Only a real change refreshes the lists.
      if (await renameProject({ client, toast: showToast }, { projectId: project.id, value, previous: project.name })) {
        refreshChatLists(queryClient);
      }
    },
    openFolder: async (project: ProjectRow) => {
      // The menu item is disabled without a path; this guards a stale press.
      if (!project.path) return;
      try {
        await openDesktopPath(project.path);
      } catch {
        showToast(t("cowork.project_open_folder_failed"), t("cowork.settings_try_again"), "danger");
      }
    },
    remove: async (project: ProjectRow) => {
      // Desktop also forgets it from its own list, so a refresh cannot bring it back.
      const deleted = await deleteProject(
        { client, forget: isDesktopRuntime() ? workspaceForget : undefined, toast: showToast },
        { projectId: project.id },
      );
      // A failed delete already said so and changed nothing.
      if (!deleted) return;
      refreshChatLists(queryClient);
      // The window must not keep running against a project that is gone.
      if (project.id === openWorkspaceId) {
        navigate("/projects");
        window.location.reload();
      }
    },
  };
}

export type FolderAskProps = {
  view: FolderAskView;
  projectName: string;
  folderName: string;
  busy: boolean;
  onAllow: () => void;
  onNotNow: () => void;
};

/** The ask for a folder of the person's, in the project itself, or the alert that says it was given. */
export function FolderAsk(props: FolderAskProps) {
  if (props.view.kind === "allowed") {
    return (
      <Alert tone="success" title={t("cowork.project_folder_allowed_title", { folder: props.view.folder })}>
        {t("cowork.project_folder_allowed_text")}
      </Alert>
    );
  }
  if (props.view.kind === "none") return null;
  const idle = () => {};
  return (
    <ApprovalStep
      title={t("cowork.project_folder_title", { name: props.projectName })}
      description={t("cowork.project_folder_text", { name: props.folderName })}
      approveLabel={t("cowork.project_folder_allow")}
      rejectLabel={t("cowork.project_folder_not_now")}
      onApprove={props.busy ? idle : props.onAllow}
      onReject={props.busy ? idle : props.onNotNow}
    />
  );
}

export type ProjectViewProps = {
  detail: ProjectDetail;
  folderAsk: Omit<FolderAskProps, "projectName" | "folderName">;
  now: number;
  locale: string;
  /** Opens the Files panel; null when the panel shows another project's files. */
  onShowFiles: (() => void) | null;
};

function ProjectChats(props: { projectId: string; chats: readonly ProjectChat[]; now: number; locale: string }) {
  if (props.chats.length === 0) {
    return (
      <EmptyState
        compact
        icon={icons.message({ width: 18, height: 18, "aria-hidden": true })}
        title={t("cowork.project_chats_empty_title")}
        description={t("cowork.project_chats_empty_text")}
      />
    );
  }
  return (
    <ul className="cowork-projects__list">
      {props.chats.map((chat) => (
        <li key={chat.id}>
          <Link className="cowork-project-row cowork-project-row--tight" to={projectChatPath(props.projectId, chat.id)}>
            <span className="cowork-project-row__icon">{icons.message(ROW_ICON)}</span>
            <span className="cowork-project-row__text">
              <b>{chat.title}</b>
            </span>
            <span className="cowork-project-row__when">{formatNavTime(chat.updatedAt, props.now, props.locale)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** One project: back to Projects, the folder ask, its chats and its files. */
export function ProjectView(props: ProjectViewProps) {
  const { project, chats } = props.detail;
  return (
    <div className="cowork-projects">
      <Link className="cowork-projects__back" to="/projects">
        {icons.arrowLeft(BUTTON_ICON)}
        {t("cowork.nav_projects")}
      </Link>
      <FolderAsk {...props.folderAsk} projectName={project.name} folderName={props.detail.folderName} />
      <section className="cowork-projects__section" aria-labelledby="cowork-project-chats">
        <div className="cowork-projects__head">
          <h2 id="cowork-project-chats">{t("cowork.project_chats_title")}</h2>
          <Link className="cowork-projects__new" to={projectChatPath(project.id)}>
            {icons.plus(BUTTON_ICON)}
            {t("cowork.project_new_chat")}
          </Link>
        </div>
        <ProjectChats projectId={project.id} chats={chats} now={props.now} locale={props.locale} />
      </section>
      {project.fileCount === null ? null : (
        <section className="cowork-projects__section cowork-projects__files">
          <p>{t("cowork.project_files", { count: project.fileCount })}</p>
          {props.onShowFiles ? (
            <Button size="sm" variant="ghost" iconLeft={icons.folderOpen(BUTTON_ICON)} onClick={props.onShowFiles}>
              {t("cowork.panel_show_files")}
            </Button>
          ) : null}
        </section>
      )}
    </div>
  );
}

/** The one folder a directory picker returned, whichever shape it came back in. */
export function singleFolder(selection: string | string[] | null): string | null {
  return typeof selection === "string" ? selection : (selection?.[0] ?? null);
}

/** `/project/:projectId`. */
export function ProjectScreen() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const client = useCoworkConnection((state) => state.client);
  const workspaceId = useCoworkConnection((state) => state.workspaceId);
  const openPanel = useFrameStore((state) => state.openPanel);
  const showToast = useFrameStore((state) => state.showToast);
  const answer = useFolderAskStore((state) => state.answers[projectId]);
  const { notNow, allowed, needFolder } = useFolderAskStore.getState();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  // The answer lasts for this visit. Leaving forgets it, so the next time the project opens and
  // still has no folder of the person's, Cowork asks again.
  useEffect(() => () => needFolder(projectId), [needFolder, projectId]);

  const detailKey = [PROJECTS_QUERY_KEY, client ? "live" : "preview", "project", projectId];
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => loadProjectDetail(client, projectId),
    staleTime: STALE_MS,
  });
  const data = detail.data?.data ?? null;
  const now = detail.data?.preview ? SAMPLE_NOW : Date.now();

  const onAllow = () => {
    if (!client || !data) return;
    setBusy(true);
    allowProjectFolder(
      {
        client,
        pick: async () =>
          singleFolder(await pickDirectory({ title: t("cowork.project_folder_pick_title", { name: data.project.name }) })),
      },
      projectId,
    )
      .then((folder) => {
        if (!folder) return;
        allowed(projectId, folder);
        void queryClient.invalidateQueries({ queryKey: detailKey });
      })
      .catch(() => showToast(t("cowork.project_folder_failed_title"), t("cowork.project_folder_failed_text"), "danger"))
      .finally(() => setBusy(false));
  };

  return (
    <CoworkShell
      current="projects"
      title={data?.project.name ?? t("cowork.screen_project")}
      meta={data ? (data.project.about ?? t("cowork.projects_chats", { count: data.chats.length })) : undefined}
    >
      {detail.isLoading ? (
        <Skeleton variant="text" lines={5} />
      ) : !data ? (
        <EmptyState
          title={t("cowork.project_not_found_title")}
          description={t("cowork.project_not_found_text")}
          action={
            <Link className="cowork-projects__back" to="/projects">
              {t("cowork.nav_projects")}
            </Link>
          }
        />
      ) : (
        <ProjectView
          detail={data}
          now={now}
          locale={locale}
          folderAsk={{
            view: folderAskView({ managed: data.project.managed, folders: data.folders, answer }),
            busy,
            onAllow,
            onNotNow: () => notNow(projectId),
          }}
          onShowFiles={workspaceId === projectId ? () => openPanel("files") : null}
        />
      )}
    </CoworkShell>
  );
}
