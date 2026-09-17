import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";
import * as localeBundles from "../src/i18n/locales";
import { isLanguage, LANGUAGES, LANGUAGE_OPTIONS, t } from "../src/i18n";

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

  test("every plural family renders the Korean translation, not the English variant", () => {
    // Korean defines the bare key where English defines `_one` / `_other`. The
    // resolver must reach that bare key instead of matching English's `_other`,
    // otherwise every counted string in the app renders English to a Korean user.
    const pluralBases = [
      ...new Set(
        Object.keys(en)
          .filter((key) => /_(zero|one|two|few|many|other)$/.test(key))
          .map((key) => key.replace(/_(zero|one|two|few|many|other)$/, "")),
      ),
    ].sort();

    expect(pluralBases.length).toBeGreaterThan(10);

    const leaked: string[] = [];
    for (const base of pluralBases) {
      for (const count of [0, 1, 3]) {
        const rendered = t(base, { count, lng: "ko" });
        const expected = (ko as Record<string, string>)[base].replace("{count}", String(count));
        if (rendered !== expected) leaked.push(`${base} (count ${count}): ${rendered}`);
      }
    }

    expect(leaked).toEqual([]);
  });

  test("an untranslated plural key still falls back to the English variant", () => {
    // The locale-first rule must not disable the English fallback for a key
    // Korean genuinely lacks.
    expect(t("account.mcp_connected", { count: 1, lng: "en" })).toBe("1 MCP server");
    expect(t("account.mcp_connected", { count: 3, lng: "en" })).toBe("3 MCP servers");
  });

  test("no user-facing string uses an em dash", () => {
    const offenders = [...Object.entries(en), ...Object.entries(ko)]
      .filter(([, value]) => value.includes("—"))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  test("Korean prose names the product 레드롭 코워크", () => {
    // "Redrob Cowork" stays in Latin script only where it names a technical
    // component the user also meets in logs, paths, and config. Anywhere else
    // the product is 레드롭 코워크, so the bundle cannot drift back to a mix.
    //
    // "브라우저" is deliberately NOT here. The in-app browser is a product
    // surface the user looks at, not a token they read in a log line, and
    // allowing it is what let "Redrob Cowork 브라우저는 ... 레드롭 코워크에서
    // 지원하는" ship with both forms in one sentence.
    const COMPONENT_SUFFIXES = [
      "서버",
      "워커",
      "호스트",
      "토큰",
      "런타임",
      "UI",
      "Connect",
      "Code",
      // The default workspace directory really is named "Redrob Cowork" on disk,
      // so onboarding copy naming it is a path the user meets in Finder and
      // Explorer, not product prose.
      "폴더",
    ];
    const componentUse = new RegExp(
      `Redrob Cowork(?: (?:${COMPONENT_SUFFIXES.join("|")})|/OpenCode|\\.app\\.migrate-bak)`,
      "g",
    );

    const offenders: string[] = [];
    for (const [key, value] of Object.entries(ko)) {
      if (value.replace(componentUse, " ").includes("Redrob Cowork")) offenders.push(key);
    }
    expect(offenders).toEqual([]);

    // And the localized name is actually in use, so the rule is not vacuous.
    expect(Object.values(ko).filter((value) => value.includes("레드롭 코워크")).length)
      .toBeGreaterThan(50);
  });

  test("no single Korean string mixes 레드롭 코워크 with Latin Redrob Cowork", () => {
    // The rule above checks each Latin occurrence on its own, so a value could
    // satisfy it and still switch scripts mid-sentence -- which is exactly what
    // a user noticed: "Redrob Cowork 브라우저는 ... 레드롭 코워크에서 지원하는".
    // Within one string, pick one form.
    const offenders = Object.entries(ko)
      .filter(([, value]) => value.includes("레드롭 코워크") && value.includes("Redrob Cowork"))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  test("a Korean particle after a placeholder uses the dual form", () => {
    // The interpolated value's final sound is unknown at build time, so a fixed
    // particle is wrong about half the time. Korean convention writes both.
    const DUAL_FORMS = ["을(를)", "를(을)", "은(는)", "는(은)", "이(가)", "가(이)", "과(와)", "와(과)"];
    const offenders: string[] = [];

    for (const [key, value] of Object.entries(ko)) {
      for (const match of value.matchAll(/\{[a-zA-Z][a-zA-Z0-9]*\}([을를은는이가와과]|으로|로)/g)) {
        const tail = value.slice(match.index + match[0].length - 1);
        if (DUAL_FORMS.some((form) => tail.startsWith(form))) continue;
        // Instrumental 로 / 으로 is chosen by the same rule; flag a bare one too.
        offenders.push(`${key}: ${match[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("Korean values contain no leftover English-only prose", () => {
    // A residual-English guard for the *values*, not the keys: after the
    // permitted tokens are stripped (product/brand names, code, URLs, env
    // vars, interpolation placeholders, file paths, technical acronyms), a
    // Korean string should have no unaccounted-for English letters.
    // This does not run on en.ts (which is English), nor on developer-facing
    // strings outside i18n dictionaries (a separate guard covers those).
    const allowedTokens = [
      // Brand / product identifiers kept as-is in Korean copy. There is no
      // hosted "Redrob Cowork Cloud" product, so that suffix is deliberately
      // absent: `no-hosted-cloud-product-copy.test.ts` keeps it out entirely.
      /Redrob Cowork( Connect| UI Control)?/g,
      /Redrob Code/g,
      /**
       * Korean attaches its particles straight onto the brand name, with no space, which the
       * bare-brand rule below cannot see past: in "Redrob로 연결" the character after "Redrob" is a
       * letter, so the lookahead fails and the brand reads as leftover English. Matched here so the
       * primary connect call to action can carry the particle it needs.
       */
      /Redrob(?=[로은는을를의와과에서])/g,
      /Redrob(?!\p{L})/gu,
      /OpenCode/g,
      // Literal CLI command example shown verbatim in copy. Must run before
      // the generic interpolation-placeholder strip below, since that strip
      // would otherwise delete "{server}" and break this exact match. The
      // engine's binary is `redrob` (see electron/sidecar-names.mjs), so the
      // command shown to users is `redrob mcp auth`, not `opencode mcp auth`.
      /\bredrob mcp auth \{server\}/g,
      // Interpolation placeholders like {count}, {server}, {resetWord}.
      /\{[a-zA-Z][a-zA-Z0-9]*\}/g,
      // Anything the copy itself marks up as code with backticks. This is the
      // author's own signal that the span is a literal -- a path, a field name,
      // a URL scheme -- rather than prose, so honour it instead of growing a
      // word list. Runs early: the spans inside are exempt from every rule
      // below, which is the point.
      /`[^`]+`/g,
      // Technical acronyms / protocol and format names.
      /\b(MCP|API|OAuth|URL|URLs|CLI|JSON|PID|LAN|mDNS|SDK|CSV|SSH|HTTP|HTTPS|ID|IDs|PATH|AI|UI|OS|LLM|ms|HTML|PDF)\b/g,
      // Field names quoted verbatim from a config file or an API contract, so
      // the message names the thing the user has to go and fix. Kept as an
      // explicit list rather than allowing bare "name"/"version" everywhere.
      /\b(server_name|workspaceId|eval)\b/g,
      // The support address, matched as a whole so the generic word rules do
      // not tear "team" and "io" out of it and report them as leftover English.
      /team@redrob\.io/g,
      // Subscription tier names for a third-party account, which the user has
      // to recognize verbatim on the provider's own site.
      /ChatGPT (Pro|Plus)(\/(Pro|Plus))?/g,
      // The local Ollama endpoint, shown as a literal address. Matched whole so
      // no "localhost" fragment is left behind.
      /https?:\/\/localhost:\d+/g,
      // Example npm package name quoted verbatim as a plugin example. Must
      // run before the generic lowercase "opencode" strip below, since that
      // strip would otherwise consume "opencode" and leave a stray "-wakatime".
      /opencode-wakatime/g,
      // Third-party product / proper nouns that stay in Latin script.
      /\b(Docker Desktop|Docker|Slack|GitHub|Linear|Notion|Sentry|Stripe|Context7|Anthropic|OpenAI|ChatGPT|macOS|Finder|Exa|Chromium|Bun|Claude Code|Claude Cowork|Claude|Gemini|Perplexity|Google|Bing|DuckDuckGo|LinkedIn|YouTube|Reddit|X|AppImage|Mac|Electron|Tauri|Ollama|Realtime|microsandbox|opencode)\b/g,
      // Example folder path shown as a literal placeholder.
      /\/workspace\/my-project/g,
      // The stdio wrapper's literal command name, matched before the generic
      // "redrob" rules below so it is not broken into stray fragments.
      /redrob-ui-mcp/g,
      // ollama.com/library and other bare-domain mentions used as literal examples.
      /ollama\.com\/library/g,
      // The engine's global config directory, written as a literal path in copy.
      // Must run BEFORE the generic "config" word strip below, which would
      // otherwise turn "~/.config/redrob" into "~/./redrob" and leave the
      // "redrob" fragment stranded (the lowercase-redrob rule further down only
      // matches when a separator follows, and here the path ends at a space).
      /~\/\.config\/redrob/g,
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
      /*
        Product terms kept in English in Korean copy, on the user's instruction: both name a specific
        action in this app and translating either one made it read as a different feature. "다시 쓰기" was
        read as an edit and "다시 묻기" as the retry button that already exists beside it.
      */
      /paraphrase/g,
      /compare/g,
      // Literal slash-command names shown verbatim in copy.
      /\/compact\b/g,
      // Same reason: a command name is typed exactly as written, so translating it would break it.
      /\/shuffle\b/g,
      /\/compare\b/g,
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
