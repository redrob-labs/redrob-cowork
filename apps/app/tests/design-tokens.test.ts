import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Redrob Work and the Redrob Console draw from one token system. Console main is
 * the source of truth (`apps/web/src/app/globals.css` there), and this app
 * transcribes its primitive layer and re-points the semantic roles its component
 * library already speaks onto that layer.
 *
 * These assertions are the part a screenshot cannot decide: that the brand HEX
 * values are the confirmed ones, that each semantic role sits on the step the
 * shared mapping gives it, that no role has quietly drifted back onto a Radix
 * ramp, and that the product typeface is the one Pretendard face rather than a
 * name with nothing behind it.
 */
const APP_ROOT = join(import.meta.dir, "..");
const PRIMITIVES = readFileSync(join(APP_ROOT, "src/styles/redrob-tokens.css"), "utf8");
const TOKENS = readFileSync(join(APP_ROOT, "src/app/index.css"), "utf8");
const FONTS = readFileSync(join(APP_ROOT, "src/styles/fonts.css"), "utf8");
const INDEX_HTML = readFileSync(join(APP_ROOT, "index.html"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(APP_ROOT, "public/manifest.webmanifest"), "utf8")) as {
  name: string;
  short_name: string;
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string }>;
};

/** The brand's confirmed values, as Console declares them. */
const BRAND_PRIMITIVES: Record<string, string> = {
  "--rr-blue": "#2b52ff",
  "--rr-black": "#0a0b0c",
  "--rr-white": "#ffffff",
  "--rr-blue-1": "#eff4ff",
  "--rr-blue-4": "#8aafff",
  "--rr-blue-5": "#507fff",
  "--rr-blue-6": "#2b52ff",
  "--rr-blue-7": "#1733d5",
  "--rr-blue-9": "#061460",
  "--rr-blue-10": "#030c34",
  "--rr-gray-1": "#f8f9fb",
  "--rr-gray-2": "#eff1f4",
  "--rr-gray-3": "#dfe2e8",
  "--rr-gray-4": "#cbcfd7",
  "--rr-gray-5": "#aab0bb",
  "--rr-gray-6": "#7c8390",
  "--rr-gray-7": "#576071",
  "--rr-gray-8": "#292e37",
  "--rr-gray-9": "#141719",
  "--rr-green-4": "#00864a",
  "--rr-green-5": "#004829",
  "--rr-orange-4": "#ae5100",
  "--rr-red-4": "#a31310",
};

/** Every step the brand scale defines, so a partial transcription is caught. */
const REQUIRED_PRIMITIVE_STEPS = [
  ...Array.from({ length: 10 }, (_, index) => `--rr-blue-${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `--rr-gray-${index + 1}`),
  ...["teal", "sky", "violet", "pink", "red", "orange", "yellow", "lime", "green"].flatMap((hue) =>
    Array.from({ length: 5 }, (_, index) => `--rr-${hue}-${index + 1}`),
  ),
];

/**
 * The block a declaration belongs to decides which theme it is, so the file is
 * read per selector rather than as one bag of declarations.
 */
function block(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function declaration(source: string, name: string): string | null {
  const match = new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m").exec(source);
  return match ? match[1].trim() : null;
}

const LIGHT = block(TOKENS, ":root");
const DARK = block(TOKENS, `.dark,\n[data-theme="dark"]`);

/** The shared mapping: role, light step, dark step. */
const SEMANTIC_MAPPING: Array<[string, string, string]> = [
  ["--background", "--rr-gray-1", "--rr-gray-9"],
  ["--background-secondary", "--rr-gray-2", "--rr-black"],
  ["--foreground", "--rr-gray-9", "--rr-gray-1"],
  ["--muted-foreground", "--rr-gray-7", "--rr-gray-5"],
  ["--subtle-foreground", "--rr-gray-6", "--rr-gray-6"],
  ["--disabled-foreground", "--rr-gray-5", "--rr-gray-7"],
  ["--accent-active", "--rr-gray-3", "--rr-gray-8"],
  ["--secondary", "--rr-gray-2", "--rr-gray-8"],
  ["--muted", "--rr-gray-2", "--rr-gray-8"],
  ["--primary", "--rr-blue-6", "--rr-blue-5"],
  ["--primary-foreground", "--rr-white", "--rr-black"],
  ["--primary-hover", "--rr-blue-7", "--rr-blue-4"],
  ["--primary-muted", "--rr-blue-3", "--rr-blue-9"],
  ["--primary-soft", "--rr-blue-1", "--rr-blue-10"],
  ["--primary-ink", "--rr-blue-6", "--rr-blue-4"],
  ["--border", "--rr-gray-3", "--rr-gray-8"],
  ["--border-strong", "--rr-gray-4", "--rr-gray-7"],
  ["--input", "--rr-gray-6", "--rr-gray-6"],
  ["--ring", "--rr-blue-6", "--rr-blue-5"],
  ["--success", "--rr-green-4", "--rr-green-3"],
  ["--success-ink", "--rr-green-5", "--rr-green-3"],
  ["--success-muted", "--rr-green-2", "--rr-green-4"],
  ["--warning", "--rr-orange-4", "--rr-orange-3"],
  ["--warning-muted", "--rr-orange-2", "--rr-orange-4"],
  ["--destructive", "--rr-red-4", "--rr-red-3"],
  ["--destructive-muted", "--rr-red-2", "--rr-red-4"],
  ["--tooltip", "--rr-gray-9", "--rr-black"],
  ["--sidebar", "--rr-white", "--rr-black"],
  ["--sidebar-primary", "--rr-blue-6", "--rr-blue-5"],
  ["--spectrum-teal", "--rr-teal-5", "--rr-teal-3"],
  ["--spectrum-sky", "--rr-sky-4", "--rr-sky-3"],
  ["--spectrum-violet", "--rr-violet-4", "--rr-violet-3"],
  ["--spectrum-pink", "--rr-pink-4", "--rr-pink-3"],
  ["--spectrum-red", "--rr-red-4", "--rr-red-3"],
  ["--spectrum-orange", "--rr-orange-4", "--rr-orange-3"],
  ["--spectrum-yellow", "--rr-yellow-5", "--rr-yellow-3"],
  ["--spectrum-lime", "--rr-lime-5", "--rr-lime-3"],
  ["--spectrum-green", "--rr-green-4", "--rr-green-3"],
];

/** Roles product code reads that must exist in both themes or in neither. */
const THEMED_ROLES = SEMANTIC_MAPPING.map(([role]) => role);

describe("Redrob design tokens", () => {
  test("the primitive layer carries the brand's confirmed HEX values", () => {
    const wrong: string[] = [];
    for (const [name, hex] of Object.entries(BRAND_PRIMITIVES)) {
      const value = declaration(PRIMITIVES, name);
      if (value !== hex) wrong.push(`${name}: ${value ?? "missing"} (expected ${hex})`);
    }
    expect(wrong).toEqual([]);
  });

  test("every step of the brand scale is transcribed", () => {
    const missing = REQUIRED_PRIMITIVE_STEPS.filter((name) => declaration(PRIMITIVES, name) === null);
    expect(missing).toEqual([]);
  });

  test("the primitive layer is theme-independent", () => {
    // Primitives are declared once, on :root. A `--rr-*` under a dark selector
    // would mean two values for one brand step.
    expect(PRIMITIVES).not.toMatch(/\[data-theme="dark"\]|\.dark\b/);
  });

  test("each semantic role sits on the step the shared mapping gives it", () => {
    const wrong: string[] = [];
    for (const [role, light, dark] of SEMANTIC_MAPPING) {
      const lightValue = declaration(LIGHT, role);
      const darkValue = declaration(DARK, role);
      if (lightValue !== `var(${light})`) wrong.push(`light ${role}: ${lightValue ?? "missing"} (expected ${light})`);
      if (darkValue !== `var(${dark})`) wrong.push(`dark ${role}: ${darkValue ?? "missing"} (expected ${dark})`);
    }
    expect(wrong).toEqual([]);
  });

  test("the raised dark surfaces mix Gray 8 into Gray 9 rather than inventing a step", () => {
    for (const role of ["--card", "--popover", "--accent"]) {
      expect(declaration(DARK, role)).toBe("color-mix(in srgb, var(--rr-gray-8) 45%, var(--rr-gray-9))");
    }
    // A subtle border is one step lighter than the panel it separates, so it is
    // the same mix at 55% on dark and Gray 2 on light.
    expect(declaration(DARK, "--border-subtle")).toBe(
      "color-mix(in srgb, var(--rr-gray-8) 55%, var(--rr-gray-9))",
    );
    expect(declaration(LIGHT, "--border-subtle")).toBe("var(--rr-gray-2)");
  });

  test("a card sits above the page: White on Gray 1 in light", () => {
    expect(declaration(LIGHT, "--card")).toBe("var(--rr-white)");
    expect(declaration(LIGHT, "--popover")).toBe("var(--rr-white)");
    expect(declaration(LIGHT, "--background")).toBe("var(--rr-gray-1)");
  });

  test("every themed role is defined in both palettes", () => {
    const lightOnly = THEMED_ROLES.filter((role) => declaration(LIGHT, role) && !declaration(DARK, role));
    const darkOnly = THEMED_ROLES.filter((role) => declaration(DARK, role) && !declaration(LIGHT, role));
    expect({ lightOnly, darkOnly }).toEqual({ lightOnly: [], darkOnly: [] });
  });

  test("a status is all four of fill, ink on that fill, soft strip, and readable text", () => {
    const incomplete: string[] = [];
    for (const status of ["success", "warning", "destructive"]) {
      for (const suffix of ["", "-foreground", "-soft", "-ink"]) {
        const role = `--${status}${suffix}`;
        if (!declaration(LIGHT, role)) incomplete.push(`light ${role}`);
        if (!declaration(DARK, role)) incomplete.push(`dark ${role}`);
      }
    }
    expect(incomplete).toEqual([]);
  });

  test("no semantic role reads a Radix ramp", () => {
    // The Radix ramps stay in colors.css for components that still name a
    // numbered step. The token layer is not allowed to reach for them: two sets
    // of values for one role is the drift this change removes.
    const ramps =
      "slate|mauve|sage|olive|sand|gray|blue|indigo|iris|violet|purple|plum|pink|crimson|ruby|red|tomato|orange|amber|yellow|lime|green|grass|jade|mint|teal|cyan|sky|bronze|gold|brown";
    const offenders: string[] = [];
    for (const [name, source] of [
      ["light", LIGHT],
      ["dark", DARK],
    ] as const) {
      for (const line of source.split("\n")) {
        if (new RegExp(`var\\(--(?:${ramps})-a?\\d`).test(line)) offenders.push(`${name}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the token layer decides colour, so no role carries a literal value", () => {
    const offenders: string[] = [];
    for (const [name, source] of [
      ["light", LIGHT],
      ["dark", DARK],
    ] as const) {
      for (const line of source.split("\n")) {
        if (/^\s*--/.test(line) && /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(line)) offenders.push(`${name}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the app's own --dls-* aliases point at the semantic layer", () => {
    const aliases: Record<string, string> = {
      "--dls-surface": "var(--card)",
      "--dls-sidebar": "var(--sidebar)",
      "--dls-background": "var(--background)",
      "--dls-app-bg": "var(--background)",
      "--dls-canvas": "var(--background)",
      "--dls-surface-muted": "var(--muted)",
      "--dls-border": "var(--border)",
      "--dls-accent": "var(--primary)",
      "--dls-accent-hover": "var(--primary-hover)",
      "--dls-accent-fg": "var(--primary-foreground)",
      "--dls-text-primary": "var(--foreground)",
      "--dls-text-secondary": "var(--muted-foreground)",
      "--dls-hover": "var(--accent)",
      "--dls-active": "var(--accent-active)",
      "--dls-shell-shadow": "var(--shadow-elevated)",
      "--dls-card-shadow": "var(--shadow-card)",
    };
    const wrong: string[] = [];
    for (const [alias, expected] of Object.entries(aliases)) {
      const value = declaration(LIGHT, alias);
      if (value !== expected) wrong.push(`${alias}: ${value ?? "missing"} (expected ${expected})`);
    }
    expect(wrong).toEqual([]);
  });

  test("the accent channel triplets are the brand blue of each theme", () => {
    // Blue 6 and Blue 5 as components, for the keyframes that need `rgb(... / a)`.
    expect(declaration(LIGHT, "--dls-accent-rgb")).toBe("43 82 255");
    expect(declaration(DARK, "--dls-accent-rgb")).toBe("80 127 255");
    // Gray 7 and Gray 5, matching --muted-foreground in each theme.
    expect(declaration(LIGHT, "--dls-secondary-rgb")).toBe("87 96 113");
    expect(declaration(DARK, "--dls-secondary-rgb")).toBe("170 176 187");
  });

  test("Tailwind utilities exist for the roles the token system adds", () => {
    const theme = block(TOKENS, "@theme inline");
    const missing = [
      "--color-background-secondary",
      "--color-border-subtle",
      "--color-border-strong",
      "--color-subtle-foreground",
      "--color-disabled-foreground",
      "--color-accent-active",
      "--color-primary-hover",
      "--color-primary-muted",
      "--color-primary-soft",
      "--color-primary-ink",
      "--color-success",
      "--color-success-soft",
      "--color-success-ink",
      "--color-success-muted",
      "--color-warning-soft",
      "--color-warning-ink",
      "--color-warning-muted",
      "--color-destructive-soft",
      "--color-destructive-ink",
      "--color-destructive-muted",
      "--color-overlay",
      "--color-tooltip",
    ].filter((name) => declaration(theme, name) === null);
    expect(missing).toEqual([]);
  });

  test("the primary button carries the ink its accent was drawn for", () => {
    // White on Blue 6 and Redrob Black on Blue 5. A fixed `white` here would be
    // 3.6:1 on the dark theme's lighter accent.
    const button = /\.ow-button-primary \{([\s\S]*?)\n\}/.exec(TOKENS);
    expect(button).not.toBeNull();
    expect(declaration(button![1], "color")).toBe("var(--dls-accent-fg)");
    expect(declaration(button![1], "background")).toBe("var(--dls-accent)");
  });

  test("the terminal paints in brand primitives", () => {
    // xterm draws to a canvas, so it takes values rather than tokens. They still
    // have to be the brand's, and the stack has to be the mono token's.
    const dock = readFileSync(
      join(APP_ROOT, "src/react-app/domains/session/terminal/terminal-dock.tsx"),
      "utf8",
    );
    const theme = /theme: \{([\s\S]*?)\n      \}/.exec(dock);
    expect(theme).not.toBeNull();
    const allowed = new Set(["#0a0b0c", "#f8f9fb", "#ffffff", "#292e37"]);
    const used = [...theme![1].matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((hex) => !allowed.has(hex))).toEqual([]);
    expect(dock).toContain("'JetBrains Mono', ui-monospace");
  });

  test("the focus ring is drawn at full opacity", () => {
    // Under the 3:1 a focus indicator has to clear, a half-opacity wash of the
    // ring colour does not qualify.
    expect(TOKENS).toContain("@apply border-border outline-ring;");
    expect(TOKENS).not.toContain("outline-ring/50");
  });
});

describe("Redrob product typeface", () => {
  test("the sans stack names Pretendard first, and heading is an alias of it", () => {
    const theme = block(TOKENS, "@theme inline");
    const sans = declaration(theme, "--font-sans");
    expect(sans).toContain('"Pretendard Variable"');
    expect(sans).toContain("Pretendard,");
    expect(declaration(theme, "--font-heading")).toBe("var(--font-sans)");
  });

  test("body copy takes the token rather than its own stack", () => {
    const bodyRule = /\nbody \{\n  margin: 0;([\s\S]*?)\n\}/.exec(TOKENS);
    expect(bodyRule).not.toBeNull();
    expect(declaration(bodyRule![1], "font-family")).toBe("var(--font-sans)");
  });

  test("the face behind the name ships with the app", () => {
    const woff2 = join(APP_ROOT, "src/assets/fonts/PretendardVariable.woff2");
    expect(existsSync(woff2)).toBe(true);
    // A variable face, so one file covers every weight the UI asks for.
    expect(statSync(woff2).size).toBeGreaterThan(1_000_000);
    expect(readFileSync(woff2).subarray(0, 4).toString("latin1")).toBe("wOF2");
    expect(FONTS).toContain('font-family: "Pretendard Variable"');
    expect(FONTS).toContain("font-weight: 45 920");
    expect(FONTS).toContain("../assets/fonts/PretendardVariable.woff2");
    // OFL-1.1 requires the licence travel with the font.
    expect(existsSync(join(APP_ROOT, "src/assets/fonts/LICENSE-Pretendard.txt"))).toBe(true);
  });

  test("the face is vendored rather than fetched from a CDN at runtime", () => {
    expect(FONTS).not.toMatch(/https?:\/\//);
  });

  test("no typeface outside product typography is loaded", () => {
    // Geist, IBM Plex, Inter and Fraunces are not part of product typography, so
    // nothing may import a font package and the only declared face is Pretendard.
    const imports = TOKENS.split("\n").filter((line) => line.startsWith("@import"));
    expect(imports.filter((line) => /fontsource|font/i.test(line) && !line.includes("styles/fonts.css"))).toEqual([]);
    expect(readFileSync(join(APP_ROOT, "package.json"), "utf8").includes("fontsource")).toBe(false);
    const families = [...FONTS.matchAll(/font-family:\s*([^;]+);/g)].map((match) => match[1].trim());
    expect(families).toEqual(['"Pretendard Variable"']);
  });
});

describe("Redrob branding surfaces", () => {
  test("the browser chrome colour is the page colour of each theme", () => {
    expect(INDEX_HTML).toContain('content="#f8f9fb" media="(prefers-color-scheme: light)"');
    expect(INDEX_HTML).toContain('content="#141719" media="(prefers-color-scheme: dark)"');
  });

  test("the installable app is Redrob Work, on the brand page colour", () => {
    expect(MANIFEST.name).toBe("Redrob Work");
    expect(MANIFEST.short_name).toBe("Redrob Work");
    expect(MANIFEST.theme_color).toBe("#f8f9fb");
    expect(MANIFEST.background_color).toBe("#f8f9fb");
    for (const icon of MANIFEST.icons) {
      expect(existsSync(join(APP_ROOT, "public", icon.src.replace(/^\//, "")))).toBe(true);
    }
  });

  test("MCP App cards read the host's semantic roles", () => {
    const frame = readFileSync(join(APP_ROOT, "src/components/chat/mcp-app-frame.tsx"), "utf8");
    const sources = /const HOST_STYLE_SOURCES[^=]*=\s*\{([\s\S]*?)\n\}/.exec(frame);
    expect(sources).not.toBeNull();
    const mapping = sources![1];
    expect(mapping).toContain('"--color-background-primary": "--card"');
    expect(mapping).toContain('"--color-text-danger": "--destructive-ink"');
    expect(mapping).toContain('"--color-border-success": "--success"');
    // No Radix step reaches a third-party card either.
    expect(mapping).not.toMatch(/"--(?:green|amber|red|blue|slate)-a?\d+"/);
  });

  test("a card falls back to Redrob primitives when a host sends no theme", () => {
    // The card stylesheet ships inside the card document, so its fallbacks are
    // values. They are still brand values, not a nearby grey.
    const cardTheme = readFileSync(
      join(APP_ROOT, "..", "..", "packages/mcp-apps/src/shared/theme.css"),
      "utf8",
    );
    const brandValues = new Set([
      ...Object.values(BRAND_PRIMITIVES),
      // Status levels 1 and 3, which the card uses for its tinted strips.
      "#d6ffe1",
      "#ffedda",
      "#ffe8e1",
      "#eff4ff",
    ]);
    const offenders = [...cardTheme.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
      .map((match) => match[0])
      .filter((hex) => !brandValues.has(hex));
    expect(offenders).toEqual([]);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * The stylesheet Tailwind actually emits
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Everything above reads source files. That catches a class somebody wrote and
 * misses a colour the build puts there on its own: a step of a ramp nobody
 * remembered was still bound, a Tailwind default underneath an `@theme inline`
 * override, a utility that compiles because a namespace was never cleared. And
 * nobody reviewing this on a machine without a screen can see any of it.
 *
 * So this compiles the app's own stylesheet with Tailwind v4's compiler, against
 * every class token in `src`, and reads every colour out of the result. Vendor
 * stylesheets are resolved to nothing on purpose: katex, shadcn and tw-animate-css
 * carry their own palettes and this is a check on ours.
 *
 * The rule: an emitted colour is a value `redrob-tokens.css` declares, or pure black,
 * or pure white, or a step of the Radix gray ramp, which is the one numbered ramp
 * `colors.css` still declares and the other half of this migration. That exception is
 * counted rather than waved through, so it can only shrink.
 */
const VENDOR_STYLESHEETS = ["katex", "shadcn", "tw-animate-css"];

async function compileAppStylesheet(): Promise<string> {
  const { compile } = (await import("tailwindcss")) as {
    compile: (
      css: string,
      options: {
        base: string;
        loadStylesheet: (
          id: string,
          base: string,
        ) => { path: string; base: string; content: string };
        loadModule: () => Promise<{ module: unknown; base: string }>;
      },
    ) => Promise<{ build: (candidates: string[]) => string }>;
  };
  const tailwindRoot = join(APP_ROOT, "node_modules/tailwindcss");
  const appBase = join(APP_ROOT, "src/app");

  const loadStylesheet = (id: string, base: string) => {
    if (id === "tailwindcss" || id.startsWith("tailwindcss/")) {
      const path =
        id === "tailwindcss"
          ? join(tailwindRoot, "index.css")
          : join(tailwindRoot, id.slice("tailwindcss/".length));
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    }
    if (id.startsWith(".")) {
      const path = join(base, id);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    }
    // A vendor stylesheet, and its palette is not ours to police. Anything not on the
    // list is a new third-party import and fails here rather than passing silently.
    expect(
      VENDOR_STYLESHEETS.some((name) => id.startsWith(name)),
      `unknown stylesheet import ${id}`,
    ).toBe(true);
    return { path: id, base, content: "" };
  };

  const compiler = await compile(readFileSync(join(appBase, "index.css"), "utf8"), {
    base: appBase,
    loadStylesheet,
    loadModule: async () => ({ module: {}, base: appBase }),
  });

  const candidates = new Set<string>();
  for (const file of walkFiles(join(APP_ROOT, "src"))) {
    if (!/\.(tsx?|html)$/.test(file)) continue;
    for (const match of readFileSync(file, "utf8").matchAll(
      /[a-zA-Z0-9@!:_\-./[\]()%#*]+/g,
    )) {
      candidates.add(match[0]);
    }
  }
  return compiler.build([...candidates]);
}

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

/** `#abc`, `#abcd`, `#aabbcc` and `#aabbccdd` all to `aabbcc`. */
function sixDigits(hex: string): string {
  const value = hex.replace("#", "").toLowerCase();
  if (value.length === 3 || value.length === 4) {
    return value
      .slice(0, 3)
      .split("")
      .map((channel) => channel + channel)
      .join("");
  }
  return value.slice(0, 6);
}

/** Every colour in a stylesheet, as six hex digits, hex notation and `rgb()` alike. */
function stylesheetColours(css: string): string[] {
  const found: string[] = [];
  for (const match of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) found.push(sixDigits(match[0]));
  for (const match of css.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)) {
    found.push(
      [match[1], match[2], match[3]]
        .map((part) => Number(part).toString(16).padStart(2, "0"))
        .join(""),
    );
  }
  return found;
}

const BRAND_VALUES = new Set(
  [...PRIMITIVES.matchAll(/#([0-9a-fA-F]{3,8})\b/g)].map((match) => sixDigits(match[0])),
);
const RADIX_GRAY = new Set(
  [...readFileSync(join(APP_ROOT, "src/styles/colors.css"), "utf8").matchAll(
    /--(?:gray|black|white)-a?\d+:\s*([^;]+);/g,
  )]
    .flatMap((match) => [
      ...match[1].matchAll(/#[0-9a-fA-F]{3,8}\b/g),
      ...match[1].matchAll(/rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+/g),
    ])
    .map((match) =>
      match[0].startsWith("#")
        ? sixDigits(match[0])
        : (/(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(match[0]) as RegExpExecArray)
            .slice(1)
            .map((part) => Number(part).toString(16).padStart(2, "0"))
            .join(""),
    ),
);

describe("the emitted stylesheet", () => {
  /**
   * The numbered ramps, counted so the number can only fall.
   *
   * Thirty of the thirty-one Radix ramps are at zero. `red`, `amber` and `green` were
   * the status vocabulary at 301 call sites, `blue` was the accent at 54, and the rest
   * were categories: an artifact icon by file type, an extension by kind, a mention
   * chip by what it mentions. The status roles took the first group, `--primary` took
   * the second and the accent spectrum took the third.
   *
   * `gray` is the exception and it is written as a ceiling rather than deleted, because
   * the number is the point: it is the neutral ramp and moving it is the other half of
   * this migration, with `--foreground`, `--muted-foreground`, `--border` and `--muted`
   * declared and waiting.
   */
  test("names no numbered ramp the palette has stopped offering", () => {
    const budget: Record<string, number> = {
      red: 0, orange: 0, amber: 0, yellow: 0, lime: 0, green: 0, emerald: 0, teal: 0,
      cyan: 0, sky: 0, blue: 0, indigo: 0, violet: 0, purple: 0, fuchsia: 0, pink: 0,
      rose: 0, slate: 0, zinc: 0, neutral: 0, stone: 0, bronze: 0, brown: 0,
      crimson: 0, gold: 0, grass: 0, iris: 0, jade: 0, mauve: 0, mint: 0, olive: 0,
      plum: 0, ruby: 0, sage: 0, sand: 0, tomato: 0,
      // The neutral ramp, and the other half of this migration.
      gray: 428,
    };
    const sources = walkFiles(join(APP_ROOT, "src"))
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const [hue, allowed] of Object.entries(budget)) {
      const pattern = new RegExp(
        `\\b(?:bg|text|border|ring|outline|from|via|to|divide|placeholder|decoration|fill|stroke|shadow|caret|accent)-${hue}-a?\\d{1,3}(?:\\/\\d+)?\\b`,
        "g",
      );
      expect((sources.match(pattern) ?? []).length, `${hue} call sites`).toBeLessThanOrEqual(
        allowed,
      );
    }
  });

  test("paints with nothing but declared values", async () => {
    const css = await compileAppStylesheet();
    expect(css.length).toBeGreaterThan(50_000);
    const offenders = new Map<string, number>();
    for (const colour of stylesheetColours(css)) {
      if (BRAND_VALUES.has(colour)) continue;
      if (colour === "000000" || colour === "ffffff") continue;
      if (RADIX_GRAY.has(colour)) continue;
      offenders.set(colour, (offenders.get(colour) ?? 0) + 1);
    }
    expect(
      [...offenders].map(([colour, count]) => `#${colour} x${count}`),
      "colours in the built stylesheet that no Redrob token and no gray step declares",
    ).toEqual([]);
  });

  /**
   * And the Radix exception, counted. Gray is the one numbered ramp left and it is 428
   * call sites; every other ramp is deleted from `colors.css` rather than merely
   * unbound, because an unreachable ramp still ships in every build. The number below
   * is the gray ramp and nothing else, so a hue coming back shows up as a rise here
   * even before anybody writes a class for it.
   */
  test("declares one numbered ramp and no more", () => {
    const colours = readFileSync(join(APP_ROOT, "src/styles/colors.css"), "utf8");
    const ramps = new Set(
      [...colours.matchAll(/^\s*--([a-z]+)-a?\d+:/gm)].map((match) => match[1]),
    );
    expect([...ramps].sort()).toEqual(["black", "gray", "white"]);
    expect(RADIX_GRAY.size).toBeLessThanOrEqual(58);
  });

  /**
   * Named specifically, because "not a Redrob value" is a large set and these are the
   * ones that were here. A step-9 fill and a step-11 ink are the fingerprints: if one
   * of them is back, somebody wrote `bg-red-9` or `text-amber-11` again.
   */
  test("keeps no step of a status hue Radix or Tailwind supplies", async () => {
    const css = await compileAppStylesheet();
    const present = new Set(stylesheetColours(css));
    const fingerprints: Record<string, string> = {
      // Radix, the palette this app was drawing statuses from.
      "radix red 9": "e5484d",
      "radix red 11": "ce2c31",
      "radix amber 9": "ffc53d",
      "radix amber 11": "ab6400",
      "radix green 9": "30a46c",
      "radix green 11": "218358",
      "radix blue 9": "0090ff",
      "radix blue 11": "0d74ce",
      "radix sky 11": "00749e",
      "radix indigo 9": "3e63dd",
      "radix violet 9": "6e56cf",
      "radix teal 9": "12a594",
      "radix cyan 9": "00a2c7",
      "radix orange 9": "f76b15",
      "radix pink 9": "d6409f",
      "radix purple 9": "8e4ec6",
      "radix slate 9": "8b8d98",
      // Tailwind's own, which an `extend` left reachable underneath the ramps.
      "tailwind red 500": "ef4444",
      "tailwind amber 500": "f59e0b",
      "tailwind emerald 500": "10b981",
      "tailwind sky 500": "0ea5e9",
      "tailwind violet 500": "8b5cf6",
      "tailwind red 50": "fef2f2",
      "tailwind amber 50": "fffbeb",
      "tailwind emerald 50": "ecfdf5",
    };
    for (const [name, value] of Object.entries(fingerprints)) {
      expect(present.has(value), `${name} (#${value}) is back in the build`).toBe(false);
    }
  });

  /**
   * A `dark:` twin that reads a role is a mistake rather than a nicety: the role
   * already carries the theme, so `dark:bg-warning-soft` beside `bg-warning-soft` is
   * the same declaration twice and the pair drifts the day one of them is edited.
   *
   * Scoped to the status and spectrum roles this migration put in, and to classes with
   * no alpha on them. `dark:ring-destructive/40` beside `ring-destructive/20` is the
   * vendored shadcn idiom and is a different value in each theme rather than a
   * restatement of one.
   */
  test("writes no dark twin for a role that carries its own theme", () => {
    const roles = [
      "success",
      "success-soft",
      "success-muted",
      "success-ink",
      "warning",
      "warning-soft",
      "warning-muted",
      "warning-ink",
      "destructive-soft",
      "destructive-muted",
      "destructive-ink",
      "primary-soft",
      "primary-muted",
      "primary-ink",
      "spectrum-teal",
      "spectrum-sky",
      "spectrum-violet",
      "spectrum-pink",
      "spectrum-red",
      "spectrum-orange",
      "spectrum-yellow",
      "spectrum-lime",
      "spectrum-green",
    ];
    const offenders: string[] = [];
    for (const file of walkFiles(join(APP_ROOT, "src"))) {
      if (!/\.tsx?$/.test(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const role of roles) {
        for (const match of source.matchAll(
          new RegExp(
            `\\bdark:(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|divide|outline)-${role}(?![\\w/-])`,
            "g",
          ),
        )) {
          offenders.push(`${file.slice(APP_ROOT.length + 1)}: ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * No component may name a colour of its own either.
   *
   * The session page painted itself `var(--app-bg, #0b1020)`, and `--app-bg` is not a
   * token this app declares: the fallback was the colour, in both themes, under text
   * that assumed a light page. The role is `--dls-app-bg`. That is the failure mode a
   * literal in a component has, and it is why they are counted here.
   *
   * `rgba(var(--dls-accent-rgb), 0.2)` is not one: those channels are a token, declared
   * as channels for exactly this reason, and pure white and pure black at an alpha are
   * a scrim rather than a choice from the palette.
   */
  test("lets no component name a colour of its own", () => {
    const arbitrary = /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration)-\[[^\]]*\]/g;
    const literal = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\(\s*\d/;
    const scrim = /^(?:rgba?\(\s*(?:0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\b)/;
    const offenders: string[] = [];
    for (const file of walkFiles(join(APP_ROOT, "src"))) {
      if (!/\.tsx?$/.test(file)) continue;
      for (const match of readFileSync(file, "utf8").matchAll(arbitrary)) {
        const value = match[0];
        if (!literal.test(value)) continue;
        // Pure black and pure white at an alpha are a scrim, not a palette choice.
        const numeric = [...value.matchAll(/(?:rgba?|hsla?)\([^)]*/g)].map((m) => m[0]);
        if (numeric.length > 0 && numeric.every((n) => scrim.test(n.replace(/^[a-z]*/, (h) => h)))) {
          continue;
        }
        offenders.push(`${file.slice(APP_ROOT.length + 1)}: ${value}`);
      }
    }
    // The voice orb hands a four-colour palette to a WebGL gradient rather than to
    // CSS, so it is not in this set; it is still off palette and named in the report.
    expect(offenders).toEqual([]);
  });
});
