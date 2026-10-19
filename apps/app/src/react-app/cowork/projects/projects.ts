import type { RedrobServerClient, RedrobWorkspaceInfo } from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";
import { shownChatTitle } from "../../../app/lib/session-title";
import { workspaceSessionRoute } from "../../shell/workspace-routes";
import { CHATS } from "../services/fixtures/chats";
import { PROJECTS } from "../services/fixtures/projects";
import type { ChatMemory } from "../services/types";

/** The redrob-server calls the Projects screens use. Tests pass a fake typed against this. */
export type ProjectsClient = Pick<
  RedrobServerClient,
  | "listWorkspaces"
  | "listSessions"
  | "listArtifacts"
  | "listAuthorizedFolders"
  | "setAuthorizedFolders"
  | "createManagedProject"
  | "createLocalWorkspace"
  | "moveSession"
>;

/** One project as the Projects screens show it. Counts are null when the server did not say. */
export type ProjectRow = {
  id: string;
  name: string;
  about: string | null;
  chatCount: number | null;
  fileCount: number | null;
  lastActiveAt: number | null;
  /** The server made its folder: Cowork asks for a folder of the person's. */
  managed: boolean;
  /** Where the project's folder is on this computer (Open project folder); null for sample data. */
  path: string | null;
};

export type ProjectChat = { id: string; title: string; updatedAt: number };

export type ProjectDetail = {
  project: ProjectRow;
  chats: ProjectChat[];
  /** The folders the person let it use; null when there is nothing to ask about. */
  folders: string[] | null;
  /** The name of the folder Cowork keeps the project's files in. Never a path. */
  folderName: string;
};

export type ProjectsResult<T> = { data: T; preview: boolean };

/** The hidden Personal workspace holds chats outside any project; it is not one. */
export function isListedProject(workspace: Pick<RedrobWorkspaceInfo, "kind">): boolean {
  return workspace.kind !== "personal";
}

function workspaceName(workspace: RedrobWorkspaceInfo): string {
  return workspace.displayName?.trim() || workspace.name;
}

/** The last part of a path, on either kind of separator. */
export function folderBaseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Most recently active first; projects with no activity keep their order at the end. */
export function sortByLastActive<T extends Pick<ProjectRow, "lastActiveAt">>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (b.row.lastActiveAt ?? -Infinity) - (a.row.lastActiveAt ?? -Infinity) || a.index - b.index)
    .map(({ row }) => row);
}

function latest(times: readonly number[]): number | null {
  return times.length ? Math.max(...times) : null;
}

function fixtureRow(id: string): ProjectRow | null {
  const project = PROJECTS.find((entry) => entry.id === id);
  if (!project) return null;
  const chats = CHATS.filter((chat) => chat.projectId === id);
  return {
    id: project.id,
    name: project.name,
    about: project.about,
    chatCount: chats.length,
    fileCount: project.fileCount,
    lastActiveAt: latest(chats.map((chat) => chat.updatedAt)),
    managed: false,
    path: null,
  };
}

function toRow(workspace: RedrobWorkspaceInfo, chats: readonly ProjectChat[] | null): ProjectRow {
  return {
    id: workspace.id,
    name: workspaceName(workspace),
    about: null,
    chatCount: chats ? chats.length : null,
    fileCount: null,
    lastActiveAt: chats ? latest(chats.map((chat) => chat.updatedAt)) : null,
    managed: workspace.kind === "managed",
    path: workspace.path?.trim() || null,
  };
}

async function projectChats(client: Pick<ProjectsClient, "listSessions">, id: string): Promise<ProjectChat[] | null> {
  try {
    const { items } = await client.listSessions(id, { roots: true });
    return items
      .map((session) => ({ id: session.id, title: shownChatTitle(session.title), updatedAt: session.time.updated }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return null;
  }
}

/** Every project but Personal, most recently active first. Sample projects without a server. */
export async function loadProjectRows(
  client: Pick<ProjectsClient, "listWorkspaces" | "listSessions"> | null,
): Promise<ProjectsResult<ProjectRow[]>> {
  if (!client) {
    const rows = PROJECTS.map((project) => fixtureRow(project.id)).filter((row) => row !== null);
    return { data: sortByLastActive(rows), preview: true };
  }
  const { items } = await client.listWorkspaces();
  const rows = await Promise.all(
    items.filter(isListedProject).map(async (workspace) => toRow(workspace, await projectChats(client, workspace.id))),
  );
  return { data: sortByLastActive(rows), preview: false };
}

/**
 * One project: its chats (read without opening the project, since the engine serves every
 * folder), its file count, and, for a project whose folder Cowork made, the folders the person
 * let it use. Null when there is no such project.
 */
export async function loadProjectDetail(
  client: Pick<ProjectsClient, "listWorkspaces" | "listSessions" | "listArtifacts" | "listAuthorizedFolders"> | null,
  id: string,
): Promise<ProjectsResult<ProjectDetail | null>> {
  if (!client) {
    const project = fixtureRow(id);
    const chats = CHATS.filter((chat) => chat.projectId === id).map(({ id: chatId, title, updatedAt }) => ({
      id: chatId,
      title,
      updatedAt,
    }));
    return {
      data: project ? { project, chats: chats.sort((a, b) => b.updatedAt - a.updatedAt), folders: null, folderName: project.name } : null,
      preview: true,
    };
  }
  const workspace = (await client.listWorkspaces()).items.find((entry) => entry.id === id);
  if (!workspace) return { data: null, preview: false };
  const managed = workspace.kind === "managed";
  const [chats, fileCount, folders] = await Promise.all([
    projectChats(client, id),
    client.listArtifacts(id).then(
      ({ items }) => items.length,
      () => null,
    ),
    managed
      ? client.listAuthorizedFolders(id).then(
          ({ folders: list }) => list,
          () => null,
        )
      : null,
  ]);
  return {
    data: {
      project: { ...toRow(workspace, chats), fileCount },
      chats: chats ?? [],
      folders,
      folderName: workspace.path ? folderBaseName(workspace.path) : workspaceName(workspace),
    },
    preview: false,
  };
}

/** Where a project's chat opens: the workspace route, which opens the project first. */
export function projectChatPath(projectId: string, chatId?: string | null): string {
  return workspaceSessionRoute(projectId, chatId);
}

export function projectPath(projectId: string): string {
  return `/project/${encodeURIComponent(projectId)}`;
}

/** A chat's title as a project name: a title cut short ends in "...", which a name does not. */
export function nameFromChatTitle(title: string): string {
  return title.replace(/(\.\.\.|\u2026)\s*$/, "").trim();
}

/** The error under the name field, or null when the name will do. */
export function projectNameError(name: string): string | null {
  return name.trim() ? null : t("cowork.project_dialog_name_error");
}

/** Save as a project is offered for a chat in no project: one in the Personal workspace. */
export function offersSaveAsProject(input: { chatId: string | null; workspace: Pick<RedrobWorkspaceInfo, "kind"> | null }): boolean {
  return Boolean(input.chatId && input.workspace?.kind === "personal");
}

export type CreateProjectDeps = {
  client: Pick<ProjectsClient, "createManagedProject" | "createLocalWorkspace" | "moveSession"> | null;
  navigate: (path: string) => void;
  toast: (title: string, text?: string, tone?: "success" | "danger") => void;
  close: () => void;
  setMemory: (chatId: string, memory: ChatMemory) => void;
};

/** The chat to move, and the project (workspace) it is in now. */
export type ProjectSource = { chatId: string; workspaceId: string };

export type CreateProjectResult =
  | { status: "invalid"; error: string }
  | { status: "failed" }
  | { status: "created"; projectId: string }
  | { status: "not-moved"; projectId: string };

/**
 * New project, or Save as a project with `from`. Makes a project with a folder Cowork keeps,
 * moves the chat into it with its memory on the project, says so and opens it. An empty name
 * keeps the dialog open. If the chat cannot move, the project stays and the chat stays put.
 */
/**
 * The id of the project `createLocalWorkspace` just made on `folder`. The route answers with the
 * new workspace (`workspace`), though the client types it as the plain list; fall back to the list
 * entry on that folder, then to the active id (a project on a chosen folder becomes active).
 */
export function createdProjectId(
  result: { workspace?: { id?: string } | null; activeId?: string | null; workspaces?: readonly { id: string; path?: string | null }[] },
  folder: string,
): string | null {
  const sameFolder = (path: string | null | undefined) =>
    (path ?? "").replace(/[\\/]+$/, "").toLowerCase() === folder.replace(/[\\/]+$/, "").toLowerCase();
  return result.workspace?.id || result.workspaces?.find((entry) => sameFolder(entry.path))?.id || result.activeId || null;
}

export async function createProject(
  deps: CreateProjectDeps,
  input: { name: string; from: ProjectSource | null; /** A folder the person chose; null keeps Cowork's own. */ folder?: string | null },
): Promise<CreateProjectResult> {
  const error = projectNameError(input.name);
  if (error) return { status: "invalid", error };
  const name = input.name.trim();
  if (!deps.client) {
    deps.toast(t("cowork.project_offline_title"), t("cowork.project_offline_text"), "danger");
    return { status: "failed" };
  }

  let projectId: string;
  try {
    if (input.folder) {
      const made = createdProjectId(
        await deps.client.createLocalWorkspace({ folderPath: input.folder, name, preset: "starter" }),
        input.folder,
      );
      if (!made) throw new Error("no project id");
      projectId = made;
    } else {
      projectId = (await deps.client.createManagedProject(name)).workspace.id;
    }
  } catch {
    deps.toast(t("cowork.project_create_failed_title"), t("cowork.project_create_failed_text"), "danger");
    return { status: "failed" };
  }

  if (input.from) {
    try {
      await deps.client.moveSession(input.from.workspaceId, input.from.chatId, projectId);
    } catch {
      deps.close();
      deps.toast(t("cowork.project_move_failed_title"), t("cowork.project_move_failed_text", { name }), "danger");
      return { status: "not-moved", projectId };
    }
    deps.setMemory(input.from.chatId, "project");
  }

  deps.close();
  deps.toast(
    t("cowork.project_created"),
    input.from ? t("cowork.project_created_moved", { name }) : t("cowork.project_created_ready", { name }),
  );
  deps.navigate(projectPath(projectId));
  return { status: "created", projectId };
}

/** A project the composer's Add to project offers, and whether the chat is already in it. */
export type ProjectChoice = { id: string; name: string; current: boolean };

/**
 * The composer's Add to project list: every project, most recently active first, with the one the
 * open chat (or the new chat) already belongs to marked so it reads as chosen and cannot be picked
 * again. `currentId` is that project's id, or null when there is none.
 */
export function projectChoices(rows: readonly Pick<ProjectRow, "id" | "name">[], currentId: string | null): ProjectChoice[] {
  return rows.map((row) => ({ id: row.id, name: row.name, current: row.id === currentId }));
}

export type MoveChatDeps = {
  client: Pick<ProjectsClient, "moveSession"> | null;
  navigate: (path: string) => void;
  toast: (title: string, text?: string, tone?: "success" | "danger") => void;
  setMemory: (chatId: string, memory: ChatMemory) => void;
};

/**
 * Add to project, for an open chat: moves it into an existing project (the same server call Save as
 * a project uses), puts its memory on the project, says so and opens it there. On failure the chat
 * stays where it was and the toast says so. Resolves true when the chat moved.
 */
export async function moveChatToProject(
  deps: MoveChatDeps,
  input: { chatId: string; workspaceId: string; project: Pick<ProjectRow, "id" | "name"> },
): Promise<boolean> {
  if (!deps.client) {
    deps.toast(t("cowork.project_offline_title"), t("cowork.project_offline_text"), "danger");
    return false;
  }
  try {
    await deps.client.moveSession(input.workspaceId, input.chatId, input.project.id);
  } catch {
    deps.toast(t("cowork.project_move_failed_title"), t("cowork.settings_try_again"), "danger");
    return false;
  }
  deps.setMemory(input.chatId, "project");
  deps.toast(t("cowork.project_moved_title"), t("cowork.project_moved_text", { name: input.project.name }));
  deps.navigate(projectChatPath(input.project.id, input.chatId));
  return true;
}
