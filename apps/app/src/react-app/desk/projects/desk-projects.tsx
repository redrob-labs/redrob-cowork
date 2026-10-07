/** @jsxImportSource react */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { Alert, ApprovalStep, Button, EmptyState, Skeleton, icons } from "@redrob-labs/ui";

import { pickDirectory } from "../../../app/lib/desktop";
import { currentLocale, subscribeToLocale, t } from "../../../i18n";
import { SAMPLE_NOW } from "../services/fixtures/sample-day";
import { useDeskConnection } from "../shell/desk-connection";
import { DeskShell } from "../shell/desk-shell";
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
export const PROJECTS_QUERY_KEY = "desk-projects";

function useLocale(): string {
  return useSyncExternalStore(subscribeToLocale, currentLocale, currentLocale);
}

function ProjectFigures(props: { project: Pick<ProjectRow, "chatCount" | "fileCount"> }) {
  return (
    <>
      {props.project.chatCount === null ? null : (
        <span className="desk-project-row__fig">{t("desk.projects_chats", { count: props.project.chatCount })}</span>
      )}
      {props.project.fileCount === null ? null : (
        <span className="desk-project-row__fig">{t("desk.projects_files", { count: props.project.fileCount })}</span>
      )}
    </>
  );
}

export type ProjectsViewProps = {
  projects: readonly ProjectRow[];
  now: number;
  locale: string;
};

/** Every project: name, one line about it, its counts and when it was last active. */
export function ProjectsView(props: ProjectsViewProps) {
  if (props.projects.length === 0) {
    return (
      <EmptyState
        icon={icons.folder({ width: 20, height: 20, "aria-hidden": true })}
        title={t("desk.projects_empty_title")}
        description={t("desk.projects_empty_text")}
      />
    );
  }
  return (
    <div className="desk-projects">
      <p className="desk-projects__lede">{t("desk.projects_lede")}</p>
      <ul className="desk-projects__list">
        {props.projects.map((project) => (
          <li key={project.id}>
            <Link className="desk-project-row" to={projectPath(project.id)}>
              <span className="desk-project-row__icon">{icons.folder(ROW_ICON)}</span>
              <span className="desk-project-row__text">
                <b>{project.name}</b>
                <span>{project.about ?? t("desk.projects_about_none")}</span>
              </span>
              <ProjectFigures project={project} />
              <span className="desk-project-row__when">
                {project.lastActiveAt === null ? null : formatNavTime(project.lastActiveAt, props.now, props.locale)}
              </span>
            </Link>
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
      {t("desk.projects_new")}
    </Button>
  );
}

/** `/projects`. Sample projects until a chat route has connected to the server. */
export function ProjectsScreen() {
  const client = useDeskConnection((state) => state.client);
  const locale = useLocale();
  const projects = useQuery({
    queryKey: [PROJECTS_QUERY_KEY, client ? "live" : "preview", "list"],
    queryFn: () => loadProjectRows(client),
    staleTime: STALE_MS,
  });
  const rows = projects.data?.data ?? [];
  const now = projects.data?.preview ? SAMPLE_NOW : Date.now();

  return (
    <DeskShell
      current="projects"
      title={t("desk.nav_projects")}
      meta={projects.data ? t("desk.projects_meta", { count: rows.length }) : undefined}
      actions={<NewProjectButton />}
    >
      {projects.isLoading ? (
        <Skeleton variant="text" lines={5} />
      ) : projects.isError ? (
        <EmptyState title={t("desk.projects_error_title")} description={t("desk.projects_error_text")} />
      ) : (
        <ProjectsView projects={rows} now={now} locale={locale} />
      )}
    </DeskShell>
  );
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
      <Alert tone="success" title={t("desk.project_folder_allowed_title", { folder: props.view.folder })}>
        {t("desk.project_folder_allowed_text")}
      </Alert>
    );
  }
  if (props.view.kind === "none") return null;
  const idle = () => {};
  return (
    <ApprovalStep
      title={t("desk.project_folder_title", { name: props.projectName })}
      description={t("desk.project_folder_text", { name: props.folderName })}
      approveLabel={t("desk.project_folder_allow")}
      rejectLabel={t("desk.project_folder_not_now")}
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
        title={t("desk.project_chats_empty_title")}
        description={t("desk.project_chats_empty_text")}
      />
    );
  }
  return (
    <ul className="desk-projects__list">
      {props.chats.map((chat) => (
        <li key={chat.id}>
          <Link className="desk-project-row desk-project-row--tight" to={projectChatPath(props.projectId, chat.id)}>
            <span className="desk-project-row__icon">{icons.message(ROW_ICON)}</span>
            <span className="desk-project-row__text">
              <b>{chat.title}</b>
            </span>
            <span className="desk-project-row__when">{formatNavTime(chat.updatedAt, props.now, props.locale)}</span>
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
    <div className="desk-projects">
      <Link className="desk-projects__back" to="/projects">
        {icons.arrowLeft(BUTTON_ICON)}
        {t("desk.nav_projects")}
      </Link>
      <FolderAsk {...props.folderAsk} projectName={project.name} folderName={props.detail.folderName} />
      <section className="desk-projects__section" aria-labelledby="desk-project-chats">
        <div className="desk-projects__head">
          <h2 id="desk-project-chats">{t("desk.project_chats_title")}</h2>
          <Link className="desk-projects__new" to={projectChatPath(project.id)}>
            {icons.plus(BUTTON_ICON)}
            {t("desk.project_new_chat")}
          </Link>
        </div>
        <ProjectChats projectId={project.id} chats={chats} now={props.now} locale={props.locale} />
      </section>
      {project.fileCount === null ? null : (
        <section className="desk-projects__section desk-projects__files">
          <p>{t("desk.project_files", { count: project.fileCount })}</p>
          {props.onShowFiles ? (
            <Button size="sm" variant="ghost" iconLeft={icons.folderOpen(BUTTON_ICON)} onClick={props.onShowFiles}>
              {t("desk.panel_show_files")}
            </Button>
          ) : null}
        </section>
      )}
    </div>
  );
}

function singleFolder(selection: string | string[] | null): string | null {
  return typeof selection === "string" ? selection : (selection?.[0] ?? null);
}

/** `/project/:projectId`. */
export function ProjectScreen() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const client = useDeskConnection((state) => state.client);
  const workspaceId = useDeskConnection((state) => state.workspaceId);
  const openPanel = useFrameStore((state) => state.openPanel);
  const showToast = useFrameStore((state) => state.showToast);
  const answer = useFolderAskStore((state) => state.answers[projectId]);
  const { notNow, allowed, needFolder } = useFolderAskStore.getState();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  // The answer lasts for this visit. Leaving forgets it, so the next time the project opens and
  // still has no folder of the person's, Desk asks again.
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
          singleFolder(await pickDirectory({ title: t("desk.project_folder_pick_title", { name: data.project.name }) })),
      },
      projectId,
    )
      .then((folder) => {
        if (!folder) return;
        allowed(projectId, folder);
        void queryClient.invalidateQueries({ queryKey: detailKey });
      })
      .catch(() => showToast(t("desk.project_folder_failed_title"), t("desk.project_folder_failed_text"), "danger"))
      .finally(() => setBusy(false));
  };

  return (
    <DeskShell
      current="projects"
      title={data?.project.name ?? t("desk.screen_project")}
      meta={data ? (data.project.about ?? t("desk.projects_chats", { count: data.chats.length })) : undefined}
    >
      {detail.isLoading ? (
        <Skeleton variant="text" lines={5} />
      ) : !data ? (
        <EmptyState
          title={t("desk.project_not_found_title")}
          description={t("desk.project_not_found_text")}
          action={
            <Link className="desk-projects__back" to="/projects">
              {t("desk.nav_projects")}
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
    </DeskShell>
  );
}
