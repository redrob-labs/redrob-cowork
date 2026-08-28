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

  test("Korean ships real translations and no keys English lacks", () => {
    // Korean has no grammatical plural, so a Korean bundle carries the bare key
    // where English carries `_one` / `_other` variants. Both shapes count as
    // present: `t()` resolves the bare key last for exactly this reason.
    const englishKeys = new Set(Object.keys(en));
    const englishPluralBases = new Set(
      Object.keys(en)
        .filter((key) => /_(zero|one|two|few|many|other)$/.test(key))
        .map((key) => key.replace(/_(zero|one|two|few|many|other)$/, "")),
    );
    expect(englishKeys.size).toBeGreaterThan(0);
    expect(Object.keys(ko).length).toBeGreaterThan(0);
    const orphans = Object.keys(ko).filter(
      (key) => !englishKeys.has(key) && !englishPluralBases.has(key),
    );
    expect(orphans).toEqual([]);
  });
});
