import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";
import { setLocale, t } from "../src/i18n";
import {
  extensionTaxonomyDescription,
  EXTENSION_TAXONOMIES,
} from "../src/react-app/domains/settings/extension-taxonomy";
import { getPanelDestinations } from "../src/react-app/domains/session/panel/panel-empty";

/**
 * New Session and Library were rendering English to Korean users. The cause was
 * not missing keys (`ko.ts` has enforced key parity) but literals hardcoded in
 * the components and stores those screens read from.
 *
 * Two layers of proof, because either alone is escapable:
 *  - behavioral: call the functions that produce the copy with the locale set
 *    to Korean and assert the returned strings are Korean;
 *  - structural: read the source of the surfaces that were cleaned and fail on
 *    a reintroduced English literal, so the next edit cannot quietly regress.
 */
const SRC = join(import.meta.dir, "..", "src");

/** Sources cleaned for these two screens. Every rendered string goes through `t()`. */
const GUARDED_SOURCES = [
  "react-app/domains/session/panel/panel-empty.tsx",
  "react-app/domains/session/chat/session-empty-hero.tsx",
  "react-app/domains/session/chat/new-task-composer.tsx",
  "react-app/design-system/extension-card.tsx",
  "react-app/design-system/extension-detail-modal.tsx",
  "react-app/domains/settings/extension-taxonomy.ts",
];

/**
 * Stores whose status and error strings the Library screen renders verbatim.
 * These were the largest source of English on that screen.
 */
const GUARDED_STORES = [
  "react-app/domains/connections/store.ts",
  "react-app/domains/settings/state/extensions-store.ts",
];

/**
 * Latin-script values that are not English prose: brand names, protocol and
 * format names, literal commands, and config identifiers shown verbatim.
 */
const ALLOWED_LITERALS = new Set([
  "Redrob Work",
  "Redrob Code",
  "OpenCode",
  "MCP",
  "OAuth",
  "Claude Desktop, Codex, Cursor",
]);

const readSource = (relativePath: string) =>
  readFileSync(join(SRC, relativePath), "utf8")
    // Comments explain intent to developers and are never rendered.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** An English sentence: at least two words, one of them lowercase. */
const looksLikeEnglishProse = (value: string) => {
  const text = value.trim();
  if (ALLOWED_LITERALS.has(text)) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (!/ [a-z]/.test(text)) return false;
  // Template holes and JSX/TS syntax mean this is not a copy literal.
  if (/[{}<>=]|\$\{/.test(text)) return false;
  return true;
};

/** Korean text has at least one Hangul syllable. */
const isKorean = (value: string) => /[가-힣]/.test(value);

describe("new session and library localization", () => {
  test("the panel destination chooser is translated", () => {
    setLocale("ko");
    try {
      const destinations = getPanelDestinations(
        { onOpenBrowser: () => {}, onOpenExtensions: () => {}, onOpenVoice: () => {} },
        () => {},
      );
      expect(destinations.map((destination) => destination.id)).toEqual([
        "browser",
        "files",
        "extensions",
        "voice",
      ]);
      for (const destination of destinations) {
        expect(isKorean(destination.label)).toBe(true);
        expect(isKorean(destination.description)).toBe(true);
      }
    } finally {
      setLocale("en");
    }
  });

  test("the panel destination chooser still reads English under the English locale", () => {
    setLocale("en");
    const destinations = getPanelDestinations({ onOpenBrowser: () => {} }, () => {});
    expect(destinations[0]?.label).toBe("Browser");
    expect(destinations[0]?.description).toBe("Open a new page in the built-in browser.");
  });

  test("every Library taxonomy explains itself in Korean", () => {
    setLocale("ko");
    try {
      for (const taxonomy of EXTENSION_TAXONOMIES) {
        const description = extensionTaxonomyDescription(taxonomy);
        expect(isKorean(description)).toBe(true);
        // A missing key falls through to the key itself; Hangul rules that out,
        // but assert the shape too so a Korean-looking key cannot pass.
        expect(description.startsWith("extension.")).toBe(false);
      }
    } finally {
      setLocale("en");
    }
  });

  test("the Library and composer status strings resolve in both locales", () => {
    const statusKeys = [
      "mcp.status_none_loaded",
      "mcp.status_none_configured",
      "mcp.status_load_failed",
      "mcp.status_config_read_only",
      "plugins.status_none_configured",
      "plugins.status_load_failed",
      "plugins.source_global_folder",
      "skills.status_cannot_read",
      "extension.not_connected",
      "extension.hidden",
      "composer.pasted_expand",
      "composer.pasted_expand_aria",
    ];

    for (const key of statusKeys) {
      expect(key in en).toBe(true);
      expect(key in ko).toBe(true);
      expect(t(key, "ko")).not.toBe(key);
      expect(isKorean(t(key, "ko"))).toBe(true);
    }

    // The pasted-text chip is a plural: English varies, Korean does not.
    expect(t("composer.pasted_lines", { count: 1, lng: "en" })).toBe("Pasted · 1 line");
    expect(t("composer.pasted_lines", { count: 4, lng: "en" })).toBe("Pasted · 4 lines");
    expect(t("composer.pasted_lines", { count: 4, lng: "ko" })).toBe("붙여넣음 · 4줄");
  });

  test("no cleaned surface renders a hardcoded English literal", () => {
    const violations: string[] = [];

    for (const relativePath of GUARDED_SOURCES) {
      const code = readSource(relativePath);

      // JSX text nodes. A tag closes with ">", never with "=>", so skipping the
      // arrow keeps generic type annotations out of the scan.
      for (const match of code.matchAll(/(?<!=)>\s*([A-Za-z][^<>{}]*?)\s*</g)) {
        if (looksLikeEnglishProse(match[1])) violations.push(`${relativePath}: text "${match[1]}"`);
      }

      // Copy passed as a prop or an object field.
      const copyField = /\b(label|description|title|placeholder|aria-label|hint|alt)\s*[:=]\s*"([^"]+)"/g;
      for (const match of code.matchAll(copyField)) {
        if (looksLikeEnglishProse(match[2])) {
          violations.push(`${relativePath}: ${match[1]} "${match[2]}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("no Library store emits a hardcoded English status string", () => {
    const violations: string[] = [];

    for (const relativePath of GUARDED_STORES) {
      const code = readSource(relativePath);
      for (const match of code.matchAll(/"([^"\\]{12,})"/g)) {
        const before = code.slice(0, match.index);
        // A string handed straight to `t()` is a key, not copy.
        if (/\bt\($/.test(before)) continue;
        if (/\bfrom\s*$/.test(before)) continue;
        // Status strings read as sentences: they start with a capital and end
        // with a period or a question mark. Config keys and paths do not.
        if (!/^[A-Z].*[.?]$/.test(match[1])) continue;
        if (!looksLikeEnglishProse(match[1])) continue;
        violations.push(`${relativePath}: "${match[1]}"`);
      }
    }

    expect(violations).toEqual([]);
  });
});
