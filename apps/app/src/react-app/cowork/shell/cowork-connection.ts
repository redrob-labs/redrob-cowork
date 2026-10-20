import { create } from "zustand";

import type { RedrobServerClient } from "../../../app/lib/redrob-server";
import type { Client } from "../../../app/types";
import type { DictationClient } from "../../domains/session/voice/voice-dictation";
import type { CoworkServerClient } from "../services/real-services";

/** The calls the Files panel uses to preview a file. */
export type CoworkFileClient = Pick<RedrobServerClient, "readWorkspaceFile" | "downloadWorkspaceFile">;

/**
 * The calls the Projects screens add: make a project (in Cowork's folder or one the person chose),
 * move a chat into it, its folders; and the chat and project "..." menus: delete a chat, rename and
 * delete a project.
 */
export type CoworkProjectClient = Pick<
  RedrobServerClient,
  | "createManagedProject"
  | "createLocalWorkspace"
  | "moveSession"
  | "listAuthorizedFolders"
  | "setAuthorizedFolders"
  | "deleteSession"
  | "deleteWorkspace"
  | "updateWorkspaceDisplayName"
>;

/** The calls the Connectors screen adds: turn one on or off, sign in through Redrob. */
export type CoworkConnectorClient = Pick<RedrobServerClient, "setMcpEnabled" | "connectManagedMcp">;

/** The calls the team file adds: export the workspace, and import one. */
export type CoworkTeamClient = Pick<
  RedrobServerClient,
  "exportWorkspace" | "previewWorkspaceImport" | "importWorkspace" | "getTeamPolicy" | "syncTeamPolicy" | "leaveTeamPolicy"
>;

export type CoworkConnection = {
  /** The workspace-bound Redrob client the Cowork services call; null until connected. */
  client: (CoworkServerClient & CoworkFileClient & DictationClient & CoworkProjectClient & CoworkConnectorClient & CoworkTeamClient) | null;
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
 * `CoworkConnectionPublisher` (the only writer) from the app-wide workspace
 * connection, so every Cowork screen, including a cold landing on /skills, reads
 * the live connection. Empty only until the first connection resolves.
 */
export const useCoworkConnection = create<CoworkConnection>()(() => ({
  client: null,
  opencode: null,
  workspaceId: null,
  workspaceRoot: null,
  chatsVersion: "",
}));

/** Replaces the whole Cowork connection snapshot; call only from CoworkConnectionPublisher. */
export function publishCoworkConnection(next: CoworkConnection) {
  const current = useCoworkConnection.getState();
  if (
    current.client === next.client &&
    current.opencode === next.opencode &&
    current.workspaceId === next.workspaceId &&
    current.workspaceRoot === next.workspaceRoot &&
    current.chatsVersion === next.chatsVersion
  ) {
    return;
  }
  useCoworkConnection.setState(next);
}

/**
 * The one field-scoped contribution the chat route makes to the Cowork
 * connection. Session lists are loaded only by the chat route, so it stays the
 * enricher for the chats revision; it never writes the whole snapshot.
 */
export type CoworkChatsRevision = {
  /** The local workspace record id the revision belongs to. */
  workspaceRecordId: string;
  /** Session ids and titles of that workspace, joined; changes on add or rename. */
  version: string;
  /** True while the chat route holds a load error for that workspace, which withholds the engine client. */
  workspaceError: boolean;
};

/** The latest chats revision from the chat route; read by CoworkConnectionPublisher. */
export const useCoworkChatsRevision = create<CoworkChatsRevision>()(() => ({
  workspaceRecordId: "",
  version: "",
  workspaceError: false,
}));

/** Records the chat route's chats revision; a no-op when nothing changed. */
export function publishCoworkChatsRevision(next: CoworkChatsRevision) {
  const current = useCoworkChatsRevision.getState();
  if (
    current.workspaceRecordId === next.workspaceRecordId &&
    current.version === next.version &&
    current.workspaceError === next.workspaceError
  ) {
    return;
  }
  useCoworkChatsRevision.setState(next);
}

/** The chats revision string for one workspace's sessions: `id:title` joined by `|`. */
export function coworkChatsVersion(sessions: ReadonlyArray<{ id: string; title?: string | null }>): string {
  return sessions.map((session) => `${session.id}:${session.title}`).join("|");
}

/** What deriveCoworkConnection reads: the active record, its endpoint, the engine client, the route's revision. */
export type CoworkConnectionSource = {
  /** The active workspace record, or null before any resolves. */
  workspace: { id: string; workspaceType?: string | null; path?: string | null } | null;
  /** That record's endpoint from the sanctioned resolver, or null while unreachable. */
  endpoint: { client: CoworkConnection["client"]; workspaceId: string } | null;
  /** The engine client built for that endpoint, or null. */
  opencode: Client | null;
  /** The chat route's latest chats revision. */
  revision: CoworkChatsRevision;
};

/** Whether the chats revision belongs to the active workspace record. */
export function revisionMatches(revision: CoworkChatsRevision, workspaceRecordId: string | null | undefined): boolean {
  return Boolean(workspaceRecordId) && revision.workspaceRecordId === workspaceRecordId;
}

/**
 * The full five-field Cowork connection for the active workspace. A revision
 * from another workspace is ignored so a switch never carries stale chats.
 */
export function deriveCoworkConnection(source: CoworkConnectionSource): CoworkConnection {
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
