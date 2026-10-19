import { describe, expect, test } from "bun:test";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";

/** Strips the plural suffix, since EN carries `_one/_other` where KO keeps one bare key. */
function baseKeys(bundle: Record<string, string>): Set<string> {
  return new Set(Object.keys(bundle).map((key) => key.replace(/_(one|other)$/, "")));
}

/** Lists `lang:key` for every value that matches the pattern. */
function offending(pattern: RegExp): string[] {
  const bundles: Array<[string, Record<string, string>]> = [
    ["en", en],
    ["ko", ko],
  ];
  return bundles.flatMap(([lang, bundle]) =>
    Object.entries(bundle)
      .filter(([, value]) => pattern.test(value))
      .map(([key]) => `${lang}:${key}`),
  );
}

// One locale-wide guard for the copy rules, instead of per-feature copies of the same checks.
describe("locale copy voice", () => {
  test("English and Korean have the same keys", () => {
    const enKeys = baseKeys(en);
    const koKeys = baseKeys(ko);
    expect([...enKeys].filter((key) => !koKeys.has(key))).toEqual([]);
    expect([...koKeys].filter((key) => !enKeys.has(key))).toEqual([]);
  });

  test("no value uses an en or em dash", () => {
    expect(offending(/[\u2013\u2014]/)).toEqual([]);
  });

  test("no value uses the old product name Desk", () => {
    expect(offending(/데스크(?!톱)|\bDesk\b/)).toEqual([]);
  });
});
