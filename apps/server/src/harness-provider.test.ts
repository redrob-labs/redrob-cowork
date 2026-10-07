/**
 * Tests for the harness provider registration.
 *
 * The important assertions are the two that are security or product boundaries rather
 * than formatting: the package must stay the one the engine trusts, and a runtime that
 * is not installed must not be advertised.
 */
import { describe, expect, test } from "bun:test";
import {
  activeHarnessProviders,
  buildHarnessProviderConfig,
  CLAUDE_CODE_PROVIDER_ID,
  CODEX_PROVIDER_ID,
  isLocalProviderUrl,
  setActiveHarnessShim,
} from "./harness-provider.js";

const shimBaseUrl = "http://127.0.0.1:41234/v1";

describe("buildHarnessProviderConfig", () => {
  test("registers only the runtimes that are installed", () => {
    // Advertising an absent runtime lists a model the user cannot use, and the failure
    // then surfaces deep in a turn as an upstream error rather than as "not installed".
    const both = buildHarnessProviderConfig({ shimBaseUrl, codexAvailable: true, claudeAvailable: true });
    expect(Object.keys(both).sort()).toEqual([CLAUDE_CODE_PROVIDER_ID, CODEX_PROVIDER_ID].sort());

    const onlyCodex = buildHarnessProviderConfig({ shimBaseUrl, codexAvailable: true, claudeAvailable: false });
    expect(Object.keys(onlyCodex)).toEqual([CODEX_PROVIDER_ID]);

    const none = buildHarnessProviderConfig({ shimBaseUrl, codexAvailable: false, claudeAvailable: false });
    expect(none).toEqual({});
  });

  test("uses ONLY the package the engine's gate trusts", () => {
    // A security boundary, not a style choice: any other package reaches the engine's
    // dynamic-plugin installer, which is arbitrary code execution from config. The
    // engine refuses anything else, and so must this.
    for (const provider of Object.values(
      buildHarnessProviderConfig({ shimBaseUrl, codexAvailable: true, claudeAvailable: true }),
    )) {
      expect(provider.npm).toBe("@ai-sdk/openai-compatible");
    }
  });

  test("both providers point at the same shim", () => {
    // One process serving both keeps a single credential-free hop between the engine and
    // two subprocess runtimes; the shim tells them apart by the model prefix.
    const providers = buildHarnessProviderConfig({ shimBaseUrl, codexAvailable: true, claudeAvailable: true });
    expect(providers[CODEX_PROVIDER_ID]?.options.baseURL).toBe(shimBaseUrl);
    expect(providers[CLAUDE_CODE_PROVIDER_ID]?.options.baseURL).toBe(shimBaseUrl);
  });

  test("offers auto rather than a pinned model id", () => {
    // Codex ships roughly every two days; a hardcoded id goes stale while the CLI
    // already resolves its own default.
    const providers = buildHarnessProviderConfig({ shimBaseUrl, codexAvailable: true, claudeAvailable: true });
    expect(Object.keys(providers[CODEX_PROVIDER_ID]!.models!)).toEqual(["auto"]);
    expect(Object.keys(providers[CLAUDE_CODE_PROVIDER_ID]!.models!)).toEqual(["auto"]);
  });

  test("names the vendor in plain text without claiming it as our feature", () => {
    // The only claim Anthropic's trademark guidelines permit without written permission.
    const providers = buildHarnessProviderConfig({ shimBaseUrl, codexAvailable: false, claudeAvailable: true });
    expect(providers[CLAUDE_CODE_PROVIDER_ID]?.name).toBe("Claude Code (your Claude plan)");
  });
});

describe("the active shim registry", () => {
  test("produces no providers when no shim is running", () => {
    // Additive by design: a server started without a shim writes exactly the config it
    // wrote before, so shipping this cannot change an existing install's behaviour.
    setActiveHarnessShim(null);
    expect(activeHarnessProviders()).toEqual({});
  });

  test("produces providers for the registered shim", () => {
    setActiveHarnessShim({ baseUrl: shimBaseUrl, codexAvailable: true, claudeAvailable: false });
    expect(Object.keys(activeHarnessProviders())).toEqual([CODEX_PROVIDER_ID]);
    setActiveHarnessShim(null);
  });

  test("REFUSES a non-local shim URL instead of letting the engine drop it", () => {
    // The engine's own gate rejects a non-local provider URL without telling the app that
    // sent it, so the symptom would be a provider that simply never appears. Failing here
    // names the actual problem.
    expect(() =>
      setActiveHarnessShim({ baseUrl: "https://evil.example.com/v1", codexAvailable: true, claudeAvailable: true }),
    ).toThrow(/must be local/);
    expect(activeHarnessProviders()).toEqual({});
  });
});

describe("isLocalProviderUrl", () => {
  test("accepts loopback and private addresses", () => {
    for (const url of [
      "http://127.0.0.1:41234/v1",
      "http://localhost:3000",
      "http://[::1]:8080",
      "http://192.168.1.5:1234",
      "http://10.0.0.2",
      "http://172.16.0.1",
    ]) {
      expect(isLocalProviderUrl(url)).toBe(true);
    }
  });

  test("refuses a routable host", () => {
    expect(isLocalProviderUrl("https://api.openai.com/v1")).toBe(false);
    expect(isLocalProviderUrl("http://8.8.8.8")).toBe(false);
    // 172.32 is outside the RFC 1918 block, which is the easy off-by-one here.
    expect(isLocalProviderUrl("http://172.32.0.1")).toBe(false);
  });

  test("treats an unparseable URL as NOT local", () => {
    // The failure mode of guessing wrong is pointing a provider at the open internet.
    expect(isLocalProviderUrl("not a url")).toBe(false);
    expect(isLocalProviderUrl("")).toBe(false);
  });
});
