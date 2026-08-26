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
