import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";
import * as localeBundles from "../src/i18n/locales";
import { isLanguage, LANGUAGES, LANGUAGE_OPTIONS } from "../src/i18n";

/**
 * Product localization is narrowed to English and Korean. These assertions lock
 * that down at every layer a new locale could sneak in: the registry, the UI
 * options list, the bundle barrel, and the locales directory itself. They also
 * check the Korean bundle has no keys English lacks, so a translated key can
 * never outlive the English source it falls back to.
 */
const SUPPORTED_LOCALES = ["en", "ko"] as const;
const LOCALES_DIR = join(import.meta.dir, "..", "src", "i18n", "locales");

describe("supported locales", () => {
  test("the language registry is exactly en, ko", () => {
    expect(LANGUAGES).toEqual([...SUPPORTED_LOCALES]);
    expect(LANGUAGE_OPTIONS.map((option) => option.value)).toEqual([...SUPPORTED_LOCALES]);
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("ko")).toBe(true);
    for (const unsupported of ["ja", "zh", "hi", "es", "en-US", "", "auto"]) {
      expect(isLanguage(unsupported)).toBe(false);
    }
  });

  test("only the supported locale bundles exist and are exported", () => {
    const bundleFiles = readdirSync(LOCALES_DIR)
      .filter((name) => name.endsWith(".ts") && name !== "index.ts")
      .map((name) => name.replace(/\.ts$/, ""))
      .sort();
    expect(bundleFiles).toEqual([...SUPPORTED_LOCALES]);
    expect(Object.keys(localeBundles).sort()).toEqual([...SUPPORTED_LOCALES]);
  });

  test("Korean has exact key parity with English: no orphans, no gaps", () => {
    // Korean has no grammatical plural, so a Korean bundle carries the bare key
    // where English carries `_one` / `_other` variants. Both shapes count as
    // present: `t()` resolves the bare key last for exactly this reason.
    const englishKeys = new Set(Object.keys(en));
    const englishPluralBases = new Set(
      Object.keys(en)
        .filter((key) => /_(zero|one|two|few|many|other)$/.test(key))
        .map((key) => key.replace(/_(zero|one|two|few|many|other)$/, "")),
    );
    // Every English key reduces to a "logical" key: the bare key, or the
    // shared base of a plural family. Korean must have exactly this set,
    // nothing more and nothing less: `ko.ts` is a complete translation,
    // never an overlay that silently falls back to English at runtime.
    const englishLogicalKeys = new Set(
      Object.keys(en).map((key) => key.replace(/_(zero|one|two|few|many|other)$/, "")),
    );

    expect(englishKeys.size).toBeGreaterThan(0);
    expect(Object.keys(ko).length).toBeGreaterThan(0);

    const orphans = Object.keys(ko).filter(
      (key) => !englishKeys.has(key) && !englishPluralBases.has(key),
    );
    expect(orphans).toEqual([]);

    const missing = [...englishLogicalKeys].filter((key) => !(key in ko));
    expect(missing).toEqual([]);

    expect(Object.keys(ko).length).toBe(englishLogicalKeys.size);
  });

  test("Korean values contain no leftover English-only prose", () => {
    // A residual-English guard for the *values*, not the keys: after the
    // permitted tokens are stripped (product/brand names, code, URLs, env
    // vars, interpolation placeholders, file paths, technical acronyms), a
    // Korean string should have no unaccounted-for English letters.
    // This does not run on en.ts (which is English), nor on developer-facing
    // strings outside i18n dictionaries (a separate guard covers those).
    const allowedTokens = [
      // Brand / product identifiers kept as-is in Korean copy.
      /Redrob Work( Connect| Cloud| UI Control)?/g,
      /Redrob Code/g,
      /Redrob(?!\p{L})/gu,
      /OpenCode/g,
      // Literal CLI command example shown verbatim in copy. Must run before
      // the generic interpolation-placeholder strip below, since that strip
      // would otherwise delete "{server}" and break this exact match.
      /\bopencode mcp auth \{server\}/g,
      // Interpolation placeholders like {count}, {server}, {resetWord}.
      /\{[a-zA-Z][a-zA-Z0-9]*\}/g,
      // Technical acronyms / protocol and format names.
      /\b(MCP|API|OAuth|URL|URLs|CLI|JSON|PID|LAN|mDNS|SDK|CSV|SSH|HTTP|HTTPS|ID|IDs|PATH|AI|UI|OS|LLM|ms)\b/g,
      // Example npm package name quoted verbatim as a plugin example. Must
      // run before the generic lowercase "opencode" strip below, since that
      // strip would otherwise consume "opencode" and leave a stray "-wakatime".
      /opencode-wakatime/g,
      // Third-party product / proper nouns that stay in Latin script.
      /\b(Docker|Slack|GitHub|Linear|Notion|Sentry|Stripe|Context7|OpenAI|ChatGPT|macOS|Finder|Exa|Chromium|Bun|Claude Code|Claude Cowork|Claude|Gemini|Perplexity|Google|Bing|DuckDuckGo|LinkedIn|YouTube|Reddit|X|AppImage|Mac|Electron|Tauri|Ollama|Realtime|microsandbox|opencode)\b/g,
      // Example folder path shown as a literal placeholder.
      /\/workspace\/my-project/g,
      // The stdio wrapper's literal command name, matched before the generic
      // "redrob" rules below so it is not broken into stray fragments.
      /redrob-ui-mcp/g,
      // ollama.com/library and other bare-domain mentions used as literal examples.
      /ollama\.com\/library/g,
      // Technical file/format suffixes and DB/JSON/config words that appear as
      // part of an otherwise-Korean sentence describing a technical artifact.
      /\b(DB|JSON|config|json|jsonc|sha256|sha512|sha|zip|exe|yml|latest-mac)\b/g,
      // The console domain, matched before the generic lowercase-redrob path
      // fragment rule below (which would otherwise eat the "redrob" out of
      // "console.redrob.ai" and leave "console"/"ai" behind as stray words).
      /console\.redrob\.ai/g,
      // Lowercase "redrob" appearing inside a literal path/prefix fragment
      // like ".opencode/redrob)" or "redrob.json", not the brand name proper.
      /\bredrob(?=[./)])/g,
      // env var name fragments that survive after the full-name pattern strips
      // (e.g. "OPENAI" left over once "OPENAI_API_KEY" already matched once
      // but a second literal mention like "OPENAI_REALTIME_API_KEY" needs its
      // own pieces covered too).
      /\b(OPENAI_REALTIME_API_KEY|OPENAI_API_KEY|OPENAI|API|KEY|REALTIME)\b/g,
      // API key format placeholder prefix.
      /\bsk-\.\.\.\b/g,
      /\bsk\b/g,
      // Windows/macOS artifact bundle name fragments.
      /\bapp\.migrate-bak\b/g,
      // Literal confirmation words the user must type verbatim.
      /\b(NUKE|RESET)\b/g,
      // Env var / reserved key prefixes and known env var names.
      /\b(REDROB_API_KEY|REDROB_|OPENCODE_|ANTHROPIC_API_KEY|GOOGLE_API_KEY|ELEVENLABS_API_KEY|GITHUB_TOKEN)\w*/g,
      // Deep link schemes, domains, and example commands/URLs that must stay literal.
      /redrob(-dev)?:\/\/\S*/g,
      /https?:\/\/\S+/g,
      /console\.redrob\.ai/g,
      // Literal slash-command names shown verbatim in copy.
      /\/compact\b/g,
      /\/command\b/g,
      /ssh -L \S+ user@host/g,
      /npx -y @modelcontextprotocol\/\S+/g,
      /github-copilot/g,
      /compaction\.auto/g,
      /opencode\.jsonc?/g,
      /opencode-wakatime/g,
      /SKILL\.md/g,
      /\.opencode\/redrob/g,
      /redrob-dev-data/g,
      /localhost:19876/g,
      /\.csv\b/g,
      /\.log\b/g,
      // Standard Unix stream names and OAuth's literal "code" query parameter.
      /\b(stderr|stdout|code)\b/g,
      // Keyboard key names in shortcut hints.
      /\b(Escape|Enter|Esc)\b/g,
      // Literal example input quoted in onboarding/tool-description copy.
      /\bhello\b/g,
      /npm(?!\.)/g,
      // v-prefixed semantic version placeholders left after {version} strip.
      /\bv\{version\}/g,
    ];

    const englishWordPattern = /[A-Za-z]{2,}/g;
    const violations: string[] = [];

    for (const [key, value] of Object.entries(ko)) {
      let stripped = value;
      for (const pattern of allowedTokens) {
        stripped = stripped.replace(pattern, " ");
      }
      const leftoverWords = stripped.match(englishWordPattern) ?? [];
      if (leftoverWords.length > 0) {
        violations.push(`${key}: ${leftoverWords.join(", ")}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
