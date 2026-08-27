/**
 * Shared wire contract for workspace records.
 *
 * Producers:
 * - redrob-server (apps/server): `GET /workspaces` and friends — emits plain
 *   optionals (never null) plus the `opencode*` engine credential fields.
 * - desktop Electron IPC bridge (apps/desktop main.mjs): emits explicit nulls
 *   and the desktop-managed `redrobClientToken`/`redrobHostToken`.
 *
 * Consumers (apps/app) must treat every optional field as possibly absent,
 * undefined, or null. Producer-side types assert assignability against this
 * shape (see apps/server/src/types.ts) so drift fails typecheck instead of
 * surfacing as runtime undefined-field bugs.
 */
export type WorkspaceKind = "local" | "remote";

export type WorkspaceRemoteKind = "opencode" | "redrob";

export type WorkspaceWire = {
  id: string;
  name: string;
  path: string;
  preset: string;
  workspaceType: WorkspaceKind;
  remoteType?: WorkspaceRemoteKind | null;
  baseUrl?: string | null;
  directory?: string | null;
  displayName?: string | null;
  redrobHostUrl?: string | null;
  redrobToken?: string | null;
  /** Desktop IPC only: tokens for desktop-managed remote workspaces. */
  redrobClientToken?: string | null;
  redrobHostToken?: string | null;
  redrobWorkspaceId?: string | null;
  redrobWorkspaceName?: string | null;
  /**
   * Vocabulary differs per producer today ("docker" | "microsandbox" on the
   * desktop, "none" | "docker" | "container" in redrob-server), so the wire
   * stays a plain string until the backends converge.
   */
  sandboxBackend?: string | null;
  sandboxRunId?: string | null;
  sandboxContainerName?: string | null;
  /** redrob-server only: credentials for the proxied opencode engine. */
  opencodeUsername?: string | null;
  opencodePassword?: string | null;
  opencode?: {
    baseUrl?: string;
    directory?: string;
    username?: string;
    password?: string;
  } | null;
};
