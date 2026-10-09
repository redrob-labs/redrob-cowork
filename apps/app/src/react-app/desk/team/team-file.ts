import type { Memory } from "@redrob/types/memory";

import type { RedrobServerClient, RedrobWorkspaceExport } from "../../../app/lib/redrob-server";
import { DESK_PRIVACY_CONFIG_KEY, readStoredPrivacy } from "../privacy/privacy-store";
import type { PrivacyLevel } from "../services/types";

/*
 * The team file: one workspace export a teammate hands out, to set a project up the same way.
 * On top of what an export already carries (skills, connectors, config),
 * `redrob.team` holds the team's notes and a privacy level.
 *
 * A file proves nothing about who made it, so it locks nothing: the notes it brings and the
 * level it sets are anyone's to change afterwards. Locked settings come only from the team's
 * signed policy (team-policy-group.tsx), and in a project that follows one, the file's notes
 * and level are left out: the policy's stay as they are.
 */

export const TEAM_KEY = "team";
export const TEAM_SCOPE_TAG = "desk-scope:team";
/** Matches LOCKED_MEMORY_TAG in apps/server/src/local-memory-store.ts. */
export const LOCKED_TAG = "desk-locked";
/** Matches TEAM_POLICY_NOTE_TAG in apps/server/src/team-policy/apply.ts. */
export const TEAM_POLICY_TAG = "team-policy";

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
  | "getTeamPolicy"
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
  skills: number;
  connectors: TeamConnector[];
  plugins: string[];
  /** The file changes what the AI is allowed to do without asking. */
  permissions: boolean;
  notesAdded: number;
  notesRemoved: number;
  /** The project follows a signed team policy: the file's notes and level are left out. */
  policyManaged: boolean;
};

const isPolicyNote = (memory: Pick<Memory, "tags">) => memory.tags?.includes(TEAM_POLICY_TAG) ?? false;
/**
 * The team notes a team file manages: every team note except a policy's. That includes notes an
 * earlier build's team file locked, which a file now replaces with unlocked ones.
 */
const fileTeamNotes = (memories: Memory[]) => memories.filter((memory) => isTeamNote(memory) && !isPolicyNote(memory));
const isLegacyLocked = (memory: Pick<Memory, "tags">) => memory.tags?.includes(LOCKED_TAG) ?? false;

/** Whether the project follows a signed team policy. A server that cannot say is taken as no: it still refuses what a policy locks. */
async function followsTeamPolicy(client: TeamClient, workspaceId: string): Promise<boolean> {
  try {
    return (await client.getTeamPolicy(workspaceId)).joined;
  } catch {
    return false;
  }
}

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
  const [preview, memories, policyManaged] = await Promise.all([
    client.previewWorkspaceImport(workspaceId, file),
    client.listMemories(),
    followsTeamPolicy(client, workspaceId),
  ]);
  const opencode = isRecord(file.opencode) ? file.opencode : null;
  const current = fileTeamNotes(memories).map((memory) => memory.content.trim());
  const incoming = new Set(policyManaged ? [] : team.notes.map((note) => note.text));
  return {
    file,
    team,
    fingerprint: preview.fingerprint,
    changes: preview.summary.create + preview.summary.update + preview.summary.replace + preview.summary.delete,
    skills: Array.isArray(file.skills) ? file.skills.length : 0,
    connectors: readConnectors(opencode),
    plugins: readPlugins(opencode),
    permissions: opencode ? opencode.permission !== undefined : false,
    notesAdded: [...incoming].filter((text) => !current.includes(text)).length,
    notesRemoved: policyManaged ? 0 : current.filter((text) => !incoming.has(text)).length,
    policyManaged,
  };
}

export type TeamImportResult = {
  notesAdded: number;
  notesRemoved: number;
  level: PrivacyLevel;
  setBy: string | null;
  policyManaged: boolean;
};

/**
 * Uses a reviewed team file: imports it with the preview's fingerprint, so the server refuses if
 * the project changed since the review. Then, unless the project follows a team policy, the team
 * notes become exactly the file's (new ones added, ones it no longer carries removed) and the
 * level is set, all unlocked.
 */
export async function applyTeamFile(client: TeamClient, workspaceId: string, review: TeamReview): Promise<TeamImportResult> {
  const { team, policyManaged } = review;
  if (!policyManaged) {
    // The level first: a lock an earlier team file left is lifted only with the owner's token, and
    // refused here nothing has changed yet; refused after the import, the project would be half set up.
    await client.patchConfig(workspaceId, {
      redrob: { [DESK_PRIVACY_CONFIG_KEY]: { ...team.privacy, locked: false } },
    });
  }
  await client.importWorkspace(workspaceId, { ...review.file, previewFingerprint: review.fingerprint });
  if (policyManaged) return { notesAdded: 0, notesRemoved: 0, level: team.privacy.level, setBy: team.privacy.setBy, policyManaged };

  const incoming = new Set(team.notes.map((note) => note.text));
  const current = fileTeamNotes(await client.listMemories());
  let notesRemoved = 0;
  const have = new Set<string>();
  for (const memory of current) {
    const text = memory.content.trim();
    // A note the file still carries stays, unless an earlier file locked it: that one is
    // replaced by the same note unlocked, and is not counted as a change.
    if (incoming.has(text) && !isLegacyLocked(memory) && !have.has(text)) {
      have.add(text);
      continue;
    }
    await client.deleteMemory(memory.id);
    if (!incoming.has(text)) notesRemoved += 1;
  }
  const before = new Set(current.map((memory) => memory.content.trim()));
  let notesAdded = 0;
  for (const note of team.notes) {
    if (have.has(note.text)) continue;
    await client.saveMemory({ content: note.text, tags: [TEAM_SCOPE_TAG], source: "user" });
    have.add(note.text);
    if (!before.has(note.text)) notesAdded += 1;
  }
  return { notesAdded, notesRemoved, level: team.privacy.level, setBy: team.privacy.setBy, policyManaged };
}
