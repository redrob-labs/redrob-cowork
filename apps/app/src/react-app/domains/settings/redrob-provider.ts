import type { ProviderConfig } from "@opencode-ai/sdk/v2/client";

/**
 * Single source of truth for the built-in Redrob inference provider
 * (console.redrob.ai). Redrob is an OpenAI-compatible endpoint routed through a
 * single model id, so it is modeled with the same `@ai-sdk/openai-compatible`
 * driver used by the other OpenAI-compatible providers in this app.
 */
export const REDROB_PROVIDER_ID = "redrob";
export const REDROB_PROVIDER_NAME = "Redrob";
export const REDROB_BASE_URL = "https://console.redrob.ai/api/backend/v1";
export const REDROB_API_KEY_ENV = "REDROB_API_KEY";

/**
 * Canonical Redrob model id. `auto` lets the console route each request to the
 * best model in its catalog. The retired `redrob-ai` / `redrob-translate`
 * aliases are gone from the console API and must not be referenced anywhere.
 */
export const REDROB_MODEL_ID = "auto";
export const REDROB_MODEL_NAME = "Auto";

/**
 * Public console where users issue their REDROB_API_KEY. Onboarding links here
 * (the API base URL above lives under the same host). Kept as a distinct
 * constant so the human-facing console URL and the machine API base can never
 * drift out of sync.
 */
export const REDROB_CONSOLE_URL = "https://console.redrob.ai";

/**
 * Single source-of-truth allowlist of inference provider ids the app exposes.
 * Redrob is currently the only usable provider: the connect modal, the model
 * picker, and every provider list filter through this so no other provider can
 * be selected or connected. Relaxing this later is a one-line change (add ids
 * here); the engine keeps its full capability, we only gate the app layer.
 */
export const REDROB_ONLY_PROVIDER_IDS: readonly string[] = [REDROB_PROVIDER_ID];

/** True when `id` is an allowlisted provider id (case-insensitive, trimmed). */
export function isRedrobOnlyProviderId(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return false;
  return REDROB_ONLY_PROVIDER_IDS.some((allowed) => allowed.toLowerCase() === normalized);
}

/**
 * Build the OpenCode provider config for Redrob. Uses the same ProviderConfig
 * shape as `buildLocalProviderConfig` so the engine resolves it as a standard
 * OpenAI-compatible provider. The API key is supplied at runtime through the
 * `REDROB_API_KEY` environment variable and is never embedded here.
 *
 * No per-model request extras are sent: the console API rejects the retired
 * language fields that the old `redrob-ai` alias accepted, so `auto` is a plain
 * OpenAI-compatible model.
 */
export function buildRedrobProviderConfig(): ProviderConfig {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: REDROB_PROVIDER_NAME,
    env: [REDROB_API_KEY_ENV],
    options: { baseURL: REDROB_BASE_URL },
    models: {
      [REDROB_MODEL_ID]: {
        name: REDROB_MODEL_NAME,
      },
    },
  };
}
