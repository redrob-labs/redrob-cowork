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
export const REDROB_OPUS_MODEL_ID = "claude-opus-5";
export const REDROB_OPUS_MODEL_NAME = "Claude Opus 5";

/**
 * Public console where users issue their REDROB_API_KEY. Onboarding links here
 * (the API base URL above lives under the same host). Kept as a distinct
 * constant so the human-facing console URL and the machine API base can never
 * drift out of sync.
 */
export const REDROB_CONSOLE_URL = "https://console.redrob.ai";

/**
 * Console-hosted payment page. Redrob Cowork links here and stops: the console
 * owns the checkout, the amount, and which payment methods Stripe offers, so
 * this app never collects, forwards, or proxies card data.
 *
 * Under the same confirmed host as the API base and the connect flow, so
 * `pnpm check:outbound-access` needs no new entry for it and a user who reads
 * the link before pressing it sees a host they already trust.
 */
export const REDROB_CONSOLE_BILLING_URL = "https://console.redrob.ai/billing";

/**
 * Which inference providers the app offers, and why it is not simply "all of
 * them".
 *
 * The app used to expose exactly one provider, Redrob. The engine never had that
 * restriction — it carries the whole models.dev catalogue, 75-odd providers — so
 * the gate was the app's alone, and lifting it is what the user asked for.
 *
 * Lifting it to literally everything, though, would fill the connect list with
 * entries that cannot be completed HERE. The modal collects one secret: an API
 * key, or an OAuth round trip. Amazon Bedrock wants an access key, a secret and
 * a region; Azure wants a resource name beside its key; Vertex wants a service
 * account. Those declare several environment variables precisely because one
 * field is not enough, and offering them would mean advertising a connection the
 * user cannot finish — worse than not listing them, because the failure only
 * shows up after they have gone looking for credentials.
 *
 * So the rule is about what the connect flow can actually complete, and it reads
 * the provider's own declaration rather than a list of names that would go stale
 * as upstream adds providers:
 *
 *   - Redrob is always exposed; the engine owns its credential outright.
 *   - An already-connected provider is always exposed. Something completed it,
 *     and hiding a working provider would be a regression.
 *   - Zero declared env vars means no secret is needed here at all — a local
 *     runtime such as Ollama, which the engine finds by itself.
 *   - Exactly one declared env var is a single secret, which is what the API-key
 *     field collects.
 *   - Two or more is multi-field configuration the modal has no form for.
 *
 * A provider that offers OAuth is exposed regardless of its env count, since the
 * OAuth path does not use the key field. `disabled_providers` still hides
 * anything per install, independently of this.
 */
export const REDROB_ONLY_PROVIDER_IDS: readonly string[] = [REDROB_PROVIDER_ID];

/** True when `id` is the Redrob provider itself (case-insensitive, trimmed). */
export function isRedrobOnlyProviderId(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return false;
  return REDROB_ONLY_PROVIDER_IDS.some((allowed) => allowed.toLowerCase() === normalized);
}

/** What the exposure rule needs to know about one provider. */
export type ProviderExposureFacts = {
  id: string;
  /** Environment variables the provider declares, as the engine reports them. */
  env?: readonly string[];
  /** Whether the engine advertises an OAuth method for it. */
  hasOAuth?: boolean;
  /** Whether it is already connected. */
  connected?: boolean;
};

/**
 * Whether the app should offer this provider. See the comment above
 * REDROB_ONLY_PROVIDER_IDS for why this is a capability test and not a name
 * list.
 */
export function isProviderExposed(facts: ProviderExposureFacts): boolean {
  const id = facts.id.trim();
  if (!id) return false;
  if (isRedrobOnlyProviderId(id)) return true;
  if (facts.connected) return true;
  if (facts.hasOAuth) return true;
  return (facts.env?.length ?? 0) <= 1;
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
      [REDROB_OPUS_MODEL_ID]: {
        name: REDROB_OPUS_MODEL_NAME,
      },
    },
  };
}
