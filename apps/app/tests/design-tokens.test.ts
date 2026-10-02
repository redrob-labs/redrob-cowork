import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Redrob Cowork draws its colour from the Redrob Group Design System 2026
 * (`@redrob-labs/ui`). The design system's `tokens.css` is the primitive and
 * semantic layer; this app declares no colour value of its own and points the
 * role names its component library already speaks at that layer.
 *
 * These assertions are the part a screenshot cannot decide: that the package
 * carries the brand's confirmed values, that each role reads the token the
 * mapping gives it, that every token a role reads is one the design system
 * actually declares (an undeclared custom property fails silently), that no
 * role has drifted back onto a Radix ramp, and that the product typeface is the
 * one Pretendard face rather than a name with nothing behind it.
 */
const APP_ROOT = join(import.meta.dir, "..");

/**
 * Source text with LF line endings. A Windows checkout with `core.autocrlf` hands
 * these files over as CRLF, and the selectors and rules below are matched against
 * `\n`, so without this the suite failed to load there rather than checking anything.
 */
function readText(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const TOKENS = readText(join(APP_ROOT, "src/app/index.css"));
const FONTS = readText(join(APP_ROOT, "src/styles/fonts.css"));
/** Resolves through the app's own dependency graph, the way Vite does. */
const appRequire = createRequire(join(APP_ROOT, "package.json"));
/** The Redrob Group Design System 2026, the package the app imports its tokens from. */
const DESIGN_SYSTEM_TOKENS = readText(appRequire.resolve("@redrob-labs/ui/tokens.css"));
/** The same tokens with every `var()` chain resolved per theme, as the package publishes them. */
const DESIGN_SYSTEM_RESOLVED = new Map(
  (
    JSON.parse(readText(appRequire.resolve("@redrob-labs/ui/tokens.json"))) as {
      tokens: Array<{ name: string; light: string; dark: string }>;
    }
  ).tokens.map((token) => [`--${token.name}`, token]),
);
const INDEX_HTML = readText(join(APP_ROOT, "index.html"));
const MANIFEST = JSON.parse(readText(join(APP_ROOT, "public/manifest.webmanifest"))) as {
  name: string;
  short_name: string;
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string }>;
};

/** The brand's confirmed values, as the design system declares them. */
const BRAND_PRIMITIVES: Record<string, string> = {
  "--redrob-black": "#0a0b0c",
  "--redrob-white": "#ffffff",
  "--blue-1": "#eef4ff",
  "--blue-3": "#bad2ff",
  "--blue-4": "#8aafff",
  "--blue-5": "#507fff",
  "--blue-6": "#2b52ff",
  "--blue-7": "#1733d5",
  "--blue-8": "#09209c",
  "--blue-10": "#030c34",
  "--gray-1": "#f8f9fb",
  "--gray-2": "#eff1f4",
  "--gray-3": "#dfe2e8",
  "--gray-4": "#cbcfd7",
  "--gray-5": "#aab0bb",
  "--gray-6": "#7c8390",
  "--gray-7": "#576071",
  "--gray-8": "#292e37",
  "--gray-9": "#141719",
  "--accent-green-4": "#00864a",
  "--accent-orange-4": "#ae5100",
  "--accent-red-4": "#a31310",
  "--accent-sky-4": "#0e51b6",
};

/** Every primitive step the roles below rely on, so a renamed or dropped step is caught. */
const REQUIRED_PRIMITIVE_STEPS = [
  ...Array.from({ length: 10 }, (_, index) => `--blue-${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `--gray-${index + 1}`),
  ...["teal", "sky", "violet", "pink", "red", "orange", "yellow", "lime", "green"].flatMap((hue) =>
    Array.from({ length: 5 }, (_, index) => `--accent-${hue}-${index + 1}`),
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

/** Roles that alias a design-system token and so follow the theme by themselves. */
const ROLES = block(TOKENS, ":root,\n[data-theme]");
/** Per-theme choices for the roles the design system does not name. */
const LIGHT_ONLY = block(TOKENS, ':root,\n[data-theme="light"]');
const DARK_ONLY = block(TOKENS, '[data-theme="dark"]');
/** What a light and a dark element each see: the shared roles plus that theme's choices. */
const LIGHT = `${ROLES}\n${LIGHT_ONLY}`;
const DARK = `${ROLES}\n${DARK_ONLY}`;

/** Role and the design-system token it aliases, in both themes. */
const ROLE_ALIASES: Array<[string, string]> = [
  ["--background", "--surface-base"],
  ["--background-secondary", "--surface-sunken"],
  ["--foreground", "--ink-primary"],
  ["--card", "--surface-raised"],
  ["--popover", "--surface-raised"],
  ["--material", "--surface-material"],
  ["--muted-foreground", "--ink-secondary"],
  ["--subtle-foreground", "--ink-muted"],
  ["--accent", "--surface-sunken"],
  ["--accent-active", "--border-subtle"],
  ["--secondary", "--surface-sunken"],
  ["--muted", "--surface-sunken"],
  ["--primary", "--action-primary"],
  ["--primary-foreground", "--ink-on-brand"],
  ["--primary-hover", "--action-primary-hover"],
  ["--primary-muted", "--border-ai"],
  ["--primary-soft", "--surface-brand-subtle"],
  ["--primary-ink", "--ink-brand"],
  // `--app-` because the design system means something else by `--border-subtle`;
  // see design-system-collisions.test.ts.
  ["--app-border-subtle", "--surface-sunken"],
  ["--border", "--border-subtle"],
  ["--input", "--border-strong"],
  ["--ring", "--focus-ring"],
  ["--success", "--status-success"],
  ["--success-ink", "--status-success"],
  ["--warning", "--status-warning"],
  ["--warning-ink", "--status-warning"],
  ["--destructive", "--status-danger"],
  ["--destructive-ink", "--status-danger"],
  ["--info", "--status-info"],
  ["--info-ink", "--status-info"],
  ["--overlay", "--overlay-scrim"],
  ["--sidebar", "--surface-raised"],
  ["--sidebar-primary", "--action-primary"],
  ["--sidebar-border", "--border-subtle"],
  ["--sidebar-ring", "--focus-ring"],
  ["--shadow-soft", "--shadow-sm"],
  ["--shadow-card", "--shadow-md"],
  ["--shadow-elevated", "--shadow-lg"],
];

/** Role, light primitive, dark primitive: the roles the design system leaves to the app. */
const THEMED_CHOICES: Array<[string, string, string]> = [
  ["--disabled-foreground", "--gray-5", "--gray-7"],
  // Decorative emphasis, not a control boundary; `--input` is the boundary.
  ["--app-border-strong", "--gray-4", "--gray-7"],
  ["--success-foreground", "--redrob-white", "--redrob-black"],
  ["--success-soft", "--accent-green-1", "--accent-green-5"],
  ["--success-muted", "--accent-green-2", "--accent-green-4"],
  ["--warning-foreground", "--redrob-white", "--redrob-black"],
  ["--warning-soft", "--accent-orange-1", "--accent-orange-5"],
  ["--warning-muted", "--accent-orange-2", "--accent-orange-4"],
  ["--destructive-foreground", "--redrob-white", "--redrob-black"],
  ["--destructive-soft", "--accent-red-1", "--accent-red-5"],
  ["--destructive-muted", "--accent-red-2", "--accent-red-4"],
  ["--info-foreground", "--redrob-white", "--redrob-black"],
  ["--info-soft", "--accent-sky-1", "--accent-sky-5"],
  ["--info-muted", "--accent-sky-2", "--accent-sky-4"],
  ["--tooltip", "--gray-9", "--redrob-black"],
  ["--spectrum-teal", "--accent-teal-5", "--accent-teal-3"],
  ["--spectrum-sky", "--accent-sky-4", "--accent-sky-3"],
  ["--spectrum-violet", "--accent-violet-4", "--accent-violet-3"],
  ["--spectrum-pink", "--accent-pink-4", "--accent-pink-3"],
  ["--spectrum-red", "--accent-red-4", "--accent-red-3"],
  ["--spectrum-orange", "--accent-orange-4", "--accent-orange-3"],
  ["--spectrum-yellow", "--accent-yellow-5", "--accent-yellow-3"],
  ["--spectrum-lime", "--accent-lime-5", "--accent-lime-3"],
  ["--spectrum-green", "--accent-green-4", "--accent-green-3"],
];

/** Roles product code reads that must exist in both themes or in neither. */
const THEMED_ROLES = THEMED_CHOICES.map(([role]) => role);

/** `#rrggbb` to the `r g b` channel triplet the keyframes take. */
function channels(hex: string): string {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)).join(" ");
}

describe("Redrob design tokens", () => {
  test("the design system carries the brand's confirmed HEX values", () => {
    const wrong: string[] = [];
    for (const [name, hex] of Object.entries(BRAND_PRIMITIVES)) {
      const value = declaration(DESIGN_SYSTEM_TOKENS, name);
      if (value !== hex) wrong.push(`${name}: ${value ?? "missing"} (expected ${hex})`);
    }
    expect(wrong).toEqual([]);
  });

  test("every primitive step the roles rely on is declared by the design system", () => {
    const missing = REQUIRED_PRIMITIVE_STEPS.filter((name) => declaration(DESIGN_SYSTEM_TOKENS, name) === null);
    expect(missing).toEqual([]);
  });

  test("the app declares no primitive layer of its own", () => {
    // `styles/redrob-tokens.css` was a transcription of the brand ramps. The
    // design system is that layer now, and a second copy is how values drift.
    expect(existsSync(join(APP_ROOT, "src/styles/redrob-tokens.css"))).toBe(false);
    const sources = walkFiles(join(APP_ROOT, "src"))
      .filter((file) => /\.(css|tsx?)$/.test(file))
      .filter((file) => readText(file).includes("--rr-"))
      .map((file) => file.slice(APP_ROOT.length + 1));
    expect(sources).toEqual([]);
  });

  test("each role aliases the design-system token the mapping gives it", () => {
    const wrong: string[] = [];
    for (const [role, token] of ROLE_ALIASES) {
      const value = declaration(ROLES, role);
      if (value !== `var(${token})`) wrong.push(`${role}: ${value ?? "missing"} (expected ${token})`);
      // An alias is declared once, where every themed element resolves it.
      if (declaration(LIGHT_ONLY, role) || declaration(DARK_ONLY, role)) wrong.push(`${role}: has a per-theme twin`);
    }
    expect(wrong).toEqual([]);
  });

  test("each per-theme role sits on the primitive the mapping gives it", () => {
    const wrong: string[] = [];
    for (const [role, light, dark] of THEMED_CHOICES) {
      const lightValue = declaration(LIGHT_ONLY, role);
      const darkValue = declaration(DARK_ONLY, role);
      if (lightValue !== `var(${light})`) wrong.push(`light ${role}: ${lightValue ?? "missing"} (expected ${light})`);
      if (darkValue !== `var(${dark})`) wrong.push(`dark ${role}: ${darkValue ?? "missing"} (expected ${dark})`);
    }
    expect(wrong).toEqual([]);
  });

  test("every token a role reads is one the design system declares or a role the app declares", () => {
    // An undeclared custom property fails silently: the declaration that reads it
    // is dropped and the element falls back to inheritance, with no warning.
    const appRoles = new Set(
      [...`${ROLES}\n${LIGHT_ONLY}\n${DARK_ONLY}`.matchAll(/^\s*(--[\w-]+):/gm)].map((match) => match[1]),
    );
    const unknown = [...`${ROLES}\n${LIGHT_ONLY}\n${DARK_ONLY}`.matchAll(/var\((--[\w-]+)\)/g)]
      .map((match) => match[1])
      .filter((name) => !DESIGN_SYSTEM_RESOLVED.has(name) && !appRoles.has(name));
    expect([...new Set(unknown)]).toEqual([]);
  });

  test("the page is the design system's: White and Redrob Black, with raised surfaces above it", () => {
    expect(DESIGN_SYSTEM_RESOLVED.get("--surface-base")).toMatchObject({ light: "#ffffff", dark: "#0a0b0c" });
    expect(DESIGN_SYSTEM_RESOLVED.get("--surface-raised")).toMatchObject({ light: "#f8f9fb", dark: "#141719" });
    expect(declaration(ROLES, "--background")).toBe("var(--surface-base)");
    expect(declaration(ROLES, "--card")).toBe("var(--surface-raised)");
  });

  test("a subtree can switch theme because the roles resolve on every themed element", () => {
    // Menus and the overlay window set `data-theme="dark"` on themselves. The
    // design system re-declares its tokens there; the roles have to re-resolve
    // there too, which is what the `[data-theme]` half of the selector does.
    expect(TOKENS).toContain(":root,\n[data-theme] {");
    expect(TOKENS).not.toMatch(/^\.dark,/m);
    const subtrees = walkFiles(join(APP_ROOT, "src"))
      .filter((file) => file.endsWith(".tsx"))
      .filter((file) => /className=(?:\{cn\(\s*)?["'`]dark\s/.test(readText(file)))
      .map((file) => file.slice(APP_ROOT.length + 1));
    expect(subtrees).toEqual([]);
  });

  test("floating material falls back to a solid surface where transparency is reduced", () => {
    const reduced = /@media \(prefers-reduced-transparency: reduce\) \{([\s\S]*?)\n\}/.exec(TOKENS);
    expect(reduced).not.toBeNull();
    expect(declaration(reduced![1], "--material")).toBe("var(--surface-raised)");
  });

  test("every themed role is defined in both palettes", () => {
    const lightOnly = THEMED_ROLES.filter((role) => declaration(LIGHT_ONLY, role) && !declaration(DARK_ONLY, role));
    const darkOnly = THEMED_ROLES.filter((role) => declaration(DARK_ONLY, role) && !declaration(LIGHT_ONLY, role));
    expect({ lightOnly, darkOnly }).toEqual({ lightOnly: [], darkOnly: [] });
  });

  test("a status is all five of fill, ink on that fill, soft strip, its edge, and readable text", () => {
    const incomplete: string[] = [];
    for (const status of ["success", "warning", "destructive", "info"]) {
      for (const suffix of ["", "-foreground", "-soft", "-muted", "-ink"]) {
        const role = `--${status}${suffix}`;
        if (!declaration(LIGHT, role)) incomplete.push(`light ${role}`);
        if (!declaration(DARK, role)) incomplete.push(`dark ${role}`);
      }
    }
    expect(incomplete).toEqual([]);
  });

  test("no semantic role reads the Radix ramp", () => {
    // The Radix gray stays in colors.css, as `--radix-gray-*`, for call sites that
    // still name a numbered step. The role layer is not allowed to reach for it.
    const offenders = `${ROLES}\n${LIGHT_ONLY}\n${DARK_ONLY}`
      .split("\n")
      .filter((line) => /var\(--radix-/.test(line))
      .map((line) => line.trim());
    expect(offenders).toEqual([]);
  });

  test("the token layer decides colour, so no role carries a literal value", () => {
    const offenders: string[] = [];
    for (const [name, source] of [
      ["roles", ROLES],
      ["light", LIGHT_ONLY],
      ["dark", DARK_ONLY],
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

  test("the channel triplets are the tokens they stand in for, in each theme", () => {
    // The keyframes need `rgb(... / a)` components rather than a colour, so these
    // are the one place a value is written out. They are checked against the
    // design system's resolved tokens so they cannot drift from the roles.
    const primary = DESIGN_SYSTEM_RESOLVED.get("--action-primary");
    const secondary = DESIGN_SYSTEM_RESOLVED.get("--ink-secondary");
    expect(primary?.light).toBe(primary?.dark);
    expect(declaration(ROLES, "--dls-accent-rgb")).toBe(channels(primary!.light));
    expect(declaration(LIGHT_ONLY, "--dls-secondary-rgb")).toBe(channels(secondary!.light));
    expect(declaration(DARK_ONLY, "--dls-secondary-rgb")).toBe(channels(secondary!.dark));
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
      "--color-material",
      "--color-info",
      "--color-info-soft",
      "--color-info-ink",
      "--color-info-muted",
      "--color-surface-ai",
      "--color-border-ai",
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
    const dock = readText(join(APP_ROOT, "src/react-app/domains/session/terminal/terminal-dock.tsx"));
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
    // `--theme()` rather than `var()`: the design system declares its own
    // `--font-sans`, so a runtime read would take whichever loaded last.
    expect(declaration(theme, "--font-heading")).toBe("--theme(--font-sans)");
  });

  test("body copy takes the token rather than its own stack", () => {
    const bodyRule = /\nbody \{\n  margin: 0;([\s\S]*?)\n\}/.exec(TOKENS);
    expect(bodyRule).not.toBeNull();
    expect(declaration(bodyRule![1], "font-family")).toBe("--theme(--font-sans)");
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
    expect(readText(join(APP_ROOT, "package.json")).includes("fontsource")).toBe(false);
    const families = [...FONTS.matchAll(/font-family:\s*([^;]+);/g)].map((match) => match[1].trim());
    expect(families).toEqual(['"Pretendard Variable"']);
  });
});

describe("Redrob branding surfaces", () => {
  test("the browser chrome colour is the page colour of each theme", () => {
    const page = DESIGN_SYSTEM_RESOLVED.get("--surface-base")!;
    expect(INDEX_HTML).toContain(`content="${page.light}" media="(prefers-color-scheme: light)"`);
    expect(INDEX_HTML).toContain(`content="${page.dark}" media="(prefers-color-scheme: dark)"`);
    // The document paints the page role before React mounts, not a raised surface.
    expect(INDEX_HTML).toContain('<body class="bg-background text-foreground mac:bg-transparent">');
  });

  test("the installable app is Redrob Cowork, on the brand page colour", () => {
    expect(MANIFEST.name).toBe("Redrob Cowork");
    expect(MANIFEST.short_name).toBe("Redrob Cowork");
    expect(MANIFEST.theme_color).toBe(DESIGN_SYSTEM_RESOLVED.get("--surface-base")!.light);
    expect(MANIFEST.background_color).toBe(DESIGN_SYSTEM_RESOLVED.get("--surface-base")!.light);
    for (const icon of MANIFEST.icons) {
      expect(existsSync(join(APP_ROOT, "public", icon.src.replace(/^\//, "")))).toBe(true);
    }
  });

  test("MCP App cards read the host's semantic roles", () => {
    const frame = readText(join(APP_ROOT, "src/components/chat/mcp-app-frame.tsx"));
    const sources = /const HOST_STYLE_SOURCES[^=]*=\s*\{([\s\S]*?)\n\}/.exec(frame);
    expect(sources).not.toBeNull();
    const mapping = sources![1];
    expect(mapping).toContain('"--color-background-primary": "--card"');
    expect(mapping).toContain('"--color-text-danger": "--destructive-ink"');
    expect(mapping).toContain('"--color-border-success": "--success"');
    // No Radix step reaches a third-party card either.
    expect(mapping).not.toMatch(/"--(?:green|amber|red|blue|slate|gray|radix-gray)-a?\d+"/);
    // Every source is a role the app declares, so a renamed role cannot leave a
    // card reading a design-system token by accident.
    for (const [, source] of mapping.matchAll(/:\s*"(--[\w-]+)"/g)) {
      expect(TOKENS, `${source} is not declared`).toMatch(new RegExp(`^\\s*${source}:`, "m"));
    }
  });

  test("a card falls back to design-system values when a host sends no theme", () => {
    // The card stylesheet ships inside the card document, so its fallbacks are
    // values. They are still brand values, not a nearby grey.
    const cardTheme = readText(join(APP_ROOT, "..", "..", "packages/mcp-apps/src/shared/theme.css"));
    const brandValues = new Set(stylesheetColours(DESIGN_SYSTEM_TOKENS));
    const offenders = [...cardTheme.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
      .map((match) => match[0])
      .filter((hex) => !brandValues.has(sixDigits(hex)));
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
 * The rule: an emitted colour is a value the design system declares, or pure black,
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
      return { path, base: dirname(path), content: readText(path) };
    }
    if (id.startsWith(".")) {
      const path = join(base, id);
      return { path, base: dirname(path), content: readText(path) };
    }
    // The design system is compiled for real rather than stubbed: its colours are
    // the palette now, so they are read and held to `DESIGN_SYSTEM_VALUES` below.
    if (id.startsWith("@redrob-labs/ui/")) {
      const path = appRequire.resolve(id);
      return { path, base: dirname(path), content: readText(path) };
    }
    // A vendor stylesheet, and its palette is not ours to police. Anything not on the
    // list is a new third-party import and fails here rather than passing silently.
    expect(
      VENDOR_STYLESHEETS.some((name) => id.startsWith(name)),
      `unknown stylesheet import ${id}`,
    ).toBe(true);
    return { path: id, base, content: "" };
  };

  const compiler = await compile(readText(join(appBase, "index.css")), {
    base: appBase,
    loadStylesheet,
    loadModule: async () => ({ module: {}, base: appBase }),
  });

  const candidates = new Set<string>();
  for (const file of walkFiles(join(APP_ROOT, "src"))) {
    if (!/\.(tsx?|html)$/.test(file)) continue;
    for (const match of readText(file).matchAll(
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

// Every colour the design system declares, in hex and rgba alike. The design
// system is the palette, so its values are declared values by definition.
const BRAND_VALUES = new Set(stylesheetColours(DESIGN_SYSTEM_TOKENS));
const RADIX_GRAY = new Set(
  [...readText(join(APP_ROOT, "src/styles/colors.css")).matchAll(
    /--(?:radix-gray|black|white)-a?\d+:\s*([^;]+);/g,
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
      .map((file) => readText(file))
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
    const colours = readText(join(APP_ROOT, "src/styles/colors.css"));
    const ramps = new Set(
      [...colours.matchAll(/^\s*--(?:radix-)?([a-z]+)-a?\d+:/gm)].map((match) => match[1]),
    );
    expect([...ramps].sort()).toEqual(["black", "gray", "white"]);
    expect(RADIX_GRAY.size).toBeLessThanOrEqual(58);
  });

  /**
   * And the safelist names one ramp too.
   *
   * `@source inline(...)` force-generates a utility whether or not a call site asks for
   * it, and it named all thirty-one ramps at twelve steps across three properties: over
   * a thousand utilities that existed because the line existed. The palette reset makes
   * them resolve to nothing, so they stopped being emitted the moment the ramps went,
   * but the line would generate them again the day a namespace came back. It names gray.
   */
  test("safelists one numbered ramp and no more", () => {
    const inlineSources = [...TOKENS.matchAll(/@source inline\("([^"]+)"\)/g)].map(
      (match) => match[1],
    );
    expect(inlineSources).toEqual(['{bg,text,border}-gray-{1..12}']);
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
      const source = readText(file);
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
      for (const match of readText(file).matchAll(arbitrary)) {
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
