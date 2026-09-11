import { describe, expect, test } from "bun:test";

import { setLocale } from "../src/i18n";
import { BUILT_IN_REDROB_EXTENSION_MANIFESTS } from "../src/app/extensions";

/**
 * Display text must follow a locale switch, not freeze at import time.
 *
 * The failure mode this exists for: a module-level constant that holds UI text
 * and calls `t(...)` in its initializer. The locale is loaded at runtime, so
 * that call resolves before the user's language is known and the string is
 * stuck in English forever. Nothing else catches it -- `t()` takes a plain
 * `string`, so typecheck is silent; the value is a perfectly good string, so no
 * snapshot or type test fails; and `renderer-localization.test.ts` sees a
 * `t(...)` call and is satisfied. The only symptom is English in a Korean UI,
 * which is what a user had to report.
 *
 * Reading the same property twice across a locale change is the one check that
 * distinguishes a lazy getter from a value baked in at module init.
 *
 * These constants are the module-scope catalogs that carry user-facing copy;
 * add to the list when another one appears.
 */
describe("localized module constants are lazy", () => {
  const samples: { name: string; read: () => string }[] = [
    {
      name: "first extension manifest description",
      read: () => BUILT_IN_REDROB_EXTENSION_MANIFESTS[0]!.description,
    },
    {
      name: "first extension manifest setup instructions",
      read: () => BUILT_IN_REDROB_EXTENSION_MANIFESTS[0]!.setup.instructions,
    },
  ];

  for (const sample of samples) {
    test(`${sample.name} changes with the locale`, () => {
      try {
        setLocale("en");
        const english = sample.read();
        setLocale("ko");
        const korean = sample.read();

        expect(english.length).toBeGreaterThan(0);
        expect(korean.length).toBeGreaterThan(0);
        // Frozen-at-init text is byte-identical across the switch.
        expect(korean).not.toBe(english);
      } finally {
        setLocale("en");
      }
    });
  }

  test("every manifest description is localized", () => {
    // Asserted across all manifests, not just the first, so a description added
    // later cannot quietly ship English. Only `description` is checked: a
    // product NAME may legitimately be identical in both bundles (Ollama,
    // Computer Use), whereas prose never is.
    const unlocalized: string[] = [];
    for (const manifest of BUILT_IN_REDROB_EXTENSION_MANIFESTS) {
      try {
        setLocale("en");
        const english = manifest.description;
        setLocale("ko");
        if (manifest.description === english) unlocalized.push(manifest.id);
      } finally {
        setLocale("en");
      }
    }
    expect(unlocalized).toEqual([]);
  });
});
