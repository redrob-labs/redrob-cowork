import { create } from "zustand";

import type { RedrobServerClient } from "../../../app/lib/redrob-server";
import type { Client } from "../../../app/types";
import type { DictationClient } from "../../domains/session/voice/voice-dictation";
import type { DeskServerClient } from "../services/real-services";

/** The calls the Files panel uses to preview a file. */
export type DeskFileClient = Pick<RedrobServerClient, "readWorkspaceFile" | "downloadWorkspaceFile">;

/** The calls the Projects screens add: make a project, move a chat into it, its folders. */
export type DeskProjectClient = Pick<
  RedrobServerClient,
  "createManagedProject" | "moveSession" | "listAuthorizedFolders" | "setAuthorizedFolders"
>;

/** The calls the Connectors screen adds: turn one on or off, sign in through Redrob. */
export type DeskConnectorClient = Pick<RedrobServerClient, "setMcpEnabled" | "connectManagedMcp">;

/** The calls the team file adds: export the workspace, and import one. */
export type DeskTeamClient = Pick<
  RedrobServerClient,
  "exportWorkspace" | "previewWorkspaceImport" | "importWorkspace" | "getTeamPolicy" | "syncTeamPolicy" | "leaveTeamPolicy"
>;

/** The calls the profile adds: the name teammates see on handoffs and in shared chats. */
export type DeskProfileClient = Pick<RedrobServerClient, "getProfile" | "updateProfile">;

/** The calls handoff adds: what a handoff would carry, and the file itself. */
export type DeskHandoffClient = Pick<RedrobServerClient, "previewHandoff" | "createHandoff">;

/** The calls review adds: comments on a chat and the verdict on it. */
export type DeskReviewClient = Pick<
  RedrobServerClient,
  "getSessionReview" | "addReviewComment" | "resolveReviewComment" | "deleteReviewComment" | "setReviewState"
>;

export type DeskConnection = {
  client:
    | (DeskServerClient &
        DeskFileClient &
        DictationClient &
        DeskProjectClient &
        DeskConnectorClient &
        DeskTeamClient &
        DeskProfileClient &
        DeskReviewClient &
        DeskHandoffClient)
    | null;
  /** The engine client for that workspace: connector status and the sign-in flow. */
  opencode: Client | null;
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
  opencode: null,
  workspaceId: null,
  workspaceRoot: null,
  chatsVersion: "",
}));

export function publishDeskConnection(next: DeskConnection) {
  const current = useDeskConnection.getState();
  if (
    current.client === next.client &&
    current.opencode === next.opencode &&
    current.workspaceId === next.workspaceId &&
    current.workspaceRoot === next.workspaceRoot &&
    current.chatsVersion === next.chatsVersion
  ) {
    return;
  }
  useDeskConnection.setState(next);
}
