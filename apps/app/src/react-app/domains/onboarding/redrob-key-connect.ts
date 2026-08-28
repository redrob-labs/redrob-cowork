import type { RedrobServerClient } from "../../../app/lib/redrob-server";
import {
  REDROB_API_KEY_ENV,
  REDROB_PROVIDER_ID,
  buildRedrobProviderConfig,
} from "../settings/redrob-provider";

/**
 * The two host-token calls the onboarding key step needs. Narrowed to the
 * methods actually used so the sequence can be exercised without standing up a
 * full client surface.
 */
export type RedrobKeyConnectClient = Pick<
  RedrobServerClient,
  "upsertUserEnv" | "patchEngineRuntimeProviders"
>;

/**
 * Connect inference from a key the user issued at console.redrob.ai.
 *
 * Storing the key is necessary but not sufficient. The engine is spawned with a
 * fixed env allowlist and never reads the server's env store, so the server has
 * to hand the value to the engine's auth API itself. It only does that for
 * providers present in the *engine-global* runtime config, matching the stored
 * key by the `env: ["REDROB_API_KEY"]` names declared on the provider entry.
 *
 * So this is two calls, in this order:
 *
 *   1. `PUT /env` persists `REDROB_API_KEY`.
 *   2. `PATCH /runtime-config/providers` seeds the Redrob provider entry, and
 *      the server re-runs its credential sync after that write — which is the
 *      point at which the engine actually receives the key.
 *
 * Doing step 2 last is deliberate: that route also reloads the engine before
 * syncing, so the credential is delivered to the generation that will serve
 * the user's first request.
 *
 * Both calls are awaited and errors propagate: a half-connected state (key
 * stored, engine unauthenticated) must surface on the key step rather than
 * looking like success and failing later at inference time.
 */
export async function connectRedrobKey(
  client: RedrobKeyConnectClient,
  apiKey: string,
): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) return;
  await client.upsertUserEnv([{ key: REDROB_API_KEY_ENV, value: trimmed }]);
  await client.patchEngineRuntimeProviders({
    [REDROB_PROVIDER_ID]: buildRedrobProviderConfig(),
  });
}
