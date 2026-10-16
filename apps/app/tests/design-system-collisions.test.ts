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

  test("a name the app's @theme writes and the design system declares is never read back through var()", () => {
    // Only the names the app's own `@theme` writes are ambiguous at runtime: a
    // `var()` read sees the design system's value, not the one `@theme` wrote. A
    // shared name the app never writes (`--shadow-*`) can only resolve to the
    // design system's token, so aliasing it is the point rather than a hazard.
    const written = new Set(
      APP_DECLARATIONS.filter((entry) => entry.inTheme && TAILWIND_THEME_SHARED.has(entry.name)).map(
        (entry) => entry.name,
      ),
    );
    expect(written.has("--font-sans")).toBe(true);
    // One pass per file with one pattern: this walks every source file, and a
    // pattern per name made it slow enough to time out under the full suite.
    const pattern = new RegExp(`var\\(\\s*(${[...written].join("|")})(?![\\w-])`, "g");
    const offenders: string[] = [];
    for (const file of SOURCE_FILES) {
      const counts = new Map<string, number>();
      for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
        counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
      }
      for (const [name, reads] of counts) offenders.push(`${relative(file)}: var(${name}) x${reads}`);
    }
    expect(offenders).toEqual([]);
  });

  test("no app stylesheet defines a class the design system styles", () => {
    /*
      Intentional, scoped overrides of design-system component classes, agreed with
      the product owner (UI/UX pass, Oct 2026). Each is a deliberate divergence the
      component's own API cannot express:
        - rr-cstatus__panel + its rr-privacy__* / rr-memscope__* children: the
          composer status popover (Privacy / Memory / Cross-check) is sized down to
          the app's scale and given a thin overlay scrollbar; the DS panel exposes
          no size/scrollbar props.
        - rr-shell__top / rr-shell__symbol: the shell's top header is hidden on the
          empty new-chat home (nothing to put there); gated by cowork-shell--bare-top.
        - rr-shell__brand / rr-shell__product / rr-mark: the sidebar brand lockup
          (enlarged rounded mark + the "Redrob Cowork" wordmark in the DS font);
          the wordmark itself comes from the AppShell `product` prop, these rules
          only restyle it.
        - rr-shell__fold: the brand-row fold toggle is hidden (the window title bar
          carries the sidebar toggle; both flip the same state).
        - rr-shell__side / rr-shell--norail: the left sidebar is user-draggable
          (its grid column is driven from --app-side-width) and the title-bar
          toggle fully hides it (column 0) instead of the DS 64px mini-rail — the
          DS exposes neither a resize affordance nor a full-hide state (round 8).
      Keep this list tight: a new entry is a new divergence that needs the same sign-off.
    */
    const APP_OVERRIDES_DS_CLASSES = new Set([
      "rr-cstatus__panel",
      "rr-cstatus__row",
      "rr-privacy",
      "rr-privacy__levels",
      "rr-privacy__level",
      "rr-privacy__levelhead",
      "rr-privacy__last",
      "rr-memscope",
      "rr-memscope__options",
      "rr-shell__top",
      "rr-shell__symbol",
      "rr-shell__brand",
      "rr-shell__product",
      "rr-shell__fold",
      "rr-shell__aside",
      "rr-shell__theme",
      "rr-shell__side",
      "rr-shell--norail",
      "rr-mark",
    ]);
    const offenders: string[] = [];
    for (const file of STYLESHEETS) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/url\([^)]*\)/g, "");
      // Selectors only: the text before each `{`.
      for (const selector of source.matchAll(/([^{};]+)\{/g)) {
        for (const match of selector[1].matchAll(/\.([a-zA-Z][\w-]*)/g)) {
          if (DS_CLASSES.has(match[1]) && !APP_OVERRIDES_DS_CLASSES.has(match[1])) {
            offenders.push(`${relative(file)}: .${match[1]}`);
          }
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});
