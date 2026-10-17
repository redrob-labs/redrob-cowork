/** The one call needed; `RedrobServerClient` satisfies it. The result is not read. */
export type PersonalWorkspaceClient = { ensurePersonalWorkspace: () => Promise<unknown> };

/**
 * Makes sure the hidden Personal workspace exists, at most once per app session, so a chat
 * outside any project can be saved as one. The server call is idempotent and never changes
 * the active workspace unless none exists. A failure is silent: the chat route still works.
 */
export function createPersonalWorkspaceEnsurer() {
  let started = false;
  return (client: PersonalWorkspaceClient | null) => {
    if (started || !client) return;
    started = true;
    void client.ensurePersonalWorkspace().catch(() => undefined);
  };
}

export const ensurePersonalWorkspaceOnce = createPersonalWorkspaceEnsurer();
