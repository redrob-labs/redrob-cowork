export type OpenCodeContext = {
  agent?: string;
  sessionID?: string;
  messageID?: string;
  directory?: string;
  worktree?: string;
  workspaceId?: string;
  workspaceID?: string;
};

type EngineMcpStatusRequest = {
  query?: { directory?: string };
};

export type RedrobWorkEngineMcpStatusClient = {
  mcp: {
    status: (request?: EngineMcpStatusRequest) => Promise<unknown>;
  };
};

export type RedrobWorkEngineMcpStatusSource = {
  client?: RedrobWorkEngineMcpStatusClient;
  directory?: string;
};

export const REDROB_EXTENSION_DISCOVERY_INSTRUCTION =
  "If the user asks for something you cannot do with obvious built-in tools, check Redrob Cowork extensions before saying the capability is unavailable. Use redrob_query with id extension.actions to inspect available extension actions, then redrob_execute with id extension.call for the matching action.";

export const REDROB_LOCAL_SKILL_AUTHORING_INSTRUCTION =
  "Skill creation: Local. Create or update a workspace-local skill only when the user requests one. Keep one skill in .opencode/skills/<skill-name>/SKILL.md, validate it, and re-read it after writing.";

/**
 * Steering is local-only: there is no control plane to probe, so the agent
 * always gets the same extension-discovery and local skill-authoring guidance.
 */
export async function resolveRedrobWorkExtensionDiscoveryInstruction(
  _input?: unknown,
  _fetcher?: unknown,
  _engine?: RedrobWorkEngineMcpStatusSource,
): Promise<string> {
  return REDROB_EXTENSION_DISCOVERY_INSTRUCTION;
}

export function composeSkillAuthoringInstruction(_extensionInstruction: string): {
  mode: "local";
  prompt: string;
} {
  return { mode: "local", prompt: REDROB_LOCAL_SKILL_AUTHORING_INSTRUCTION };
}
