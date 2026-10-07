import { recordAudit } from "../audit.js";
import { buildCommandContent, deleteCommand, upsertCommand } from "../commands.js";
import { ApiError } from "../errors.js";
import { LOCKED_MEMORY_TAG, replaceTaggedMemories } from "../local-memory-store.js";
import { readRedrobWorkspaceConfig, writeRedrobWorkspaceConfig } from "../redrob-workspace-config-store.js";
import { buildSkillContent, deleteSkill, upsertSkill } from "../skills.js";
import { DESK_PRIVACY_CONFIG_KEY } from "../team-lock.js";
import type { Actor, ServerConfig } from "../types.js";
import { shortId } from "../utils.js";
import { createWorkspaceKvStore, isRecord } from "../workspace-kv-store.js";
import { verifyTeamPolicyJws } from "./jws.js";
import { TEST_KEY_PREFIX, trustedKeys, type PinnedKey } from "./keys.js";
import type { TeamPolicy } from "./policy.js";

/*
 * Applying a verified team policy to one workspace, and remembering what was applied.
 *
 * The signature is the authority here, not the caller: a locked setting changes only through a
 * newer signed policy, so the routes that edit settings directly refuse locked ones for every
 * token, owner included (see teamPolicyLocksPrivacy and TEAM_POLICY_NOTE_TAG).
 */

/** Every note a policy brings carries this tag; no /memory route may add, edit or remove one. */
export const TEAM_POLICY_NOTE_TAG = "team-policy";
const teamNoteTag = (accountId: string) => `${TEAM_POLICY_NOTE_TAG}:${accountId}`;
/** Matches TEAM_SCOPE_TAG in apps/app/src/react-app/desk/team/team-file.ts. */
const TEAM_SCOPE_TAG = "desk-scope:team";

export type TeamPolicyState = {
  accountId: string;
  version: number;
  kid: string;
  payloadSha256: string;
  appliedAt: number;
  /** True after the workspace left the team; the version is kept so an older policy stays refused. */
  left: boolean;
  policy: TeamPolicy | null;
  /** What this policy wrote to disk, so a newer one (or leaving) removes exactly that. */
  installed: { skills: string[]; playbooks: string[] };
};

function parseState(json: string): TeamPolicyState | null {
  try {
    const value = JSON.parse(json) as unknown;
    if (!isRecord(value) || typeof value.accountId !== "string" || typeof value.version !== "number") return null;
    return value as unknown as TeamPolicyState;
  } catch {
    return null;
  }
}

const stateStore = createWorkspaceKvStore<TeamPolicyState | null>({
  tableName: "team_policy_states",
  valueColumn: "state_json",
  parse: parseState,
  serialize: (value) => JSON.stringify(value),
});

export async function readTeamPolicyState(config: ServerConfig, workspaceId: string): Promise<TeamPolicyState | null> {
  return (await stateStore.get(config, workspaceId)) ?? null;
}

/** The policy currently in force for a workspace, or null when it has none or left its team. */
export async function activeTeamPolicy(config: ServerConfig, workspaceId: string): Promise<TeamPolicyState | null> {
  const state = await readTeamPolicyState(config, workspaceId);
  return state && !state.left && state.policy ? state : null;
}

/** Whether the workspace's privacy setting is locked by its team policy. */
export async function teamPolicyLocksPrivacy(config: ServerConfig, workspaceId: string): Promise<boolean> {
  return (await activeTeamPolicy(config, workspaceId))?.policy?.privacy.locked === true;
}

type Workspace = { id: string; path: string };

export type TeamPolicyChangeListener = (config: ServerConfig, workspace: Workspace) => Promise<void> | void;
const changeListeners = new Set<TeamPolicyChangeListener>();

/**
 * Observe a workspace starting, changing or stopping to follow a team policy, whatever caused it (a
 * route, the scheduled check). Used to enforce what the policy controls outside this module, such as
 * the connector allowlist. Listener failures are swallowed: the policy itself is already in force.
 */
export function onTeamPolicyChange(listener: TeamPolicyChangeListener): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

async function notifyTeamPolicyChange(config: ServerConfig, workspace: Workspace): Promise<void> {
  for (const listener of changeListeners) {
    try {
      await listener(config, workspace);
    } catch {
      // See onTeamPolicyChange.
    }
  }
}

export type ApplyOptions = {
  actor?: Actor;
  /** The account the device key belongs to. When given, a policy for any other account is refused. */
  expectedAccountId?: string;
  keys?: readonly PinnedKey[];
  now?: () => number;
};

export type ApplyResult = { status: "applied" | "unchanged"; state: TeamPolicyState };

const conflict = (code: string, message: string): never => {
  throw new ApiError(409, code, message);
};

/** The privacy block the app reads (readStoredPrivacy), plus what the privacy gate will read. */
function privacyConfig(policy: TeamPolicy): Record<string, unknown> {
  const names = [...new Set(policy.privacy.names.flat().map((name) => name.trim()).filter(Boolean))];
  return {
    level: policy.privacy.level,
    names,
    aliases: policy.privacy.names,
    setBy: policy.setBy.name,
    locked: policy.privacy.locked,
    keep: policy.privacy.keep,
    transforms: policy.privacy.transforms,
    source: "team-policy",
    teamPolicy: { accountId: policy.accountId, version: policy.version },
  };
}

export async function applyTeamPolicy(
  config: ServerConfig,
  workspace: Workspace,
  jws: string,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const verified = await verifyTeamPolicyJws(jws, options.keys ?? trustedKeys());
  const { policy } = verified;

  if (options.expectedAccountId !== undefined && options.expectedAccountId !== policy.accountId) {
    throw new ApiError(422, "team_policy_wrong_account", "This policy belongs to a different team");
  }

  const previous = await readTeamPolicyState(config, workspace.id);
  if (previous && !previous.left && previous.accountId !== policy.accountId) {
    conflict("team_policy_other_team", "This workspace already follows another team's policy. Leave that team first.");
  }
  if (previous && previous.accountId === policy.accountId) {
    if (policy.version < previous.version) {
      conflict("team_policy_not_newer", `Version ${policy.version} is older than the applied version ${previous.version}`);
    }
    if (policy.version === previous.version && !previous.left) {
      if (previous.payloadSha256 === verified.payloadSha256) return { status: "unchanged", state: previous };
      conflict("team_policy_conflict", `Version ${policy.version} was already applied with different content`);
    }
  }

  // Validate everything that will be written before writing anything, so a bad skill name cannot
  // leave the workspace half on the old policy and half on the new one.
  const skills = policy.skills.map((skill) => buildSkillContent(skill));
  const playbooks = policy.playbooks.map((playbook) => buildCommandContent(playbook));

  const stale = previous && previous.accountId === policy.accountId ? previous.installed : { skills: [], playbooks: [] };
  for (const [index, skill] of skills.entries()) {
    await upsertSkill(workspace.path, { ...policy.skills[index]!, name: skill.name });
  }
  for (const playbook of policy.playbooks) await upsertCommand(workspace.path, playbook);
  const skillNames = skills.map((skill) => skill.name);
  const playbookNames = playbooks.map((playbook) => playbook.name);
  for (const name of stale.skills.filter((name) => !skillNames.includes(name))) {
    await deleteSkill(workspace.path, name).catch(() => undefined);
  }
  for (const name of stale.playbooks.filter((name) => !playbookNames.includes(name))) {
    await deleteCommand(workspace.path, name).catch(() => undefined);
  }

  // Memory is per machine, not per workspace, so the set replaced is this team's notes only.
  await replaceTaggedMemories(
    config,
    teamNoteTag(policy.accountId),
    policy.notes.map((note) => ({
      content: note.text,
      tags: [TEAM_SCOPE_TAG, LOCKED_MEMORY_TAG, TEAM_POLICY_NOTE_TAG, teamNoteTag(policy.accountId)],
      source: "team-policy",
    })),
  );

  await writeRedrobWorkspaceConfig(config, workspace.id, (current) => ({
    ...current,
    [DESK_PRIVACY_CONFIG_KEY]: privacyConfig(policy),
  }));

  const now = options.now?.() ?? Date.now();
  const state: TeamPolicyState = {
    accountId: policy.accountId,
    version: policy.version,
    kid: verified.kid,
    payloadSha256: verified.payloadSha256,
    appliedAt: now,
    left: false,
    policy,
    installed: { skills: skillNames, playbooks: playbookNames },
  };
  await stateStore.set(config, workspace.id, state, now);

  await recordAudit(workspace.path, {
    id: shortId(),
    workspaceId: workspace.id,
    actor: options.actor ?? { type: "host" },
    action: "policy.applied",
    target: `team-policy:${policy.accountId}`,
    summary: `Applied team policy version ${policy.version} set by ${policy.setBy.name}${
      verified.kid.startsWith(TEST_KEY_PREFIX) ? " (test key)" : ""
    }`,
    timestamp: now,
  });
  await notifyTeamPolicyChange(config, workspace);

  return { status: "applied", state };
}

/**
 * Leaves the team: removes the notes, playbooks and skills the policy brought and lifts the lock.
 * The privacy level stays where the team set it, so leaving never silently lowers protection;
 * the person can lower it themselves afterwards.
 */
export async function leaveTeamPolicy(
  config: ServerConfig,
  workspace: Workspace,
  options: { actor?: Actor; reason?: string; now?: () => number } = {},
): Promise<TeamPolicyState | null> {
  const state = await readTeamPolicyState(config, workspace.id);
  if (!state || state.left) return state;

  for (const name of state.installed.skills) await deleteSkill(workspace.path, name).catch(() => undefined);
  for (const name of state.installed.playbooks) await deleteCommand(workspace.path, name).catch(() => undefined);
  await replaceTaggedMemories(config, teamNoteTag(state.accountId), []);

  const stored = await readRedrobWorkspaceConfig(config, workspace.id);
  const privacy = isRecord(stored[DESK_PRIVACY_CONFIG_KEY]) ? stored[DESK_PRIVACY_CONFIG_KEY] : {};
  await writeRedrobWorkspaceConfig(config, workspace.id, (current) => ({
    ...current,
    [DESK_PRIVACY_CONFIG_KEY]: { level: privacy.level ?? "standard", names: [], setBy: null, locked: false },
  }));

  const now = options.now?.() ?? Date.now();
  const next: TeamPolicyState = { ...state, left: true, policy: null, installed: { skills: [], playbooks: [] }, appliedAt: now };
  await stateStore.set(config, workspace.id, next, now);
  await recordAudit(workspace.path, {
    id: shortId(),
    workspaceId: workspace.id,
    actor: options.actor ?? { type: "host" },
    action: "policy.left",
    target: `team-policy:${state.accountId}`,
    summary: `Left the team${options.reason ? ` (${options.reason})` : ""}; its notes, playbooks and skills were removed`,
    timestamp: now,
  });
  await notifyTeamPolicyChange(config, workspace);
  return next;
}

/** What the routes report: enough for the Team screen, nothing the app should act on blindly. */
export function describeTeamPolicyState(state: TeamPolicyState | null) {
  if (!state || state.left || !state.policy) {
    return { joined: false, accountId: state?.accountId ?? null, version: state?.version ?? null };
  }
  const { policy } = state;
  return {
    joined: true,
    accountId: state.accountId,
    version: state.version,
    issuedAt: policy.issuedAt,
    appliedAt: state.appliedAt,
    setBy: policy.setBy,
    signedWithTestKey: state.kid.startsWith(TEST_KEY_PREFIX),
    privacy: { level: policy.privacy.level, locked: policy.privacy.locked },
    notes: policy.notes.length,
    playbooks: state.installed.playbooks,
    skills: state.installed.skills,
    connectors: policy.connectors,
  };
}
