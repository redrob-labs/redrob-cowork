import type { RedrobServerClient } from "../../../app/lib/redrob-server";
import { t } from "../../../i18n";

/**
 * Chat and project actions behind the "..." menus (Recent, History, Projects). Every call is one
 * the server or engine already has; nothing here is new backend. Pure: the caller passes the
 * client, the renamer and the toast, so tests drive them with fakes.
 *
 * Each action has one failure path: no client (offline) throws inside the same `try` as the call,
 * so offline and a failed call both show the same "try again" toast and resolve false.
 */

export type Toast = (title: string, text?: string, tone?: "success" | "danger") => void;

/** Renames a chat in the engine (there is no server route for it; use-chat-titles renames the same way). */
export type ChatRenamer = (input: { chatId: string; title: string; directory: string | null }) => Promise<unknown>;

export type ChatActionsClient = Pick<RedrobServerClient, "deleteSession" | "listSessions" | "deleteWorkspace" | "updateWorkspaceDisplayName">;

/** Shows a failure as a danger toast with "try again", and resolves the action as not done. */
function failed(toast: Toast, title: string): false {
  // Every action's failure reads the same: what failed, then try again.
  toast(title, t("cowork.settings_try_again"), "danger");
  return false;
}

/** Narrows a nullable dependency, throwing (into the caller's `catch`) when it is missing. */
function required<T>(value: T | null): T {
  // Offline is a failure like any other, handled by the same catch.
  if (value === null) throw new Error("offline");
  return value;
}

/**
 * The name to save from an inline rename box: trimmed, inner runs of whitespace collapsed to one
 * space. Null when there is nothing to save: empty, or the same as before (so Enter on an
 * untouched box, or a blur, does not call the server).
 */
export function nameToSave(value: string, previous: string): string | null {
  // Pasted names often carry tabs or double spaces.
  const next = value.replace(/\s+/g, " ").trim();
  // Empty or unchanged means no call at all.
  return next && next !== previous.trim() ? next : null;
}

/** Renames a chat. Resolves true when the name changed; a failure says so and keeps the old name. */
export async function renameChat(
  deps: { rename: ChatRenamer | null; toast: Toast },
  input: { chatId: string; value: string; previous: string; directory: string | null },
): Promise<boolean> {
  // Nothing to save is not a failure, so no toast.
  const title = nameToSave(input.value, input.previous);
  if (!title) return false;
  try {
    // The engine renames in the chat's own folder.
    await required(deps.rename)({ chatId: input.chatId, title, directory: input.directory });
    return true;
  } catch {
    return failed(deps.toast, t("cowork.chat_rename_failed"));
  }
}

/** Deletes a chat and its messages. Resolves true when it is gone. */
export async function deleteChat(
  deps: { client: Pick<ChatActionsClient, "deleteSession"> | null; toast: Toast },
  input: { workspaceId: string; chatId: string },
): Promise<boolean> {
  try {
    // The server deletes it from the project it is in.
    await required(deps.client).deleteSession(input.workspaceId, input.chatId);
  } catch {
    return failed(deps.toast, t("cowork.chat_delete_failed"));
  }
  // Confirm, since the row vanishes.
  deps.toast(t("cowork.chat_deleted"));
  return true;
}

/** Renames a project (its display name; the folder keeps its name). */
export async function renameProject(
  deps: { client: Pick<ChatActionsClient, "updateWorkspaceDisplayName"> | null; toast: Toast },
  input: { projectId: string; value: string; previous: string },
): Promise<boolean> {
  // Nothing to save is not a failure, so no toast.
  const name = nameToSave(input.value, input.previous);
  if (!name) return false;
  try {
    // Only the display name changes; the folder on disk is untouched.
    await required(deps.client).updateWorkspaceDisplayName(input.projectId, name);
    return true;
  } catch {
    return failed(deps.toast, t("cowork.project_rename_failed"));
  }
}

/**
 * Delete a project, Felix's pick: its chats go too, then the project leaves Cowork's list. The
 * folder and every file in it stay on disk (the server's delete never touches them). The chats
 * are listed fresh (top-level ones; a chat's sub-tasks go with it), then deleted one at a time; if
 * listing or any delete fails the project is kept, so nothing is left half-gone and the person can
 * try again. `forget` also drops it from the desktop's own list, as the old sidebar's Remove did,
 * so a refresh cannot bring it back.
 */
export async function deleteProject(
  deps: {
    client: Pick<ChatActionsClient, "listSessions" | "deleteSession" | "deleteWorkspace"> | null;
    forget?: (projectId: string) => Promise<unknown>;
    toast: Toast;
  },
  input: { projectId: string },
): Promise<boolean> {
  try {
    // Offline fails before anything is deleted.
    const client = required(deps.client);
    // Listed now, not from the page's cache, so a chat made since is not left behind.
    const { items } = await client.listSessions(input.projectId, { roots: true });
    // In order, so the first failure stops the rest and keeps the project.
    for (const chat of items) await client.deleteSession(input.projectId, chat.id);
    // Only once every chat is gone does the project go.
    await client.deleteWorkspace(input.projectId);
  } catch {
    return failed(deps.toast, t("cowork.project_delete_failed"));
  }
  // Best effort: the project is already gone from the server either way.
  await deps.forget?.(input.projectId).catch(() => undefined);
  // Says the files are safe, since "delete" alone would suggest otherwise.
  deps.toast(t("cowork.project_deleted"), t("cowork.project_deleted_text"));
  return true;
}
