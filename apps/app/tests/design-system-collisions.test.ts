import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * The Redrob Group Design System 2026 (`@redrob-labs/ui`) is plain CSS on custom
 * properties, unlayered, and its component classes read those properties by name:
 * `rr-btn` paints `var(--action-primary)`, a card reads `var(--radius-lg)`, a field
 * reads `var(--border-strong)`.
 *
 * A custom property has one value per element, and the declaration that wins is the
 * one the cascade happens to prefer. So the moment the app declares a name the design
 * system also declares, either the app's screens or the design system's components
 * paint the other's value, and nothing reports it. Radix's `--gray-1..12` against the
 * brand's `--gray-1..9`, and the app's `--border-strong` (Gray 4) against the design
 * system's (Gray 6, the control outline), were both live when the package arrived.
 *
 * These assertions keep the two vocabularies apart: the app may not declare a design
 * system name, may not read a name Tailwind and the design system both own through
 * `var()`, and may not define a class the design system already styles.
 */
const APP_ROOT = join(import.meta.dir, "..");
const appRequire = createRequire(join(APP_ROOT, "package.json"));
const DS_TOKENS_CSS = readFileSync(appRequire.resolve("@redrob-labs/ui/tokens.css"), "utf8");
const DS_SYSTEM_CSS = readFileSync(appRequire.resolve("@redrob-labs/ui/styles.css"), "utf8");
const DS_TOKENS_JSON: { tokens: Array<{ name: string }> } = JSON.parse(
  readFileSync(appRequire.resolve("@redrob-labs/ui/tokens.json"), "utf8"),
);

/** Every custom property the design system declares, from both of its sources. */
const DS_NAMES = new Set([
  ...DS_TOKENS_JSON.tokens.map((token) => `--${token.name}`),
  ...[...DS_TOKENS_CSS.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((match) => match[1]),
]);

/**
 * Tailwind theme keys the design system also declares. Tailwind owns them inside
 * `@theme`, where `inline` bakes the value into each utility, so the clash is
 * harmless exactly as long as the app never reads them back through `var()`: that
 * read would see the design system's value, not the one the `@theme` block wrote.
 * Reads go through `--theme()`, which Tailwind resolves at build time.
 */
const TAILWIND_THEME_SHARED = new Set([
  "--font-sans",
  "--font-mono",
  "--radius-xs",
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-xl",
  "--radius-2xl",
  "--shadow-sm",
  "--shadow-md",
  "--shadow-lg",
]);

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

const SOURCE_FILES = walkFiles(join(APP_ROOT, "src")).filter((file) => /\.(css|tsx?)$/.test(file));
const STYLESHEETS = SOURCE_FILES.filter((file) => file.endsWith(".css"));
const relative = (file: string) => file.slice(APP_ROOT.length + 1).replaceAll("\\", "/");

type Declaration = { file: string; name: string; inTheme: boolean };

/**
 * Every `--name:` in a stylesheet, with whether it sits inside an `@theme` block.
 * Comments are blanked first so a commented-out declaration is not counted.
 */
function declarations(file: string): Declaration[] {
  const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
  const found: Declaration[] = [];
  const headers: string[] = [];
  let headerStart = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      headers.push(source.slice(headerStart, index).trim());
      headerStart = index + 1;
    } else if (char === "}") {
      headers.pop();
      headerStart = index + 1;
    } else if (char === ";") {
      headerStart = index + 1;
    }
    if (char === "-" && source[index + 1] === "-" && /[\s;{]/.test(source[index - 1] ?? " ")) {
      const match = /^(--[a-zA-Z0-9-]+)\s*:/.exec(source.slice(index));
      if (match) {
        found.push({
          file: relative(file),
          name: match[1],
          inTheme: headers.some((header) => header.startsWith("@theme")),
        });
      }
    }
  }
  return found;
}

const APP_DECLARATIONS = STYLESHEETS.flatMap(declarations);

/** Class names the design system styles: its component classes and its global type classes. */
const DS_CLASSES = new Set(
  [DS_TOKENS_CSS, DS_SYSTEM_CSS].flatMap((css) =>
    [...css.replace(/url\([^)]*\)/g, "").matchAll(/\.([a-zA-Z][\w-]*)(?=[\s,.:{[>)~+])/g)].map(
      (match) => match[1],
    ),
  ),
);

describe("the design system and the app keep separate vocabularies", () => {
  test("the design system package is the one the app was built against", () => {
    // A sanity check that the sets below are not empty because a path moved.
    expect(DS_NAMES.size).toBeGreaterThan(250);
    expect(DS_NAMES.has("--surface-base")).toBe(true);
    expect(DS_NAMES.has("--gray-1")).toBe(true);
    expect(DS_CLASSES.has("rr-btn")).toBe(true);
    expect(APP_DECLARATIONS.length).toBeGreaterThan(200);
  });

  test("no app stylesheet declares a custom property the design system declares", () => {
    const offenders = APP_DECLARATIONS.filter((entry) => !entry.inTheme && DS_NAMES.has(entry.name)).map(
      (entry) => `${entry.file}: ${entry.name}`,
    );
    expect([...new Set(offenders)]).toEqual([]);
  });

  test("a Tailwind theme key shares a design system name only from the agreed set", () => {
    const offenders = APP_DECLARATIONS.filter(
      (entry) => entry.inTheme && DS_NAMES.has(entry.name) && !TAILWIND_THEME_SHARED.has(entry.name),
    ).map((entry) => `${entry.file}: ${entry.name}`);
    expect([...new Set(offenders)]).toEqual([]);
  });

  test("a name Tailwind and the design system both own is never read back through var()", () => {
    const offenders: string[] = [];
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, "utf8");
      for (const name of TAILWIND_THEME_SHARED) {
        const pattern = new RegExp(`var\\(\\s*${name}(?![\\w-])`, "g");
        const reads = [...source.matchAll(pattern)].length;
        if (reads > 0) offenders.push(`${relative(file)}: var(${name}) x${reads}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no app stylesheet defines a class the design system styles", () => {
    const offenders: string[] = [];
    for (const file of STYLESHEETS) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/url\([^)]*\)/g, "");
      // Selectors only: the text before each `{`.
      for (const selector of source.matchAll(/([^{};]+)\{/g)) {
        for (const match of selector[1].matchAll(/\.([a-zA-Z][\w-]*)/g)) {
          if (DS_CLASSES.has(match[1])) offenders.push(`${relative(file)}: .${match[1]}`);
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});
