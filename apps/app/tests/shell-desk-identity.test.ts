import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * The app frame as the design system's Desk product, and the first paint that
 * frame depends on. These read source because the sidebar and the document
 * head only exist in a running window.
 */
const APP_ROOT = join(import.meta.dir, "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const appRequire = createRequire(join(APP_ROOT, "package.json"));
const DS_TOKENS = readFileSync(appRequire.resolve("@redrob-labs/ui/tokens.css"), "utf8");
const DS_SYSTEM = readFileSync(appRequire.resolve("@redrob-labs/ui/styles.css"), "utf8");
const INDEX_CSS = read("src/app/index.css");

describe("Redrob Cowork is the Desk product", () => {
  test("the sidebar declares the Desk product", () => {
    const sidebar = read("src/react-app/domains/session/sidebar/app-sidebar.tsx");
    expect(sidebar).toMatch(/<Sidebar\b[^>]*data-product="desk"/s);
    // The header's divider is the product line.
    expect(sidebar).toContain("border-(--app-product-line)");
  });

  test("the Desk roles read the design system's Desk tokens", () => {
    const desk = /\[data-product="desk"\] \{([^}]*)\}/.exec(INDEX_CSS);
    expect(desk).not.toBeNull();
    expect(desk![1]).toContain("--app-product-mark: var(--product-desk);");
    expect(desk![1]).toContain("--app-product-wash: var(--product-desk-wash);");
    expect(desk![1]).toContain("--app-product-line: var(--product-desk-line);");
    for (const token of ["--product-desk:", "--product-desk-wash:", "--product-desk-line:"]) {
      expect(DS_TOKENS, token).toContain(token);
    }
    expect(DS_TOKENS).toContain("--product-desk: #d87101;");
  });

  test("the rail wash is the design system's AppShell wash, 132px and 55% on dark", () => {
    // The design system's own rule, which the app's rail mirrors.
    expect(DS_SYSTEM).toContain("linear-gradient(180deg, var(--product-wash) 0, transparent 132px)");
    expect(INDEX_CSS).toContain(
      "[data-product] [data-sidebar=\"sidebar\"] {\n  background-image: linear-gradient(180deg, var(--app-product-wash) 0, transparent 132px);",
    );
    expect(INDEX_CSS).toContain("color-mix(in srgb, var(--product-desk-wash) 55%, transparent)");
  });

  test("the work area is a design-system card", () => {
    const page = read("src/react-app/domains/session/chat/session-page.tsx");
    expect(page).toMatch(/<main className="[^"]*lg:rounded-\(--card-radius\)[^"]*lg:shadow-card/);
    expect(page).not.toContain("rgba(15,23,42");
  });

  test("the window keeps every drag region, including the macOS traffic-light offsets", () => {
    const sidebar = read("src/react-app/domains/session/sidebar/app-sidebar.tsx");
    expect(sidebar).toContain("mac:titlebar-drag");
    expect(sidebar).toContain("mac:titlebar-no-drag");
    const page = read("src/react-app/domains/session/chat/session-page.tsx");
    expect(page).toContain("mac:titlebar-drag");
  });
});

/**
 * The inline script in the document head sets `data-theme` before the stylesheet
 * paints. It read only the legacy `redrob.themePref` key while `theme.ts` writes
 * `redrob.react.settings.theme-mode`, so someone who chose dark after the
 * migration got a white first frame - on the design system's white page that is
 * a full-window flash. The script is run here against a stub document.
 */
function prePaintScript(rel: string): string {
  const html = read(rel);
  const script = /<script>\s*([\s\S]*?prefers-color-scheme[\s\S]*?)<\/script>/.exec(html);
  expect(script, `${rel} pre-paint script`).not.toBeNull();
  return script![1];
}

function firstPaint(script: string, stored: Record<string, string>, prefersDark: boolean): string | undefined {
  const dataset: Record<string, string> = {};
  const documentStub = { documentElement: { dataset, style: { colorScheme: "" } } };
  const windowStub = { matchMedia: () => ({ matches: prefersDark }) };
  const storage = { getItem: (key: string) => stored[key] ?? null };
  new Function("document", "window", "localStorage", script)(documentStub, windowStub, storage);
  return dataset.theme;
}

describe("the first paint is the theme the app applies", () => {
  const THEME_KEY = /const THEME_PREF_KEY = "([^"]+)"/.exec(read("src/app/theme.ts"))?.[1];

  test("theme.ts still writes the key the pre-paint script reads first", () => {
    expect(THEME_KEY).toBe("redrob.react.settings.theme-mode");
  });

  for (const rel of ["index.html", "overlay.html"]) {
    test(`${rel} reads the current key before the legacy one`, () => {
      const script = prePaintScript(rel);
      expect(firstPaint(script, { [THEME_KEY!]: "dark" }, false)).toBe("dark");
      expect(firstPaint(script, { [THEME_KEY!]: "light", "redrob.themePref": "dark" }, true)).toBe("light");
      expect(firstPaint(script, { "redrob.themePref": "dark" }, false)).toBe("dark");
      expect(firstPaint(script, {}, true)).toBe("dark");
      expect(firstPaint(script, { [THEME_KEY!]: "nonsense" }, false)).toBe("light");
    });
  }
});
