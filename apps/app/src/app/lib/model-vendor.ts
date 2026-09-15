/**
 * Vendor inference for a model id.
 *
 * Redrob is a router: every model it serves is reported under the single
 * `redrob` provider id, so the provider id alone cannot tell a user that
 * `claude-opus-5` is an Anthropic model. The engine's model records carry no
 * vendor field either (`buildRedrobProviderConfig` sets only `name`), so the
 * model id string is the one signal available.
 *
 * Inference is deliberately conservative: an unrecognised id returns `null` and
 * the caller falls back to the provider's own name and logo. Never guess a
 * vendor from a partial match — a wrong vendor logo is a false statement about
 * who runs the model.
 */

export type ModelVendor = {
  /** Provider-family id, chosen to match what `ProviderIcon` can resolve. */
  id: string;
  /** Vendor display name shown to the user. */
  name: string;
};

const ANTHROPIC: ModelVendor = { id: "anthropic", name: "Anthropic" };
const OPENAI: ModelVendor = { id: "openai", name: "OpenAI" };
const GOOGLE: ModelVendor = { id: "google", name: "Google" };
const DEEPSEEK: ModelVendor = { id: "deepseek", name: "DeepSeek" };
const QWEN: ModelVendor = { id: "qwen", name: "Qwen" };
const META: ModelVendor = { id: "meta", name: "Meta" };
const MISTRAL: ModelVendor = { id: "mistral", name: "Mistral" };
const XAI: ModelVendor = { id: "xai", name: "xAI" };
const MOONSHOT: ModelVendor = { id: "moonshot", name: "Moonshot" };
const ZHIPU: ModelVendor = { id: "zhipu", name: "Zhipu" };

/**
 * Prefix table, longest-prefix-wins. Prefixes only: model ids are versioned by
 * suffix (`claude-opus-5`, `gpt-5.2`), so a prefix stays correct across bumps
 * while a full-id table goes stale on every release.
 */
const VENDOR_PREFIXES: ReadonlyArray<readonly [string, ModelVendor]> = [
  ["claude", ANTHROPIC],
  ["gpt", OPENAI],
  ["chatgpt", OPENAI],
  ["codex", OPENAI],
  ["o1", OPENAI],
  ["o3", OPENAI],
  ["o4", OPENAI],
  ["gemini", GOOGLE],
  ["gemma", GOOGLE],
  ["deepseek", DEEPSEEK],
  ["qwen", QWEN],
  ["qwq", QWEN],
  ["llama", META],
  ["mistral", MISTRAL],
  ["mixtral", MISTRAL],
  ["magistral", MISTRAL],
  ["grok", XAI],
  ["kimi", MOONSHOT],
  ["moonshot", MOONSHOT],
  ["glm", ZHIPU],
];

/**
 * Vendor behind a model id, or `null` when the id names no vendor.
 *
 * `auto` returns `null` on purpose: it is Redrob's own router, not a vendor
 * model, so the Redrob mark is the honest icon for it.
 */
export function inferModelVendor(modelID: string): ModelVendor | null {
  const normalized = modelID.trim().toLowerCase();
  if (!normalized) return null;

  // Strip a leading provider segment ("redrob/claude-opus-5", "anthropic:claude-…").
  const bare = normalized.split(/[/:]/).filter(Boolean).at(-1) ?? normalized;

  let match: { prefix: string; vendor: ModelVendor } | null = null;
  for (const [prefix, vendor] of VENDOR_PREFIXES) {
    if (bare !== prefix && !bare.startsWith(`${prefix}-`) && !bare.startsWith(`${prefix}.`) && !bare.startsWith(`${prefix}_`)) {
      continue;
    }
    if (!match || prefix.length > match.prefix.length) {
      match = { prefix, vendor };
    }
  }

  return match?.vendor ?? null;
}
