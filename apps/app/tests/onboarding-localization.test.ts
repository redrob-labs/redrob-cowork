import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";

/**
 * First run is the only screen every user sees, so it is the one place a
 * hardcoded English string is guaranteed to reach a Korean user. These
 * assertions read the onboarding sources themselves: every dictionary key the
 * steps reference must exist in both bundles, and no rendered text or
 * user-visible attribute may carry a literal English word.
 */
const ONBOARDING_DIR = join(
  import.meta.dir,
  "..",
  "src",
  "react-app",
  "domains",
  "onboarding",
);

/** Attributes whose value the user reads or hears. */
const USER_FACING_ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];

/**
 * Latin-script values that are not English prose: proper nouns, and the
 * literal example path shown inside the workspace-folder input.
 */
const ALLOWED_LITERALS = new Set(["Redrob Work", "Redrob Code", "/workspace/my-project"]);

const sources = readdirSync(ONBOARDING_DIR)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => ({
    name,
    // Comments explain intent to developers and are never rendered.
    code: readFileSync(join(ONBOARDING_DIR, name), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, ""),
  }));

describe("onboarding localization", () => {
  test("the onboarding steps exist and are read by this guard", () => {
    expect(sources.map((source) => source.name).sort()).toEqual([
      "attribution-step.tsx",
      "engine-download-step.tsx",
      "language-step.tsx",
      "onboarding-brand-mark.tsx",
      "onboarding-wizard-shell.tsx",
      "redrob-key-step.tsx",
      "welcome-page.tsx",
    ]);
  });

  test("every dictionary key onboarding references is translated in both bundles", () => {
    const referenced = new Set<string>();
    for (const source of sources) {
      for (const match of source.code.matchAll(/"((?:onboarding|welcome)\.[a-z0-9_]+)"/g)) {
        referenced.add(match[1]);
      }
    }

    // A key referenced through a variable (the attribution options table) is
    // still a literal in the same file, so the scan must reach past the
    // handful of keys interpolated directly at a call site.
    expect(referenced.size).toBeGreaterThan(20);

    expect([...referenced].filter((key) => !(key in en)).sort()).toEqual([]);
    expect([...referenced].filter((key) => !(key in ko)).sort()).toEqual([]);
  });

  test("no onboarding step renders a hardcoded English string", () => {
    const violations: string[] = [];

    for (const source of sources) {
      // JSX text nodes: anything between a closing and an opening angle
      // bracket that is neither an expression nor markup. A tag closes with
      // ">", never with "=>", so skipping the arrow keeps generic type
      // annotations out of the scan.
      for (const match of source.code.matchAll(/(?<!=)>\s*([A-Za-z][^<>{}]*?)\s*</g)) {
        if (!ALLOWED_LITERALS.has(match[1])) {
          violations.push(`${source.name}: text "${match[1]}"`);
        }
      }

      for (const attribute of USER_FACING_ATTRIBUTES) {
        const pattern = new RegExp(`\\b${attribute}=\\"([^\\"]+)\\"`, "g");
        for (const match of source.code.matchAll(pattern)) {
          if (!ALLOWED_LITERALS.has(match[1])) {
            violations.push(`${source.name}: ${attribute}="${match[1]}"`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
