/**
 * The real implementation of `CoworkServices`: redrob-server calls for the areas it
 * backs today (chats, projects, memory notes, files, schedules, skills, history,
 * privacy, connectors), with every other area left to the fixture `fallback` so its
 * results keep `preview: true`. `createCoworkServices` picks real or fixtures by
 * whether a client and workspace are known.
 */
import type { Session } from "@redrob-labs/sdk/v2/client";
import type { Memory } from "@redrob/types/memory";

import type { RedrobArtifactItem, RedrobServerClient, RedrobWorkspaceInfo } from "../../../app/lib/redrob-server";
import { shownChatTitle } from "../../../app/lib/session-title";
import { connectorsFromMcp, type CoworkMcpStatusMap } from "../connectors/connectors";
import { COWORK_OUTBOX, coworkFileIdFor, displayFileName, fileIconFor, fileKindFor } from "../panel/cowork-files";
import { chatDefaults, type CoworkServices } from "./cowork-services";
import { createFixtureCoworkServices } from "./fixture-services";
import { catalogueDisplay, consoleCatalogue } from "../skills/console-catalogue";
import { canEditSkill, canRemoveSkill, coworkSkillFrom, skillBody, skillContent, tagsOf } from "../skills/skills";
import { HISTORY_LIMIT, HISTORY_STEPS_LIMIT, historyEntryFrom } from "../history/history";
import { boardFromState } from "../scheduled/schedules";
import { useCoworkComposerStore } from "../composer/composer-state";
import { COWORK_PRIVACY_CONFIG_KEY, readStoredPrivacy, type StoredPrivacy } from "../privacy/privacy-store";
import type { Chat, CoworkFile, CoworkResult, MemoryNote, MemoryNoteScope, Project } from "./types";

/** The redrob-server calls Cowork uses today. Tests pass a fake typed against this. */
export type CoworkServerClient = Pick<
  RedrobServerClient,
  "listWorkspaces" | "listSessions" | "getSession" | "listMemories" | "saveMemory" | "updateMemory" | "deleteMemory" | "listArtifacts" | "listMcp" | "getConfig" | "patchConfig" | "getSessionSnapshot" | "listSchedules" | "addSchedule" | "updateSchedule" | "deleteSchedule" | "answerScheduleWaiting"
  | "listSkills" | "getSkill" | "upsertSkill" | "deleteSkill" | "installLibrarySkill" | "getTeamSkills"
>;

export type RealCoworkServicesDeps = {
  client: CoworkServerClient;
  /** The current project (a redrob-server workspace). */
  workspaceId: string;
  /** The engine's live connector status. Without it every connector reads from its config alone. */
  mcpStatus?: (() => Promise<CoworkMcpStatusMap>) | null;
  /** Areas without a backend yet. Defaults to the fixture implementation. */
  fallback?: CoworkServices;
};

// The memory bank has a single scope; a Cowork scope rides along as a tag.
const SCOPE_TAG = "cowork-scope:";

const real = <T>(data: T): CoworkResult<T> => ({ data, preview: false });

function parseScope(value: string): MemoryNoteScope | null {
  if (value === "you" || value === "team") return value;
  const projectId = value.startsWith("project:") ? value.slice("project:".length) : "";
  return projectId ? `project:${projectId}` : null;
}

/** A memory bank entry as a Cowork note: its scope rides along as a tag. */
export function toNote(memory: Memory): MemoryNote {
  const tag = memory.tags?.find((entry) => entry.startsWith(SCOPE_TAG));
  return {
    id: memory.id,
    scope: (tag && parseScope(tag.slice(SCOPE_TAG.length))) || "you",
    text: memory.content,
    when: Date.parse(memory.createdAt),
    how: memory.source === "agent" ? "learned" : "told",
    // A note from a team file changes in the team file only.
    ...(memory.tags?.includes("cowork-locked") ? { locked: true } : {}),
  };
}

function scopeTags(scope: MemoryNoteScope, tags: string[] | null = null): string[] {
  return [...(tags ?? []).filter((entry) => !entry.startsWith(SCOPE_TAG)), `${SCOPE_TAG}${scope}`];
}

function toChat(session: Session, projectId: string): Chat {
  // A "```redrob-questions" title reads as untitled until the repair renames the chat.
  return { id: session.id, title: shownChatTitle(session.title), projectId, updatedAt: session.time.updated, ...chatDefaults(projectId) };
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
    active: null,
    people: [],
  };
}

/** An artifact as a Cowork file: its id is the one a chat answer naming it resolves to. */
function toFile(item: RedrobArtifactItem, projectName: string): CoworkFile {
  const name = displayFileName(item.name ?? item.path ?? item.id);
  const path = item.path ? `${COWORK_OUTBOX}/${item.path}` : undefined;
  return {
    id: path ? coworkFileIdFor(path) : item.id,
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
export function createRealCoworkServices(deps: RealCoworkServicesDeps): CoworkServices {
  const { client, workspaceId } = deps;
  const fallback = deps.fallback ?? createFixtureCoworkServices();

  // The team's state is optional: without it a team skill is still known by its metadata.
  const teamState = () => client.getTeamSkills(workspaceId).catch(() => null);
  const listInstalled = async () => {
    const [{ items }, team] = await Promise.all([client.listSkills(workspaceId, { includeGlobal: true }), teamState()]);
    return items.map((item) => coworkSkillFrom(item, team));
  };

  const readPrivacy = async () => readStoredPrivacy((await client.getConfig(workspaceId)).redrob);
  // A locked level stays as the team policy set it.
  const writePrivacy = async (patch: Partial<Pick<StoredPrivacy, "level" | "names">>) => {
    const current = await readPrivacy();
    if (current.locked) throw new Error("Privacy is locked by your team's policy");
    const next: StoredPrivacy = { ...current, ...patch };
    await client.patchConfig(workspaceId, { redrob: { [COWORK_PRIVACY_CONFIG_KEY]: next } });
    return next;
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
    // Schedules run in redrob-server while the app is open.
    schedules: {
      list: async () => real(boardFromState(await client.listSchedules(workspaceId), workspaceId)),
      answer: async (waitingId, approved) =>
        real(boardFromState(await client.answerScheduleWaiting(workspaceId, waitingId, approved), workspaceId)),
      setEnabled: async (scheduleId, enabled) =>
        real(boardFromState(await client.updateSchedule(workspaceId, scheduleId, { enabled }), workspaceId)),
      save: async (input) => {
        if (!input.rule) throw new Error("A schedule needs a time it can run at");
        const state = await client.addSchedule(workspaceId, { target: input.target, label: input.cadence, rule: input.rule });
        return real(boardFromState(state, workspaceId));
      },
      update: async (scheduleId, patch) => {
        if (patch.cadence !== undefined && !patch.rule) throw new Error("A schedule needs a time it can run at");
        const state = await client.updateSchedule(workspaceId, scheduleId, {
          ...(patch.target ? { target: patch.target } : {}),
          ...(patch.cadence !== undefined ? { label: patch.cadence } : {}),
          ...(patch.rule ? { rule: patch.rule } : {}),
        });
        return real(boardFromState(state, workspaceId));
      },
      remove: async (scheduleId) => real(boardFromState(await client.deleteSchedule(workspaceId, scheduleId), workspaceId)),
    },
    // Installed skills are the workspace's, then the person's own folder's. The library is the
    // Console's public catalogue, read by the browser directly; no server call.
    skills: {
      list: async () => real(await listInstalled()),
      library: async () => real(await consoleCatalogue.list()),
      // The public catalogue carries no profession/task/language.
      taxonomy: async () => real({ professions: [], languages: [] }),
      get: async (name) => {
        const installed = (await listInstalled()).find((skill) => skill.name === name);
        if (installed) {
          const { content } = await client.getSkill(workspaceId, name, { includeGlobal: true });
          const catalogue = consoleCatalogue.peek(name);
          // Catalogue fields fill gaps; the installed skill's own title and summary win, as in the list.
          return real({
            ...(catalogue ? catalogueDisplay(catalogue) : {}),
            ...catalogueDisplay(installed),
            name,
            description: installed.description,
            tags: installed.tags,
            body: skillBody(content),
            installed: { origin: installed.origin, scope: installed.scope },
          });
        }
        return real(await consoleCatalogue.get(name));
      },
      install: async (name) => {
        await client.installLibrarySkill(workspaceId, name);
        return real(null);
      },
      save: async (draft) => {
        const existing = (await listInstalled()).find((skill) => skill.name === draft.name);
        // A new skill never replaces one; a change is only ever to the person's own.
        if (draft.editing ? !existing || !canEditSkill(existing) : existing) throw new Error(`Cannot save the skill ${draft.name}`);
        const saved = await client.upsertSkill(workspaceId, { name: draft.name, content: skillContent(draft), description: draft.description.trim() });
        const { profession, task, language } = draft;
        return real({ name: draft.name, description: draft.description.trim(), origin: "mine", tags: tagsOf({ profession, task, language }), scope: saved.scope ?? existing?.scope ?? "user" });
      },
      remove: async (name) => {
        const existing = (await listInstalled()).find((skill) => skill.name === name);
        if (!existing || !canRemoveSkill(existing)) throw new Error(`The skill ${name} cannot be removed here`);
        await client.deleteSkill(workspaceId, name);
        return real(null);
      },
      teamState: async () => real(await teamState()),
    },
    // History is the chats of every project, newest first, with the steps of the latest.
    history: {
      list: async () => {
        const { items: workspaces } = await client.listWorkspaces();
        const lists = await Promise.all(
          workspaces.map((workspace) =>
            client
              .listSessions(workspace.id, { roots: true, limit: HISTORY_LIMIT })
              .then(({ items }) => items.map((session) => ({ session, projectId: workspace.id })))
              // One project that cannot be read leaves the others.
              .catch(() => []),
          ),
        );
        const recent = lists
          .flat()
          .sort((a, b) => b.session.time.updated - a.session.time.updated)
          .slice(0, HISTORY_LIMIT);
        const chats = useCoworkComposerStore.getState().chats;
        const entries = await Promise.all(
          recent.map(async ({ session, projectId }, index) => {
            const snapshot =
              index < HISTORY_STEPS_LIMIT
                ? await client.getSessionSnapshot(projectId, session.id, { limit: 1 }).then(({ item }) => item).catch(() => null)
                : null;
            return historyEntryFrom({ session, projectId, mode: chats[session.id]?.mode ?? null, snapshot });
          }),
        );
        return real(entries);
      },
    },
    privacy: {
      get: async () => real(await readPrivacy()),
      setLevel: async (level) => real(await writePrivacy({ level })),
      setNames: async (names) => real(await writePrivacy({ names })),
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
export function createCoworkServices(input: {
  client: CoworkServerClient | null;
  workspaceId: string | null;
  mcpStatus?: (() => Promise<CoworkMcpStatusMap>) | null;
}): CoworkServices {
  const fallback = createFixtureCoworkServices();
  if (!input.client || !input.workspaceId) return fallback;
  return createRealCoworkServices({
    client: input.client,
    workspaceId: input.workspaceId,
    mcpStatus: input.mcpStatus,
    fallback,
  });
}
