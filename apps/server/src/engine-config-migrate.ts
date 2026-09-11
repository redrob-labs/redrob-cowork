import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  legacyGlobalConfigCandidates,
  legacyWorkspaceConfigCandidates,
  resolveGlobalEngineConfigPath,
  resolveWorkspaceEngineConfigPath,
  workspaceEngineConfigCandidates,
} from "@redrob/paths";

/**
 * One-way migration off the config filenames the engine never read.
 *
 * Redrob Work used to write user config to upstream OpenCode's filenames --
 * `opencode.jsonc` at the workspace root, `~/.config/opencode/opencode.jsonc`
 * globally -- while the engine had already moved to `redrob.json(c)` under
 * `~/.config/redrob`. Nothing loaded those files, so MCP servers and plugins
 * added through the UI silently had no effect.
 *
 * The copy is deliberately conservative:
 *   - it runs only when NO engine-visible config exists yet, so it can never
 *     overwrite a file the engine is already honouring;
 *   - it copies bytes verbatim rather than reformatting, because the legacy file
 *     may be JSONC with comments the user wrote;
 *   - it leaves the legacy file in place. Deleting it would be the destructive
 *     half of a migration whose benefit is already realised by the copy, and the
 *     engine ignores it either way.
 */

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

async function anyExists(paths: string[]): Promise<boolean> {
  for (const path of paths) {
    if ((await readIfPresent(path)) !== null) return true;
  }
  return false;
}

async function migrate(
  targets: string[],
  destination: string,
  sources: string[],
): Promise<string | null> {
  if (await anyExists(targets)) return null;
  for (const source of sources) {
    const contents = await readIfPresent(source);
    if (contents === null) continue;
    if (!contents.trim()) continue;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents, "utf8");
    return source;
  }
  return null;
}

/**
 * Migrate a workspace's legacy user config. Returns the source path it copied
 * from, or null when there was nothing to do. Never throws for a missing file.
 */
export async function migrateLegacyWorkspaceConfig(workspaceRoot: string): Promise<string | null> {
  if (!workspaceRoot.trim()) return null;
  return migrate(
    workspaceEngineConfigCandidates(workspaceRoot),
    resolveWorkspaceEngineConfigPath(workspaceRoot),
    legacyWorkspaceConfigCandidates(workspaceRoot),
  );
}

/** Migrate the global user config. Same contract as the workspace variant. */
export async function migrateLegacyGlobalConfig(): Promise<string | null> {
  const destination = resolveGlobalEngineConfigPath();
  return migrate([destination], destination, legacyGlobalConfigCandidates());
}
