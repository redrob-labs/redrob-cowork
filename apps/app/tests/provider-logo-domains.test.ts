import { describe, expect, it } from "bun:test";

import { providerLogoCandidates } from "@/react-app/design-system/provider-logo-src";

/**
 * Which hostnames a provider row is allowed to ask a favicon service for.
 *
 * A user reported generic globes beside Cloudflare AI Gateway, Cloudflare Workers AI and GitHub
 * Copilot. The fallback is not a globe - the code falls back to a grey monogram - and it was never
 * reached, because the favicon service answers an unresolvable domain with HTTP 200 and a generic
 * globe rather than an error. `onError` never fires, so a bad guess renders as a wrong icon that looks
 * deliberate and nothing downstream can correct it.
 *
 * The bad guesses came from unslugging an id at its LAST hyphen with no check on the suffix:
 * `cloudflare-ai-gateway` became `cloudflare-ai.gateway`, `github-copilot` became `github.copilot`.
 * Neither host exists. So the suffix must be a real TLD, and ids we know are given their real domain
 * outright.
 */
describe("provider logos never ask for a hostname we invented", () => {
  const hostsFor = (providerId: string) =>
    providerLogoCandidates({ providerId })
      .map((url) => {
        const match = url.match(/[?&]domain=([^&]+)/);
        return match ? decodeURIComponent(match[1]!) : null;
      })
      .filter((value): value is string => value !== null);

  it("resolves the long tail's vendor/model ids, which is most of the catalogue", () => {
    // 315 of the catalogue's 323 ids carry a slash. Every lookup was fed the whole id and none could
    // match one: the Simple Icons gate accepts [a-z0-9]+ and a slash fails it, the domain map is keyed
    // on bare vendor names, and the slug heuristic knows only hyphens. So the majority of the catalogue
    // showed no brand mark at all.
    expect(hostsFor("anthropic/claude-opus-4")).toContain("anthropic.com");
    expect(hostsFor("mistralai/mistral-large")).toContain("mistral.ai");
    expect(hostsFor("deepseek/deepseek-chat")).toContain("deepseek.com");
    expect(hostsFor("openai/gpt-5-nano")).toContain("openai.com");
  });

  it("ignores a variant suffix, which names the same vendor", () => {
    expect(hostsFor("anthropic/claude-opus-4:beta")).toContain("anthropic.com");
    expect(hostsFor("anthropic:free")).toContain("anthropic.com");
  });

  it("leaves a slashless id exactly as it was", () => {
    expect(hostsFor("azure")).toContain("azure.microsoft.com");
    expect(hostsFor("github-copilot")).toContain("github.com");
  });

  it("gives the hyphenated ids their real domains", () => {
    expect(hostsFor("cloudflare-ai-gateway")).toContain("cloudflare.com");
    expect(hostsFor("cloudflare-workers-ai")).toContain("cloudflare.com");
    expect(hostsFor("github-copilot")).toContain("github.com");
    expect(hostsFor("snowflake-cortex")).toContain("snowflake.com");
  });

  it("never asks for the invented hosts that produced the globes", () => {
    expect(hostsFor("cloudflare-ai-gateway")).not.toContain("cloudflare-ai.gateway");
    expect(hostsFor("github-copilot")).not.toContain("github.copilot");
  });

  it("still unslugs an id whose suffix really is a TLD", () => {
    // This is what the heuristic was for, and it has to keep working: long-tail catalogue ids are
    // slugified domains.
    expect(hostsFor("abliteration-ai")).toContain("abliteration.ai");
  });

  it("refuses to unslug a suffix that is not a TLD", () => {
    const hosts = hostsFor("some-vendor-gateway");
    expect(hosts.includes("some-vendor.gateway")).toBe(false);
  });
});
