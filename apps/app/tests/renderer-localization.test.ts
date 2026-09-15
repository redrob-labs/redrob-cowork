import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import en from "../src/i18n/locales/en";
import ko from "../src/i18n/locales/ko";

/**
 * Redrob Cowork ships in English and Korean, so every string the user reads has
 * to come from the dictionary. A component that renders its copy inline is
 * English forever, no matter how complete `ko.ts` is, and nothing about it
 * fails to compile. This guard reads every renderer source and reports the
 * ones that still do.
 *
 * The onboarding suite covers the same ground for the first-run wizard with a
 * stricter, closed exception list; this one covers the rest of the app.
 */
/**
 * Every renderer source, not just `react-app/`.
 *
 * This used to be `src/react-app`, which left 80 of the app's 211 `.tsx` files
 * unguarded -- only 5 of them called `t()` at all. That blind spot is where
 * `Try one of these:` sat in the new-session strip: English forever, in a file
 * no guard was reading.
 */
const RENDERER_DIR = join(import.meta.dir, "..", "src");

/** Attributes whose value the user reads or hears. */
const USER_FACING_ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];

/**
 * Latin-script strings that are not English prose. Each entry is a product
 * name, a literal command, a path, or a URL: text that stays identical in
 * Korean because translating it would break what it names.
 */
const ALLOWED_LITERALS = new Set([
  "Redrob Cowork",
  "Redrob Code",
  "Claude Desktop, Codex, Cursor",
  "OpenCode",
  "opencode-wakatime",
  "redrob://...",
  "https://github.com/slackapi/slack-mcp-plugin",
  "Redrob Cowork.app.migrate-bak",
  "alpha-macos-latest/latest-mac.yml",
  "cdn.redrob.ai/work/latest/latest-mac.yml",
]);

/**
 * Developer-only overlays. They are reachable only from a dev build or a
 * debug shortcut, they print runtime internals whose field names are the
 * code's own identifiers, and translating them would make a bug report
 * harder to read, not easier.
 */
const DEVELOPER_ONLY = new Set([
  "react-app/domains/session/surface/debug-panel.tsx",
  "react-app/shell/dev-profiler.tsx",
  "react-app/shell/react-render-watchdog-overlay.tsx",
]);

/**
 * Bare JavaScript/TypeScript keywords. A self-closing tag followed by
 * `return <Other />` puts one of these between a ">" and a "<", which the JSX
 * text heuristic below cannot tell from a text node. None of them is ever copy.
 */
const CODE_KEYWORDS = new Set([
  "return",
  "default",
  "typeof",
  "await",
  "yield",
  "export",
  "function",
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
        const text = match[1];
        // `/>` followed by `return <Other />` reads as a text node to the
        // heuristic above, and a TypeScript optional property (`foo?: Bar`)
        // does too. Neither can be prose, and both recur often enough that an
        // allow-list entry per occurrence would rot. Trimmed, because the
        // capture class includes spaces and so keeps a trailing one.
        if (CODE_KEYWORDS.has(text.trim())) continue;
        if (text.includes("?:")) continue;
        if (!ALLOWED_LITERALS.has(text)) {
          violations.push(`${source.name}: text "${text}"`);
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
