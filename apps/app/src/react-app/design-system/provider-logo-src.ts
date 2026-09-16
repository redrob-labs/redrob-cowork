/**
 * Brand logo candidates for an LLM provider, tried in order and advanced on
 * `img` onError. Providers should almost always show their real logo, so the
 * monogram in `ProviderIcon` is the last resort rather than the default look.
 */

/** Providers whose Simple Icons slug differs from their OpenCode provider id. */
const SIMPLE_ICON_SLUGS: Record<string, string> = {
  google: "googlegemini",
  "google-vertex": "googlegemini",
  "google-vertex-anthropic": "googlegemini",
  gemini: "googlegemini",
  mistral: "mistralai",
  huggingface: "huggingface",
  xai: "x",
  azure: "microsoftazure",
  bedrock: "amazonwebservices",
  "amazon-bedrock": "amazonwebservices",
  vercel: "vercel",
  llama: "meta",
  meta: "meta",
  // The hyphenated ids. Two reasons they are here rather than left to the favicon step: the Simple
  // Icons gate below only accepts `[a-z0-9]+`, so a hyphenated id can never reach it on its own, and
  // these are all products of a company Simple Icons already carries. That yields the real monochrome
  // mark instead of a favicon bitmap -- and a favicon miss is not even visible as a miss, because the
  // service answers an unknown host with HTTP 200 and a generic globe.
  "cloudflare-ai-gateway": "cloudflare",
  "cloudflare-workers-ai": "cloudflare",
  "github-copilot": "github",
  "snowflake-cortex": "snowflake",
  "google-generative-ai": "googlegemini",
  "azure-openai": "microsoftazure",
  digitalocean: "digitalocean",
  gitlab: "gitlab",
  openrouter: "openrouter",
};

/** Simple Icons has no icon for these, so skip straight to the favicon step. */
const SIMPLE_ICON_MISSES = new Set([
  "openai",
  "azure",
  "microsoftazure",
  "groq",
  "cohere",
  "together",
  "togetherai",
  "bedrock",
  "amazon-bedrock",
  "amazonwebservices",
  "fireworks",
  "opencode",
  "redrob",
  "redrob",
]);

/** Apex domains for providers whose id does not resolve to their own domain. */
const PROVIDER_DOMAINS: Record<string, string> = {
  openai: "openai.com",
  anthropic: "anthropic.com",
  google: "ai.google",
  "google-vertex": "cloud.google.com",
  "google-vertex-anthropic": "cloud.google.com",
  azure: "azure.microsoft.com",
  bedrock: "aws.amazon.com",
  "amazon-bedrock": "aws.amazon.com",
  groq: "groq.com",
  cohere: "cohere.com",
  together: "together.ai",
  togetherai: "together.ai",
  fireworks: "fireworks.ai",
  mistral: "mistral.ai",
  deepseek: "deepseek.com",
  openrouter: "openrouter.ai",
  perplexity: "perplexity.ai",
  huggingface: "huggingface.co",
  ollama: "ollama.com",
  xai: "x.ai",
  opencode: "opencode.ai",
  redrob: "redrob.io",
  abacus: "abacus.ai",
  // Hyphenated ids, which the slug heuristic below deliberately refuses to guess at. Without these
  // they reached the favicon service as invented hostnames ("cloudflare-ai.gateway",
  // "github.copilot") and came back as a generic globe.
  "cloudflare-ai-gateway": "cloudflare.com",
  "cloudflare-workers-ai": "cloudflare.com",
  "github-copilot": "github.com",
  "snowflake-cortex": "snowflake.com",
  "google-generative-ai": "ai.google",
  "azure-openai": "azure.microsoft.com",
  poe: "poe.com",
  digitalocean: "digitalocean.com",
  gitlab: "gitlab.com",
  vercel: "vercel.com",
  cerebras: "cerebras.ai",
  nebius: "nebius.com",
  venice: "venice.ai",
  requesty: "requesty.ai",
  llama: "llama.com",
  upstage: "upstage.ai",
  zhipuai: "z.ai",
  moonshotai: "moonshot.ai",
  morph: "morphllm.com",
  inference: "inference.net",
  chutes: "chutes.ai",
  /**
   * The vendors that actually appear in the catalogue, counted from the live listing rather than
   * guessed: 48 of them across the 315 `vendor/model` ids. Listed here because the vendor is now what
   * a logo lookup is given, and a vendor with no entry and no Simple Icons slug falls to a monogram.
   *
   * Ordered by how many models each one serves, so the ones a reader meets most are the ones covered.
   */
  qwen: "qwen.ai",
  "z-ai": "z.ai",
  "meta-llama": "llama.com",
  minimax: "minimaxi.com",
  tencent: "cloud.tencent.com",
  "bytedance-seed": "seed.bytedance.com",
  bytedance: "bytedance.com",
  "x-ai": "x.ai",
  amazon: "aws.amazon.com",
  nvidia: "nvidia.com",
  "aion-labs": "aionlabs.ai",
  sakana: "sakana.ai",
  inclusionai: "inclusionai.github.io",
  nousresearch: "nousresearch.com",
  "ibm-granite": "ibm.com",
  "inference-net": "inference.net",
  inception: "inceptionlabs.ai",
  poolside: "poolside.ai",
  microsoft: "microsoft.com",
  rekaai: "reka.ai",
  stepfun: "stepfun.com",
  xiaomi: "xiaomi.com",
  thinkingmachines: "thinkingmachines.ai",
  relace: "relace.ai",
  perceptron: "perceptron.inc",
  mistralai: "mistral.ai",
};

/**
 * The suffixes `domainFromSlug` is allowed to read as a TLD.
 *
 * It has to be a list. The old rule accepted ANY trailing word, so `cloudflare-ai-gateway` unslugged
 * to `cloudflare-ai.gateway` and `github-copilot` to `github.copilot` -- hostnames that do not exist.
 * That is not a harmless miss, because of the next paragraph.
 */
const KNOWN_TLDS = new Set([
  "ai",
  "app",
  "cloud",
  "co",
  "com",
  "dev",
  "io",
  "net",
  "org",
  "run",
  "sh",
  "tech",
  "xyz",
]);

/**
 * Long-tail catalog ids that really are slugified domains ("abliteration-ai", "302ai"), unslugged so
 * they recover a real favicon instead of a monogram.
 *
 * Only a suffix in `KNOWN_TLDS` counts. This matters more than it looks: the favicon service answers
 * an unresolvable domain with HTTP 200 and a GENERIC GLOBE, not an error, so a guessed hostname does
 * not fall through to the next candidate or to the monogram -- it renders as a wrong icon that looks
 * deliberate. A guess we cannot stand behind is therefore worse than no guess, and no guess reaches
 * the monogram, which at least says which provider it is.
 */
function domainFromSlug(id: string): string | undefined {
  const dashed = id.match(/^(.+)-([a-z]{2,})$/);
  if (dashed && KNOWN_TLDS.has(dashed[2]!)) return `${dashed[1]}.${dashed[2]}`;
  const numeric = id.match(/^(\d+)(ai|com)$/);
  if (numeric) return `${numeric[1]}.${numeric[2]}`;
  return undefined;
}

function apexDomain(hostname: string) {
  const labels = hostname.split(".").filter(Boolean);
  return labels.length < 2 ? labels.join(".") : labels.slice(-2).join(".");
}

function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
}

/**
 * The vendor part of an id, which is what a logo lookup can actually answer.
 *
 * 315 of the catalogue's 323 ids are `vendor/model` - `anthropic/claude-opus-4`,
 * `mistralai/mistral-large`, `qwen/qwen3-32b`. Every lookup below was fed the WHOLE id, and none of
 * them can match one: the Simple Icons gate accepts `[a-z0-9]+` and a slash fails it, the domain map
 * is keyed on bare vendor names, and `domainFromSlug` splits on hyphens and has no notion of a slash.
 * So the entire long tail - the great majority of the catalogue - fell through to a monogram or worse.
 *
 * Taking the part before the first slash fixes all of them at once, because that part IS the vendor
 * and the vendors are exactly what the tables below already know. An id with no slash is returned
 * unchanged, so nothing that worked before changes.
 *
 * A trailing variant suffix is dropped too: `anthropic/claude-opus-4:beta` and `:free` are the same
 * vendor as the model without them.
 */
function vendorOf(id: string): string {
  const slash = id.indexOf('/');
  const head = slash > 0 ? id.slice(0, slash) : id;
  const colon = head.indexOf(':');
  return colon > 0 ? head.slice(0, colon) : head;
}

/**
 * Marks whose BRAND colour is at or near black, so they vanish on a dark background.
 *
 * Simple Icons' CDN serves each mark in its own brand colour, which is right for the 17 coloured
 * vendors and wrong for these six: GitHub is #181717, X is #000000, and an `<img>` cannot be recoloured
 * by `currentColor` the way the inline marks are. On the provider connect page in dark mode they were
 * black on near-black and simply not there.
 *
 * The set was computed rather than guessed: every slug this file can actually put on the CDN path was
 * checked against Simple Icons' own colour data and scored by relative luminance. These six are the
 * ones below 60; the next darkest, Meta at #0467DF, is 90.6 and reads fine. `anthropic` is on the list
 * even though `ProviderIcon` currently intercepts it with an inline `currentColor` mark, so removing
 * that inline mark cannot silently reintroduce the bug.
 *
 * Keyed by SLUG, not by provider id, because several ids share one slug.
 */
export const DARK_BRAND_MARKS = new Set([
  'anthropic',
  'github',
  'moonshotai',
  'ollama',
  'vercel',
  'x',
]);

/** The Simple Icons slug this provider id resolves to, or null when it never reaches that CDN. */
export function simpleIconSlug(providerId?: string | null): string | null {
  const id = vendorOf(providerId?.trim().toLowerCase() ?? '');
  if (!id) return null;
  const slug = SIMPLE_ICON_SLUGS[id] ?? id;
  if (SIMPLE_ICON_MISSES.has(slug) || !/^[a-z0-9]+$/.test(slug)) return null;
  return slug;
}

/**
 * Whether this provider's mark needs lightening on a dark background.
 *
 * Only the Simple Icons path can be affected. A favicon is a full-colour bitmap that carries its own
 * background, and the monogram fallback is themed already, so neither is touched.
 */
export function needsDarkModeLift(providerId?: string | null): boolean {
  const slug = simpleIconSlug(providerId);
  return slug !== null && DARK_BRAND_MARKS.has(slug);
}

/**
 * Ordered logo URLs for a provider. An id that already looks like a domain
 * ("302.ai") or a configured base URL both resolve through the favicon step,
 * which is what gives long-tail and custom providers a real mark.
 */
export function providerLogoCandidates(input: {
  providerId?: string | null;
  baseUrl?: string | null;
}): string[] {
  const id = vendorOf(input.providerId?.trim().toLowerCase() ?? '');
  const candidates: string[] = [];

  if (id) {
    const slug = simpleIconSlug(id);
    if (slug) {
      candidates.push(`https://cdn.simpleicons.org/${slug}`);
    }

    const mapped = PROVIDER_DOMAINS[id] ?? (id.includes(".") ? apexDomain(id) : domainFromSlug(id));
    if (mapped) {
      candidates.push(faviconUrl(mapped));
    }
  }

  const baseUrl = input.baseUrl?.trim();
  if (baseUrl?.match(/^https?:\/\//i)) {
    try {
      candidates.push(faviconUrl(apexDomain(new URL(baseUrl).hostname)));
    } catch {
      // Ignore unparseable base URLs — the monogram still covers this provider.
    }
  }

  return [...new Set(candidates)];
}
