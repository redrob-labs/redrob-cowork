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
export const REDROB_MODEL_ID = "redrob-ai";

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
 * Redrob-specific request extras (the OpenAI `extra_body` equivalent) passed
 * through per model via the AI-SDK/OpenCode provider `options` passthrough.
 */
export const REDROB_MODEL_OPTIONS = {
  indicAssist: true,
  detectLanguage: true,
} as const;

/**
 * Build the OpenCode provider config for Redrob. Uses the same ProviderConfig
 * shape as `buildLocalProviderConfig` so the engine resolves it as a standard
 * OpenAI-compatible provider. The API key is supplied at runtime through the
 * `REDROB_API_KEY` environment variable and is never embedded here.
 */
export function buildRedrobProviderConfig(): ProviderConfig {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: REDROB_PROVIDER_NAME,
    env: [REDROB_API_KEY_ENV],
    options: { baseURL: REDROB_BASE_URL },
    models: {
      [REDROB_MODEL_ID]: {
        name: REDROB_PROVIDER_NAME,
        options: { ...REDROB_MODEL_OPTIONS },
      },
    },
  };
}
