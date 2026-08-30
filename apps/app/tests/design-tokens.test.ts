import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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
  ["--warning", "--rr-orange-4", "--rr-orange-3"],
  ["--destructive", "--rr-red-4", "--rr-red-3"],
  ["--tooltip", "--rr-gray-9", "--rr-black"],
  ["--sidebar", "--rr-white", "--rr-black"],
  ["--sidebar-primary", "--rr-blue-6", "--rr-blue-5"],
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
      "--color-warning-soft",
      "--color-warning-ink",
      "--color-destructive-soft",
      "--color-destructive-ink",
      "--color-overlay",
      "--color-tooltip",
    ].filter((name) => declaration(theme, name) === null);
    expect(missing).toEqual([]);
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
