import { ApiError } from "./errors.js";
import { readPrivacyRules } from "./privacy/gate.js";
import { readRedrobWorkspaceConfig } from "./redrob-workspace-config-store.js";
import type { ServerConfig } from "./types.js";

/**
 * Whether a workspace's privacy protection lets voice run.
 *
 * The privacy gate labels personal details in TEXT before a model sees it. Speech cannot be labelled:
 * read-aloud sends the reply with its real values to a speech vendor, and a recording is sent to a
 * transcription vendor as it was spoken. At High and Strict protection that is exactly what the
 * person asked not to happen, so voice is off there rather than quietly weaker than the setting says.
 */
export async function voiceAllowed(config: ServerConfig, workspaceId: string): Promise<boolean> {
  const level = readPrivacyRules(await readRedrobWorkspaceConfig(config, workspaceId)).level;
  return level !== "high" && level !== "strict";
}

export async function assertVoiceAllowed(config: ServerConfig, workspaceId: string): Promise<void> {
  if (!(await voiceAllowed(config, workspaceId))) {
    throw new ApiError(
      403,
      "voice_off_for_privacy",
      "Voice is off while privacy protection is High or Strict, because speech cannot be checked for personal details.",
    );
  }
}
