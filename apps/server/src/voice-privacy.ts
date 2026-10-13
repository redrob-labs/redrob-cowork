import { ApiError } from "./errors.js";
import { readRedrobWorkspaceConfig } from "./redrob-workspace-config-store.js";
import { deskPrivacyLevel } from "./engine-privacy.js";
import type { ServerConfig } from "./types.js";

/**
 * Whether a workspace's privacy protection lets voice run.
 *
 * The engine masks personal details in TEXT before a model sees it. Speech cannot be masked:
 * read-aloud sends the reply with its real values to a speech vendor, and a recording is sent to a
 * transcription vendor as it was spoken. At Strict protection that is exactly what the person asked
 * not to happen, so voice is off there rather than quietly weaker than the setting says.
 */
export async function voiceAllowed(config: ServerConfig, workspaceId: string): Promise<boolean> {
  return deskPrivacyLevel(await readRedrobWorkspaceConfig(config, workspaceId)) !== "strict";
}

export async function assertVoiceAllowed(config: ServerConfig, workspaceId: string): Promise<void> {
  if (!(await voiceAllowed(config, workspaceId))) {
    throw new ApiError(
      403,
      "voice_off_for_privacy",
      "Voice is off while privacy protection is Strict, because speech cannot be masked.",
    );
  }
}
