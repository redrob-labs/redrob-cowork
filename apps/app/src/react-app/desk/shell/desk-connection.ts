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

export type DeskConnection = {
  /** The workspace-bound Redrob client the Desk services call; null until connected. */
  client: (DeskServerClient & DeskFileClient & DictationClient & DeskProjectClient & DeskConnectorClient & DeskTeamClient) | null;
  /** The engine client for that workspace: connector status and the sign-in flow. */
  opencode: Client | null;
  /** The server-side id of the active workspace. */
  workspaceId: string | null;
  /** That workspace's folder on this computer; null for a remote workspace. Never shown. */
  workspaceRoot: string | null;
  /** Changes when that workspace's chats are added or renamed, so the menu refetches. */
  chatsVersion: string;
};

/**
 * The server and workspace the app is using, published by the always-mounted
 * `DeskConnectionPublisher` (the only writer) from the app-wide workspace
 * connection, so every Desk screen, including a cold landing on /skills, reads
 * the live connection. Empty only until the first connection resolves.
 */
export const useDeskConnection = create<DeskConnection>()(() => ({
  client: null,
  opencode: null,
  workspaceId: null,
  workspaceRoot: null,
  chatsVersion: "",
}));

/** Replaces the whole Desk connection snapshot; call only from DeskConnectionPublisher. */
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

/**
 * The one field-scoped contribution the chat route makes to the Desk
 * connection. Session lists are loaded only by the chat route, so it stays the
 * enricher for the chats revision; it never writes the whole snapshot.
 */
export type DeskChatsRevision = {
  /** The local workspace record id the revision belongs to. */
  workspaceRecordId: string;
  /** Session ids and titles of that workspace, joined; changes on add or rename. */
  version: string;
  /** True while the chat route holds a load error for that workspace, which withholds the engine client. */
  workspaceError: boolean;
};

/** The latest chats revision from the chat route; read by DeskConnectionPublisher. */
export const useDeskChatsRevision = create<DeskChatsRevision>()(() => ({
  workspaceRecordId: "",
  version: "",
  workspaceError: false,
}));

/** Records the chat route's chats revision; a no-op when nothing changed. */
export function publishDeskChatsRevision(next: DeskChatsRevision) {
  const current = useDeskChatsRevision.getState();
  if (
    current.workspaceRecordId === next.workspaceRecordId &&
    current.version === next.version &&
    current.workspaceError === next.workspaceError
  ) {
    return;
  }
  useDeskChatsRevision.setState(next);
}

/** The chats revision string for one workspace's sessions: `id:title` joined by `|`. */
export function deskChatsVersion(sessions: ReadonlyArray<{ id: string; title?: string | null }>): string {
  return sessions.map((session) => `${session.id}:${session.title}`).join("|");
}

/** What deriveDeskConnection reads: the active record, its endpoint, the engine client, the route's revision. */
export type DeskConnectionSource = {
  /** The active workspace record, or null before any resolves. */
  workspace: { id: string; workspaceType?: string | null; path?: string | null } | null;
  /** That record's endpoint from the sanctioned resolver, or null while unreachable. */
  endpoint: { client: DeskConnection["client"]; workspaceId: string } | null;
  /** The engine client built for that endpoint, or null. */
  opencode: Client | null;
  /** The chat route's latest chats revision. */
  revision: DeskChatsRevision;
};

/** Whether the chats revision belongs to the active workspace record. */
export function revisionMatches(revision: DeskChatsRevision, workspaceRecordId: string | null | undefined): boolean {
  return Boolean(workspaceRecordId) && revision.workspaceRecordId === workspaceRecordId;
}

/**
 * The full five-field Desk connection for the active workspace. A revision
 * from another workspace is ignored so a switch never carries stale chats.
 */
export function deriveDeskConnection(source: DeskConnectionSource): DeskConnection {
  const { workspace, endpoint } = source;
  const matches = revisionMatches(source.revision, workspace?.id);
  return {
    client: endpoint?.client ?? null,
    opencode: source.opencode,
    workspaceId: endpoint?.workspaceId || null,
    workspaceRoot: workspace?.workspaceType === "remote" ? null : workspace?.path?.trim() || null,
    chatsVersion: matches ? source.revision.version : "",
  };
}
