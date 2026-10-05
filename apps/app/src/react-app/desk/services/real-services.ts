import type { Session } from "@redrob-labs/sdk/v2/client";
import type { Memory } from "@redrob/types/memory";

import type { RedrobArtifactItem, RedrobServerClient, RedrobWorkspaceInfo } from "../../../app/lib/redrob-server";
import { connectorsFromMcp, type DeskMcpStatusMap } from "../connectors/connectors";
import { DESK_OUTBOX, deskFileIdFor, displayFileName, fileIconFor, fileKindFor } from "../panel/desk-files";
import { chatDefaults, type DeskServices } from "./desk-services";
import { createFixtureDeskServices } from "./fixture-services";
import { playbookFromCommand, playbookSlug, playbookTemplate } from "../playbooks/playbooks";
import { DESK_PRIVACY_CONFIG_KEY, readStoredPrivacy, usePrivacyMapStore, type StoredPrivacy } from "../privacy/privacy-store";
import type { Chat, DeskFile, DeskResult, MemoryNote, MemoryNoteScope, Project } from "./types";

/** The redrob-server calls Desk uses today. Tests pass a fake typed against this. */
export type DeskServerClient = Pick<
  RedrobServerClient,
  "listWorkspaces" | "listSessions" | "getSession" | "listMemories" | "saveMemory" | "updateMemory" | "deleteMemory" | "listArtifacts" | "listMcp" | "getConfig" | "patchConfig" | "listCommands" | "upsertCommand" | "deleteCommand"
>;

export type RealDeskServicesDeps = {
  client: DeskServerClient;
  /** The current project (a redrob-server workspace). */
  workspaceId: string;
  /** The engine's live connector status. Without it every connector reads from its config alone. */
  mcpStatus?: (() => Promise<DeskMcpStatusMap>) | null;
  /** Areas without a backend yet. Defaults to the fixture implementation. */
  fallback?: DeskServices;
};

// The memory bank has a single scope; a Desk scope rides along as a tag.
const SCOPE_TAG = "desk-scope:";

const real = <T>(data: T): DeskResult<T> => ({ data, preview: false });

function parseScope(value: string): MemoryNoteScope | null {
  if (value === "you" || value === "team") return value;
  const projectId = value.startsWith("project:") ? value.slice("project:".length) : "";
  return projectId ? `project:${projectId}` : null;
}

/** A memory bank entry as a Desk note: its scope rides along as a tag. */
export function toNote(memory: Memory): MemoryNote {
  const tag = memory.tags?.find((entry) => entry.startsWith(SCOPE_TAG));
  return {
    id: memory.id,
    scope: (tag && parseScope(tag.slice(SCOPE_TAG.length))) || "you",
    text: memory.content,
    when: Date.parse(memory.createdAt),
    how: memory.source === "agent" ? "learned" : "told",
  };
}

function scopeTags(scope: MemoryNoteScope, tags: string[] | null = null): string[] {
  return [...(tags ?? []).filter((entry) => !entry.startsWith(SCOPE_TAG)), `${SCOPE_TAG}${scope}`];
}

function toChat(session: Session, projectId: string): Chat {
  return { id: session.id, title: session.title, projectId, updatedAt: session.time.updated, ...chatDefaults(projectId) };
}

function workspaceName(workspace: RedrobWorkspaceInfo): string {
  return workspace.displayName?.trim() || workspace.name;
}

function toProject(workspace: RedrobWorkspaceInfo): Project {
  return {
    id: workspace.id,
    name: workspaceName(workspace),
    about: null,
    fileCount: null,
    chatCount: null,
    playbookIds: [],
    active: null,
    people: [],
  };
}

/** An artifact as a Desk file: its id is the one a chat answer naming it resolves to. */
function toFile(item: RedrobArtifactItem, projectName: string): DeskFile {
  const name = displayFileName(item.name ?? item.path ?? item.id);
  const path = item.path ? `${DESK_OUTBOX}/${item.path}` : undefined;
  return {
    id: path ? deskFileIdFor(path) : item.id,
    name,
    icon: fileIconFor(name),
    projectName,
    when: item.updatedAt ?? item.createdAt ?? 0,
    fromChat: null,
    kind: fileKindFor(name),
    ...(path ? { path } : {}),
  };
}

/**
 * Real data where redrob-server has it: projects (workspaces), chats
 * (sessions), memory notes, files (artifacts) and connectors (configured servers
 * with the engine's status). Everything else comes from
 * `fallback`, so those results keep `preview: true`.
 */
export function createRealDeskServices(deps: RealDeskServicesDeps): DeskServices {
  const { client, workspaceId } = deps;
  const fallback = deps.fallback ?? createFixtureDeskServices();

  const listPlaybooks = async () => {
    const [workspace, global] = await Promise.all([
      client.listCommands(workspaceId, "workspace"),
      // The person's own commands are optional: a failure leaves the workspace's.
      client.listCommands(workspaceId, "global").catch(() => ({ items: [] })),
    ]);
    const seen = new Set<string>();
    return [...workspace.items, ...global.items]
      .filter((command) => !seen.has(command.name) && Boolean(seen.add(command.name)))
      .map(playbookFromCommand);
  };

  const readPrivacy = async () => readStoredPrivacy((await client.getConfig(workspaceId)).redrob);
  // A level set by a team file stays as it was set.
  const writePrivacy = async (patch: Partial<Pick<StoredPrivacy, "level" | "names">>) => {
    const current = await readPrivacy();
    if (current.locked) throw new Error("Privacy is set by a team file");
    const next: StoredPrivacy = { ...current, ...patch };
    await client.patchConfig(workspaceId, { redrob: { [DESK_PRIVACY_CONFIG_KEY]: next } });
    return next;
  };
  const withKept = (stored: StoredPrivacy) => ({ ...stored, detailsKeptThisWeek: usePrivacyMapStore.getState().keptThisWeek() });

  return {
    ...fallback,
    chats: {
      list: async (query) => {
        const projectId = query?.projectId ?? workspaceId;
        const { items } = await client.listSessions(projectId, { roots: true });
        return real(items.map((session) => toChat(session, projectId)).sort((a, b) => b.updatedAt - a.updatedAt));
      },
      get: async (id) => real(toChat((await client.getSession(workspaceId, id)).item, workspaceId)),
    },
    projects: {
      list: async () => real((await client.listWorkspaces()).items.map(toProject)),
    },
    notes: {
      list: async () => real((await client.listMemories()).map(toNote)),
      add: async (note) =>
        real(toNote(await client.saveMemory({ content: note.text, tags: scopeTags(note.scope), source: "user" }))),
      remove: async (id) => {
        await client.deleteMemory(id);
        return real(null);
      },
      // In place: the note keeps its id, its tags and when it was made.
      edit: async (id, text) => real(toNote(await client.updateMemory(id, { content: text }))),
    },
    files: {
      list: async (query) => {
        const projectId = query?.projectId ?? workspaceId;
        const [artifacts, workspaces] = await Promise.all([client.listArtifacts(projectId), client.listWorkspaces()]);
        const workspace = workspaces.items.find((entry) => entry.id === projectId);
        const projectName = workspace ? workspaceName(workspace) : projectId;
        return real(artifacts.items.map((item) => toFile(item, projectName)));
      },
    },
    // Playbooks are the workspace's commands, then the person's own across workspaces.
    playbooks: {
      list: async () => real(await listPlaybooks()),
      get: async (id) => real((await listPlaybooks()).find((playbook) => playbook.id === id) ?? null),
      save: async (input) => {
        const name = input.id ?? playbookSlug(input.name);
        const template = playbookTemplate(input);
        await client.upsertCommand(workspaceId, { name, description: input.description.trim(), template });
        return real(playbookFromCommand({ name, description: input.description, template, scope: "workspace" }));
      },
      remove: async (id) => {
        await client.deleteCommand(workspaceId, id);
        return real(null);
      },
    },
    privacy: {
      get: async () => real(withKept(await readPrivacy())),
      setLevel: async (level) => real(withKept(await writePrivacy({ level }))),
      setNames: async (names) => real(withKept(await writePrivacy({ names }))),
    },
    connectors: {
      list: async () => {
        const [listed, statuses] = await Promise.all([
          client.listMcp(workspaceId),
          // A status that cannot be read leaves each connector to its config and sign-in.
          deps.mcpStatus ? deps.mcpStatus().catch(() => ({})) : Promise.resolve({}),
        ]);
        return real(connectorsFromMcp(listed.items, statuses));
      },
    },
  };
}

/** Real services when a server and a project are known; sample data otherwise. */
export function createDeskServices(input: {
  client: DeskServerClient | null;
  workspaceId: string | null;
  mcpStatus?: (() => Promise<DeskMcpStatusMap>) | null;
}): DeskServices {
  const fallback = createFixtureDeskServices();
  if (!input.client || !input.workspaceId) return fallback;
  return createRealDeskServices({
    client: input.client,
    workspaceId: input.workspaceId,
    mcpStatus: input.mcpStatus,
    fallback,
  });
}
