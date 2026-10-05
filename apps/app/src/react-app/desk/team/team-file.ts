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
  "exportWorkspace" | "previewWorkspaceImport" | "importWorkspace" | "listMemories" | "saveMemory" | "getConfig" | "patchConfig"
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

export type TeamImportResult = { notesAdded: number; level: PrivacyLevel; setBy: string | null };

/**
 * Uses a team file in a workspace: the export is previewed and imported as the server does
 * it, then the team's notes are added once each and the level is set, locked.
 */
export async function applyTeamFile(client: TeamClient, workspaceId: string, file: unknown): Promise<TeamImportResult> {
  const team = readTeamSettings(file);
  if (!team || !isRecord(file)) throw new Error("This is not a team file");
  const preview = await client.previewWorkspaceImport(workspaceId, file);
  await client.importWorkspace(workspaceId, { ...file, previewFingerprint: preview.fingerprint });

  const have = new Set((await client.listMemories()).filter(isTeamNote).map((memory) => memory.content.trim()));
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
  return { notesAdded, level: team.privacy.level, setBy: team.privacy.setBy };
}
