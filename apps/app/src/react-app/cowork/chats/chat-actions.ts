import type { RedrobServerClient } from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";

/**
 * Chat and project actions behind the "..." menus (Recent, History, Projects). Every call is one
 * the server or engine already has; nothing here is new backend. Pure: the caller passes the
 * client, the renamer and the toast, so tests drive them with fakes.
 */

export type Toast = (title: string, text?: string, tone?: "success" | "danger") => void;

/** Renames a chat in the engine (there is no server route for it; use-chat-titles renames the same way). */
export type ChatRenamer = (input: { chatId: string; title: string; directory: string | null }) => Promise<unknown>;

export type ChatActionsClient = Pick<RedrobServerClient, "deleteSession" | "listSessions" | "deleteWorkspace" | "updateWorkspaceDisplayName">;

/**
 * The name to save from an inline rename box: trimmed, inner runs of whitespace collapsed to one
 * space. Null when there is nothing to save: empty, or the same as before (so Enter on an
 * untouched box, or a blur, does not call the server).
 */
export function nameToSave(value: string, previous: string): string | null {
  const next = value.replace(/\s+/g, " ").trim();
  return next && next !== previous.trim() ? next : null;
}

/** Renames a chat. Resolves true when the name changed; a failure says so and keeps the old name. */
export async function renameChat(
  deps: { rename: ChatRenamer | null; toast: Toast },
  input: { chatId: string; value: string; previous: string; directory: string | null },
): Promise<boolean> {
  const title = nameToSave(input.value, input.previous);
  if (!title) return false;
  if (!deps.rename) {
    deps.toast(t("cowork.chat_rename_failed"), t("cowork.settings_try_again"), "danger");
    return false;
  }
  try {
    await deps.rename({ chatId: input.chatId, title, directory: input.directory });
    return true;
  } catch {
    deps.toast(t("cowork.chat_rename_failed"), t("cowork.settings_try_again"), "danger");
    return false;
  }
}

/** Deletes a chat and its messages. Resolves true when it is gone. */
export async function deleteChat(
  deps: { client: Pick<ChatActionsClient, "deleteSession"> | null; toast: Toast },
  input: { workspaceId: string; chatId: string },
): Promise<boolean> {
  if (!deps.client) {
    deps.toast(t("cowork.chat_delete_failed"), t("cowork.settings_try_again"), "danger");
    return false;
  }
  try {
    await deps.client.deleteSession(input.workspaceId, input.chatId);
  } catch {
    deps.toast(t("cowork.chat_delete_failed"), t("cowork.settings_try_again"), "danger");
    return false;
  }
  deps.toast(t("cowork.chat_deleted"));
  return true;
}

/** Renames a project (its display name; the folder keeps its name). */
export async function renameProject(
  deps: { client: Pick<ChatActionsClient, "updateWorkspaceDisplayName"> | null; toast: Toast },
  input: { projectId: string; value: string; previous: string },
): Promise<boolean> {
  const name = nameToSave(input.value, input.previous);
  if (!name) return false;
  try {
    if (!deps.client) throw new Error("offline");
    await deps.client.updateWorkspaceDisplayName(input.projectId, name);
    return true;
  } catch {
    deps.toast(t("cowork.project_rename_failed"), t("cowork.settings_try_again"), "danger");
    return false;
  }
}

/** The project's chats (top-level ones; a chat's sub-tasks go with it), for the delete confirm's count. */
export async function projectChatIds(client: Pick<ChatActionsClient, "listSessions">, projectId: string): Promise<string[]> {
  const { items } = await client.listSessions(projectId, { roots: true });
  return items.map((session) => session.id);
}

/**
 * Delete a project, Felix's pick: its chats go too, then the project leaves Cowork's list. The
 * folder and every file in it stay on disk (the server's delete never touches them). Chats are
 * deleted first and one at a time; if one fails the project is kept, so nothing is left half-gone
 * and the person can try again. `forget` also drops it from the desktop's own list, as the old
 * sidebar's Remove did, so a refresh cannot bring it back.
 */
export async function deleteProject(
  deps: {
    client: Pick<ChatActionsClient, "deleteSession" | "deleteWorkspace"> | null;
    forget?: (projectId: string) => Promise<unknown>;
    toast: Toast;
  },
  input: { projectId: string; chatIds: readonly string[] },
): Promise<boolean> {
  const fail = () => {
    deps.toast(t("cowork.project_delete_failed"), t("cowork.settings_try_again"), "danger");
    return false;
  };
  if (!deps.client) return fail();
  try {
    for (const chatId of input.chatIds) await deps.client.deleteSession(input.projectId, chatId);
    await deps.client.deleteWorkspace(input.projectId);
  } catch {
    return fail();
  }
  await deps.forget?.(input.projectId).catch(() => undefined);
  deps.toast(t("cowork.project_deleted"), t("cowork.project_deleted_text"));
  return true;
}
