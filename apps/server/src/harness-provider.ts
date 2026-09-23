/**
 * Register the harness shim with the engine as a local provider.
 *
 * The engine's config layer admits a new provider only when the package is exactly
 * `@ai-sdk/openai-compatible` and the URL is on this machine
 * (`packages/core/src/config/plugin/local-provider.ts`). That door was opened for
 * Ollama, LM Studio and vLLM; the shim meets the same bar, so registering it needs no
 * new engine machinery — which is the whole reason the shim exists as an HTTP server
 * rather than as code inside the engine.
 *
 * This produces the provider entry; writing it is the runtime-config layer's job
 * (`redrob-runtime-config.ts`), same as the Redrob provider.
 */

/** Provider ids the engine will see. Models are then `codex/<model>`, `claude-code/<model>`. */
export const CODEX_PROVIDER_ID = "codex";
export const CLAUDE_CODE_PROVIDER_ID = "claude-code";

export type ProviderConfig = {
  npm: string;
  name: string;
  options: { baseURL: string };
  models?: Record<string, { name: string }>;
};

/**
 * The one package the engine's local-provider gate accepts. Anything else keeps the
 * engine's refusal to install an arbitrary npm package from config, which is an
 * arbitrary-code-execution path — so this constant is a security boundary, not a
 * convenience.
 */
const LOCAL_PROVIDER_PACKAGE = "@ai-sdk/openai-compatible";

/**
 * Provider entries for whichever runtimes are actually present.
 *
 * A runtime that is not installed gets NO entry. Registering it anyway would list a
 * model the user cannot use, and the failure would surface deep in a turn as an
 * upstream error rather than as "Codex is not installed" where they can act on it.
 *
 * Both providers point at the SAME shim URL and are told apart by the model prefix the
 * shim parses. One process serving both is what keeps a single credential-free hop
 * between the engine and two subprocess runtimes.
 */
export function buildHarnessProviderConfig(input: {
  /** The shim's base URL, e.g. http://127.0.0.1:41234/v1 */
  shimBaseUrl: string;
  codexAvailable: boolean;
  claudeAvailable: boolean;
}): Record<string, ProviderConfig> {
  const providers: Record<string, ProviderConfig> = {};

  if (input.codexAvailable) {
    providers[CODEX_PROVIDER_ID] = {
      npm: LOCAL_PROVIDER_PACKAGE,
      name: "Codex (your ChatGPT plan)",
      options: { baseURL: input.shimBaseUrl },
      // `auto` rather than a pinned model id: Codex releases roughly every two days and
      // a hardcoded id goes stale, while the CLI already resolves its own default.
      models: { auto: { name: "Codex" } },
    };
  }

  if (input.claudeAvailable) {
    providers[CLAUDE_CODE_PROVIDER_ID] = {
      npm: LOCAL_PROVIDER_PACKAGE,
      // Plain text, no logo, and the vendor name is not part of a feature name of ours:
      // that is the only claim Anthropic's trademark guidelines permit without written
      // permission.
      name: "Claude Code (your Claude plan)",
      options: { baseURL: input.shimBaseUrl },
      models: { auto: { name: "Claude Code" } },
    };
  }

  return providers;
}

/**
 * The shim running in THIS process, if any.
 *
 * A module-level registry rather than a parameter threaded through
 * `writeRedrobRuntimeConfigFile`, which has three call sites and is also used by tests.
 * It models something real: there is at most one shim per server process, and the
 * runtime-config writer needs to know its URL without every caller having to carry it.
 *
 * Explicit setter and getter so a test can install and clear it, and so "no shim" is a
 * state you can assert rather than an accident of import order.
 */
let activeShim: { baseUrl: string; codexAvailable: boolean; claudeAvailable: boolean } | null = null;

export function setActiveHarnessShim(
  shim: { baseUrl: string; codexAvailable: boolean; claudeAvailable: boolean } | null,
): void {
  // Refuse a non-local URL here rather than letting the engine drop it silently: the
  // engine's own gate rejects it without telling the app that sent it, so the symptom
  // would be a provider that simply never appears.
  if (shim && !isLocalProviderUrl(shim.baseUrl)) {
    throw new Error(`harness shim URL must be local, got ${shim.baseUrl}`);
  }
  activeShim = shim;
}

export function activeHarnessShim(): typeof activeShim {
  return activeShim;
}

/**
 * Provider entries for the shim running in this process, or an empty object.
 *
 * This is what the runtime-config writer calls. Empty when no shim is running, so a
 * server started without one produces exactly the config it produced before — the
 * feature is additive and cannot change an existing install's behaviour by being present
 * in the build.
 */
export function activeHarnessProviders(): Record<string, ProviderConfig> {
  if (!activeShim) return {};
  return buildHarnessProviderConfig({
    shimBaseUrl: activeShim.baseUrl,
    codexAvailable: activeShim.codexAvailable,
    claudeAvailable: activeShim.claudeAvailable,
  });
}

/**
 * Whether a URL would pass the engine's local-provider gate.
 *
 * Mirrored here so a misconfiguration is caught where it is introduced rather than
 * being silently dropped by the engine, which refuses a non-local URL without
 * explaining itself to the app that sent it. Deliberately conservative: anything
 * unparseable is NOT local, because the failure mode of guessing wrong is pointing a
 * provider at the open internet.
 */
export function isLocalProviderUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "0.0.0.0" || host === "::") return true;

  const ipv4 = host.split(".");
  if (ipv4.length === 4 && ipv4.every((part) => /^\d{1,3}$/.test(part))) {
    const [a, b] = ipv4.map(Number);
    if (a === 127 || a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  const bare = host.replace(/^\[|\]$/g, "");
  if (/^f[cd][0-9a-f]{2}:/.test(bare) || /^fe[89ab][0-9a-f]:/.test(bare)) return true;
  return false;
}
