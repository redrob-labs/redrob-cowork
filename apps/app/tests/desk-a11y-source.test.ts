import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Accessibility checks that read the Desk source rather than render it: every icon-only
 * button names itself, every tab list is labelled, and every Desk animation or transition
 * stops for people who ask for reduced motion.
 */

const deskRoot = join(import.meta.dir, "../src/react-app/desk");
const cssPath = join(import.meta.dir, "../src/app/index.css");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

const sources = sourceFiles(deskRoot).map((path) => ({ file: relative(deskRoot, path), text: readFileSync(path, "utf8") }));

/** The opening JSX tag that starts at `start`, up to its closing `>` (braces balanced). */
function tagAt(text: string, start: number): string {
  let depth = 0;
  let end = start + 1;
  for (; end < text.length; end += 1) {
    const char = text[end];
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) break;
  }
  return text.slice(start, end + 1);
}

/** Every opening JSX tag named `tag`. */
function openingTags(text: string, tag: string): string[] {
  return [...text.matchAll(new RegExp(`<${tag}(?=[\\s>/])`, "g"))].map((match) => tagAt(text, match.index));
}

/** The opening tag holding each `role="tablist"`: the nearest `<` before it. */
function tablistTags(text: string): string[] {
  return [...text.matchAll(/role=(?:"tablist"|\{"tablist"\})/g)].map((match) => tagAt(text, text.lastIndexOf("<", match.index)));
}

const MOTION: Array<"animation" | "transition"> = ["animation", "transition"];

type CssRule = { selectors: string[]; media: string[]; declarations: Map<string, string> };

/** Style rules of a stylesheet with the at-rules around each; enough for index.css. */
function cssRules(css: string): CssRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];
  const stack: Array<{ prelude: string; rule: CssRule | null }> = [];
  let buffer = "";
  for (const char of text) {
    if (char === "{") {
      const prelude = buffer.trim();
      buffer = "";
      const isAtRule = prelude.startsWith("@");
      const rule: CssRule | null = isAtRule
        ? null
        : {
            selectors: prelude.split(",").map((selector) => selector.trim()),
            media: stack.map((entry) => entry.prelude).filter((entry) => entry.startsWith("@")),
            declarations: new Map(),
          };
      if (rule) rules.push(rule);
      stack.push({ prelude, rule });
    } else if (char === "}" || char === ";") {
      const current = stack.at(-1)?.rule;
      const declaration = buffer.trim();
      const colon = declaration.indexOf(":");
      if (current && colon > 0) current.declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
      buffer = "";
      if (char === "}") stack.pop();
    } else {
      buffer += char;
    }
  }
  return rules;
}

describe("desk accessibility, from the source", () => {
  test("every IconButton in desk code has a label", () => {
    const tags = sources.flatMap(({ file, text }) => openingTags(text, "IconButton").map((tag) => ({ file, tag })));
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.filter(({ tag }) => !/\slabel=/.test(tag)).map(({ file, tag }) => `${file}: ${tag}`)).toEqual([]);
  });

  test("every desk tab list has an aria-label", () => {
    const tags = sources.flatMap(({ file, text }) => tablistTags(text).map((tag) => ({ file, tag })));
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.filter(({ tag }) => !/\saria-label(?:ledby)?=/.test(tag)).map(({ file, tag }) => `${file}: ${tag}`)).toEqual([]);
  });

  test("every desk animation and transition is off under prefers-reduced-motion", () => {
    const rules = cssRules(readFileSync(cssPath, "utf8"));
    const isDesk = (selector: string) => /^\.desk[-_\w]*/.test(selector);
    const reduced = rules.filter((rule) => rule.media.some((media) => /prefers-reduced-motion:\s*reduce/.test(media)));
    const neutralized = (selector: string, property: "animation" | "transition") =>
      reduced.some((rule) => rule.selectors.includes(selector) && rule.declarations.get(property) === "none");

    const moving = rules
      .filter((rule) => !reduced.includes(rule))
      .flatMap((rule) =>
        MOTION
          .filter((property) => {
            const value = rule.declarations.get(property);
            return value !== undefined && value !== "none";
          })
          .flatMap((property) => rule.selectors.filter(isDesk).map((selector) => ({ selector, property }))),
      );

    expect(moving.length).toBeGreaterThan(0);
    expect(moving.filter(({ selector, property }) => !neutralized(selector, property)).map(({ selector, property }) => `${selector} { ${property} }`)).toEqual([]);
  });
});
