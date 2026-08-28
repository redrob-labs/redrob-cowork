import type { RedrobServerClient } from "../../../app/lib/redrob-server";

/**
 * Redrob Key operations, all of them against Redrob Code's auth store.
 *
 * Redrob Work does not own this credential and keeps no copy of it. Onboarding
 * collects the value and hands it to the engine through one narrow authenticated
 * Work server route; everything after that reads the engine's own answer.
 *
 * That is why there is no `PUT /env` here. Persisting the key in Work's env
 * store made it a second source of truth that had to be kept in sync with the
 * engine, and it only reached the engine at all as a side effect of seeding a
 * provider entry so a server-side env-name match could find it. Both of those
 * are gone.
 */

/** The methods these operations need — narrowed so callers can be exercised without a full client. */
export type RedrobKeyConnectClient = Pick<
  RedrobServerClient,
  "getRedrobAuthStatus" | "connectRedrobAuth" | "disconnectRedrobAuth"
>;

export type RedrobKeyStatus = {
  connected: boolean;
  /** Which engine-side origin supplied the credential. Never the credential. */
  source: "api" | "env" | "config" | "none";
};

/**
 * Connect inference from a key the user issued at console.redrob.ai.
 *
 * One call. The server delivers it to the engine, brings the engine onto the new
 * credential, and reads status back; a response that does not confirm a
 * connected key is an error, so a half-connected state surfaces on the key step
 * instead of failing later at the user's first prompt.
 */
export async function connectRedrobKey(
  client: RedrobKeyConnectClient,
  apiKey: string,
): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) return;
  await client.connectRedrobAuth(trimmed);
}

/**
 * Rotate the key. Identical to connecting: the engine's auth store holds one
 * entry per provider and writing it replaces whatever was there, so there is no
 * separate remove-then-add to get half way through.
 */
export async function replaceRedrobKey(
  client: RedrobKeyConnectClient,
  apiKey: string,
): Promise<void> {
  await connectRedrobKey(client, apiKey);
}

/**
 * Disconnect inference. The server removes the engine's auth entry and verifies
 * the engine no longer reports a credential, so this resolving means the key is
 * actually gone rather than merely requested to be gone.
 */
export async function disconnectRedrobKey(client: RedrobKeyConnectClient): Promise<void> {
  await client.disconnectRedrobAuth();
}

/** Observe whether the engine currently holds a Redrob Key. */
export async function readRedrobKeyStatus(client: RedrobKeyConnectClient): Promise<RedrobKeyStatus> {
  const { connected, source } = await client.getRedrobAuthStatus();
  return { connected, source };
}
