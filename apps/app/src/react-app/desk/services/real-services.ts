import type { Session } from "@redrob-labs/sdk/v2/client";
import type { Memory } from "@redrob/types/memory";

import type { RedrobArtifactItem, RedrobServerClient, RedrobWorkspaceInfo } from "../../../app/lib/redrob-server";
import { chatDefaults, type DeskServices } from "./desk-services";
import { createFixtureDeskServices } from "./fixture-services";
import type { Chat, DeskFile, DeskResult, MemoryNote, MemoryNoteScope, Project } from "./types";

/** The redrob-server calls Desk uses today. Tests pass a fake typed against this. */
export type DeskServerClient = Pick<
  RedrobServerClient,
  "listWorkspaces" | "listSessions" | "getSession" | "listMemories" | "saveMemory" | "deleteMemory" | "listArtifacts"
>;

export type RealDeskServicesDeps = {
  client: DeskServerClient;
  /** The current project (a redrob-server workspace). */
  workspaceId: string;
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

function toNote(memory: Memory): MemoryNote {
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

function toFile(item: RedrobArtifactItem, projectName: string): DeskFile {
  const name = item.name ?? item.path?.split(/[\\/]/).pop() ?? item.id;
  const sheet = /\.(xlsx|xls|csv)$/i.test(name);
  return {
    id: item.id,
    name,
    icon: sheet ? "fileSheet" : "fileText",
    projectName,
    when: item.updatedAt ?? item.createdAt ?? 0,
    fromChat: null,
    kind: sheet ? "sheet" : "file",
  };
}

/**
 * Real data where redrob-server has it: projects (workspaces), chats
 * (sessions), memory notes and files (artifacts). Everything else comes from
 * `fallback`, so those results keep `preview: true`.
 */
export function createRealDeskServices(deps: RealDeskServicesDeps): DeskServices {
  const { client, workspaceId } = deps;
  const fallback = deps.fallback ?? createFixtureDeskServices();

  const findMemory = async (id: string) => {
    const memory = (await client.listMemories()).find((entry) => entry.id === id);
    if (!memory) throw new Error(`No memory note ${id}`);
    return memory;
  };

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
      // No update endpoint: save the new text first, then drop the old note.
      edit: async (id, text) => {
        const previous = await findMemory(id);
        const saved = await client.saveMemory({
          content: text,
          tags: scopeTags(toNote(previous).scope, previous.tags),
          source: previous.source,
        });
        await client.deleteMemory(id);
        return real(toNote(saved));
      },
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
  };
}

/** Real services when a server and a project are known; sample data otherwise. */
export function createDeskServices(input: {
  client: DeskServerClient | null;
  workspaceId: string | null;
}): DeskServices {
  const fallback = createFixtureDeskServices();
  if (!input.client || !input.workspaceId) return fallback;
  return createRealDeskServices({ client: input.client, workspaceId: input.workspaceId, fallback });
}
