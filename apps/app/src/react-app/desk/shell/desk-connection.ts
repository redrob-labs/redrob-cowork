import { create } from "zustand";

import type { RedrobServerClient } from "../../../app/lib/redrob-server";
import type { DictationClient } from "../../domains/session/voice/voice-dictation";
import type { DeskServerClient } from "../services/real-services";

/** The calls the Files panel uses to preview a file. */
export type DeskFileClient = Pick<RedrobServerClient, "readWorkspaceFile" | "downloadWorkspaceFile">;

/** The calls the Projects screens add: make a project, move a chat into it, its folders. */
export type DeskProjectClient = Pick<
  RedrobServerClient,
  "createManagedProject" | "moveSession" | "listAuthorizedFolders" | "setAuthorizedFolders"
>;

export type DeskConnection = {
  client: (DeskServerClient & DeskFileClient & DictationClient & DeskProjectClient) | null;
  /** The server-side id of the workspace the chat route has open. */
  workspaceId: string | null;
  /** That workspace's folder on this computer; null for a remote workspace. Never shown. */
  workspaceRoot: string | null;
  /** Changes when that workspace's chats are added or renamed, so the menu refetches. */
  chatsVersion: string;
};

/**
 * The server and workspace the chat route is using, published by `SessionRoute` so the
 * Desk menu reads the same chats without a second connection. Empty until a chat route
 * has mounted; the menu shows sample data until then.
 */
export const useDeskConnection = create<DeskConnection>()(() => ({
  client: null,
  workspaceId: null,
  workspaceRoot: null,
  chatsVersion: "",
}));

export function publishDeskConnection(next: DeskConnection) {
  const current = useDeskConnection.getState();
  if (
    current.client === next.client &&
    current.workspaceId === next.workspaceId &&
    current.workspaceRoot === next.workspaceRoot &&
    current.chatsVersion === next.chatsVersion
  ) {
    return;
  }
  useDeskConnection.setState(next);
}
