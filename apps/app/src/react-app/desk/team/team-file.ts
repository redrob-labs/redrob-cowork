import type { Memory } from "@redrob/types/memory";

import type { RedrobServerClient, RedrobWorkspaceExport } from "../../../app/lib/redrob-server";
import { DESK_PRIVACY_CONFIG_KEY, readStoredPrivacy } from "../privacy/privacy-store";
import type { PrivacyLevel } from "../services/types";

/*
 * The team file: one workspace export an admin hands out. On top of what an export already
 * carries (playbooks, skills, connectors, config), `redrob.team` holds the team's notes and
 * its privacy level. Using the file imports the workspace part as usual, then adds the notes
 * as team notes and sets the level, both locked: they change by handing out a new file.
 */

export const TEAM_KEY = "team";
export const TEAM_SCOPE_TAG = "desk-scope:team";
/** Matches LOCKED_MEMORY_TAG in apps/server/src/local-memory-store.ts. */
export const LOCKED_TAG = "desk-locked";

export type TeamSettings = {
  privacy: { level: PrivacyLevel; names: string[]; setBy: string | null };
  notes: Array<{ text: string }>;
};

export type TeamFile = RedrobWorkspaceExport & { redrob: Record<string, unknown> & { team: TeamSettings } };

type TeamClient = Pick<
  RedrobServerClient,
  | "exportWorkspace"
  | "previewWorkspaceImport"
  | "importWorkspace"
  | "listMemories"
  | "saveMemory"
  | "deleteMemory"
  | "getConfig"
  | "patchConfig"
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The team part of a file, or null when the file is not a team file. */
export function readTeamSettings(value: unknown): TeamSettings | null {
  if (!isRecord(value) || !isRecord(value.redrob)) return null;
  const team = value.redrob[TEAM_KEY];
  if (!isRecord(team)) return null;
  const privacy = readStoredPrivacy({ [DESK_PRIVACY_CONFIG_KEY]: team.privacy });
  const notes = Array.isArray(team.notes)
    ? team.notes.flatMap((note) => (isRecord(note) && typeof note.text === "string" && note.text.trim() ? [{ text: note.text.trim() }] : []))
    : [];
  return { privacy: { level: privacy.level, names: privacy.names, setBy: privacy.setBy }, notes };
}

/** A note is the team's when it carries the team scope. */
export function isTeamNote(memory: Pick<Memory, "tags">): boolean {
  return memory.tags?.includes(TEAM_SCOPE_TAG) ?? false;
}

/**
 * The workspace's export with the team's notes and privacy level on top, named for whoever
 * hands it out. Sensitive config (keys, tokens) is left out of the export.
 */
export async function buildTeamFile(client: TeamClient, workspaceId: string, setBy: string): Promise<TeamFile> {
  const [exported, memories, config] = await Promise.all([
    client.exportWorkspace(workspaceId, { sensitiveMode: "exclude" }),
    client.listMemories(),
    client.getConfig(workspaceId),
  ]);
  const privacy = readStoredPrivacy(config.redrob);
  const team: TeamSettings = {
    privacy: { level: privacy.level, names: privacy.names, setBy: setBy.trim() || null },
    notes: memories.filter(isTeamNote).map((memory) => ({ text: memory.content })),
  };
  // Not carried: this workspace's own privacy setting, which the team part replaces.
  const { [DESK_PRIVACY_CONFIG_KEY]: _own, ...redrob } = exported.redrob ?? {};
  return { ...exported, redrob: { ...redrob, [TEAM_KEY]: team } };
}

export function teamFileName(now = new Date()): string {
  return `redrob-team-${now.toISOString().slice(0, 10)}.json`;
}

/** A connector the file adds. `runsProgram` when it starts a program on this computer. */
export type TeamConnector = { name: string; runsProgram: boolean };

/** What using a team file would change, shown before anything changes. */
export type TeamReview = {
  file: Record<string, unknown>;
  team: TeamSettings;
  /** From the server's own preview; the import must carry it back. */
  fingerprint: string;
  changes: number;
  playbooks: number;
  skills: number;
  connectors: TeamConnector[];
  plugins: string[];
  /** The file changes what the AI is allowed to do without asking. */
  permissions: boolean;
  notesAdded: number;
  notesRemoved: number;
};

const lockedTeamNotes = (memories: Memory[]) => memories.filter((memory) => isTeamNote(memory) && (memory.tags?.includes(LOCKED_TAG) ?? false));

function readConnectors(opencode: Record<string, unknown> | null): TeamConnector[] {
  const mcp = opencode && isRecord(opencode.mcp) ? opencode.mcp : {};
  return Object.entries(mcp).map(([name, entry]) => ({
    name,
    runsProgram: isRecord(entry) && (entry.type === "local" || entry.command !== undefined),
  }));
}

function readPlugins(opencode: Record<string, unknown> | null): string[] {
  const plugin = opencode?.plugin;
  return Array.isArray(plugin) ? plugin.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * Reads a team file and asks the server what using it would change, without changing
 * anything. The person sees this and decides; only then does `applyTeamFile` run.
 */
export async function reviewTeamFile(client: TeamClient, workspaceId: string, file: unknown): Promise<TeamReview> {
  const team = readTeamSettings(file);
  if (!team || !isRecord(file)) throw new Error("This is not a team file");
  const [preview, memories] = await Promise.all([client.previewWorkspaceImport(workspaceId, file), client.listMemories()]);
  const opencode = isRecord(file.opencode) ? file.opencode : null;
  const locked = lockedTeamNotes(memories).map((memory) => memory.content.trim());
  const incoming = new Set(team.notes.map((note) => note.text));
  return {
    file,
    team,
    fingerprint: preview.fingerprint,
    changes: preview.summary.create + preview.summary.update + preview.summary.replace + preview.summary.delete,
    playbooks: Array.isArray(file.commands) ? file.commands.length : 0,
    skills: Array.isArray(file.skills) ? file.skills.length : 0,
    connectors: readConnectors(opencode),
    plugins: readPlugins(opencode),
    permissions: opencode ? opencode.permission !== undefined : false,
    notesAdded: [...incoming].filter((text) => !locked.includes(text)).length,
    notesRemoved: locked.filter((text) => !incoming.has(text)).length,
  };
}

export type TeamImportResult = { notesAdded: number; notesRemoved: number; level: PrivacyLevel; setBy: string | null };

/**
 * Uses a reviewed team file: imports it with the preview's fingerprint, so the server
 * refuses if the project changed since the review. Then the team's notes become exactly the
 * file's (new ones added, ones it no longer carries removed) and the level is set, locked.
 */
export async function applyTeamFile(client: TeamClient, workspaceId: string, review: TeamReview): Promise<TeamImportResult> {
  const { team } = review;
  await client.importWorkspace(workspaceId, { ...review.file, previewFingerprint: review.fingerprint });

  const incoming = new Set(team.notes.map((note) => note.text));
  const locked = lockedTeamNotes(await client.listMemories());
  let notesRemoved = 0;
  for (const memory of locked) {
    if (incoming.has(memory.content.trim())) continue;
    await client.deleteMemory(memory.id);
    notesRemoved += 1;
  }
  const have = new Set(locked.map((memory) => memory.content.trim()));
  let notesAdded = 0;
  for (const note of team.notes) {
    if (have.has(note.text)) continue;
    await client.saveMemory({ content: note.text, tags: [TEAM_SCOPE_TAG, LOCKED_TAG], source: "user" });
    have.add(note.text);
    notesAdded += 1;
  }
  await client.patchConfig(workspaceId, {
    redrob: { [DESK_PRIVACY_CONFIG_KEY]: { ...team.privacy, locked: true } },
  });
  return { notesAdded, notesRemoved, level: team.privacy.level, setBy: team.privacy.setBy };
}
