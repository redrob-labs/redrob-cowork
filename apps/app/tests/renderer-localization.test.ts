import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";

/**
 * Redrob Work ships in English and Korean, so every string the user reads has
 * to come from the dictionary. A component that renders its copy inline is
 * English forever, no matter how complete `ko.ts` is, and nothing about it
 * fails to compile. This guard reads every renderer source and reports the
 * ones that still do.
 *
 * The onboarding suite covers the same ground for the first-run wizard with a
 * stricter, closed exception list; this one covers the rest of the app.
 */
const RENDERER_DIR = join(import.meta.dir, "..", "src", "react-app");

/** Attributes whose value the user reads or hears. */
const USER_FACING_ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];

/**
 * Latin-script strings that are not English prose. Each entry is a product
 * name, a literal command, a path, or a URL: text that stays identical in
 * Korean because translating it would break what it names.
 */
const ALLOWED_LITERALS = new Set([
  "Redrob Work",
  "Redrob Code",
  "Claude Desktop, Codex, Cursor",
  "OpenCode",
  "OpenCode Plugins",
  "opencode-wakatime",
  "redrob://...",
  "https://github.com/slackapi/slack-mcp-plugin",
  "Redrob Work.app.migrate-bak",
  "alpha-macos-latest/latest-mac.yml",
  "releases/latest/download/latest-mac.yml",
]);

/**
 * Developer-only overlays. They are reachable only from a dev build or a
 * debug shortcut, they print runtime internals whose field names are the
 * code's own identifiers, and translating them would make a bug report
 * harder to read, not easier.
 */
const DEVELOPER_ONLY = new Set([
  "domains/session/surface/debug-panel.tsx",
  "shell/dev-profiler.tsx",
  "shell/react-render-watchdog-overlay.tsx",
]);

const sources: { name: string; code: string }[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!path.endsWith(".tsx")) continue;
    const name = relative(RENDERER_DIR, path);
    if (DEVELOPER_ONLY.has(name)) continue;
    sources.push({
      name,
      // Comments explain intent to developers and are never rendered.
      code: readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, ""),
    });
  }
};
walk(RENDERER_DIR);

describe("renderer localization", () => {
  test("the guard reads the whole renderer", () => {
    expect(sources.length).toBeGreaterThan(100);
    for (const name of DEVELOPER_ONLY) {
      expect(sources.some((source) => source.name === name)).toBe(false);
    }
  });

  test("every dictionary key the renderer references is translated in both bundles", () => {
    const referenced = new Set<string>();
    for (const source of sources) {
      for (const match of source.code.matchAll(/\bt\(\s*"([a-z][a-z0-9_]*\.[a-z0-9_]+)"/g)) {
        referenced.add(match[1]);
      }
    }
    expect(referenced.size).toBeGreaterThan(500);

    // English carries `_one` / `_other` where Korean carries the bare key, so
    // a plural family counts as present in either shape.
    const resolves = (bundle: Record<string, string>, key: string) =>
      key in bundle || `${key}_one` in bundle || `${key}_other` in bundle;

    expect([...referenced].filter((key) => !resolves(en, key)).sort()).toEqual([]);
    expect([...referenced].filter((key) => !resolves(ko, key)).sort()).toEqual([]);
  });

  test("no renderer component hardcodes user-facing English", () => {
    const violations: string[] = [];

    for (const source of sources) {
      // JSX text nodes: anything between a closing and an opening angle
      // bracket that is neither an expression nor markup. A tag closes with
      // ">", never with "=>", so skipping the arrow keeps generic type
      // annotations out of the scan.
      for (const match of source.code.matchAll(/(?<!=)>\s*([A-Za-z][A-Za-z ,.'?!\-:/]{6,}?)\s*</g)) {
        if (!ALLOWED_LITERALS.has(match[1])) {
          violations.push(`${source.name}: text "${match[1]}"`);
        }
      }

      for (const attribute of USER_FACING_ATTRIBUTES) {
        const pattern = new RegExp(`\\b${attribute}=\\"([A-Za-z][^\\"]{6,})\\"`, "g");
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
