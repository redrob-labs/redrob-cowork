import { describe, expect, test } from "bun:test";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";

/**
 * The Desk screens speak to non-technical people. product.md lists the words they never
 * see (the "Not" column); this guard keeps every `desk.*` string clear of them, of dashes,
 * of file paths, and of shouted words.
 */

const deskEntries = (bundle: Record<string, string>, locale: string) =>
  Object.entries(bundle)
    .filter(([key]) => key.startsWith("desk."))
    .map(([key, value]) => ({ id: `${locale}:${key}`, value }));

const entries = [...deskEntries(en, "en"), ...deskEntries(ko, "ko")];

// Whole words, case-insensitive. `providers?` and `api keys?` cover both forms.
const bannedWords: RegExp[] = [
  /\bAI Firewall\b/i,
  /\bMulti-Model Memory\b/i,
  /\bMulti-Model Crosscheck\b/i,
  /\bExpert Match\b/i,
  /\brouters?\b/i,
  /\bMCPs?\b/i,
  /\bintegrations?\b/i,
  /\bOllama\b/i,
  /\bLLMs?\b/i, // "local LLM" in either language
  /\bAPI keys?\b/i,
  /\bproviders?\b/i,
  // The same words as Korean copy would spell them.
  /라우터/,
  /올라마/,
  /프로바이더/,
  /API\s*키/i,
];

const pathLike = [/[A-Za-z]:\\/, /\/Users\//, /\/home\//, /\\\\/, /\.opencode\//];

// Acronyms people read as words. Anything else in capitals of 4+ letters is shouting.
// None appear today; three-letter ones (PDF, URL) are below the length cut and need no entry.
const allowedCaps = new Set([
  "HTML", // a file type, if the Files panel ever names one
  "JSON", // a file type, if the Files panel ever names one
]);

function violations(check: (value: string) => string | null) {
  return entries.flatMap(({ id, value }) => {
    const found = check(value);
    return found ? [`${id}: ${found} in "${value}"`] : [];
  });
}

describe("desk copy guard", () => {
  test("there are desk strings in both languages", () => {
    // Korean has no plural forms, so English `_one`/`_other` pairs are one Korean key.
    const base = (bundle: Record<string, string>) =>
      [...new Set(Object.keys(bundle).filter((key) => key.startsWith("desk.")).map((key) => key.replace(/_(one|other)$/, "")))].sort();
    expect(base(en).length).toBeGreaterThan(100);
    expect(base(ko)).toEqual(base(en));
  });

  test("no word from the product's Not column", () => {
    expect(violations((value) => bannedWords.find((word) => word.test(value))?.source ?? null)).toEqual([]);
  });

  test("no em dash or en dash", () => {
    expect(violations((value) => (/[\u2014\u2013]/.test(value) ? "dash" : null))).toEqual([]);
  });

  test("no file paths", () => {
    expect(violations((value) => pathLike.find((path) => path.test(value))?.source ?? null)).toEqual([]);
  });

  test("no ALL CAPS words of four or more letters outside known acronyms", () => {
    expect(
      violations((value) => (value.match(/\b[A-Z]{4,}\b/g) ?? []).find((word) => !allowedCaps.has(word)) ?? null),
    ).toEqual([]);
  });
});
