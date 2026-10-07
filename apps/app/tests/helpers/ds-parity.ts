import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Markup parity against the Redrob Group Design System 2026.
 *
 * A primitive in `components/ui` renders the design system's markup while Base UI
 * keeps the behaviour, so the two renderings differ in exactly one way: Base UI
 * adds its own `data-*` state attributes, ids and event wiring. Everything the
 * design system's stylesheet and assistive technology read is compared: the
 * element tree, each element's `rr-*` classes, its role and ARIA attributes, the
 * attributes that change behaviour (`type`, `disabled`, `href`), inline style, and
 * the text.
 *
 * Utility classes the app adds for its own layout are ignored; the `rr-*` set is
 * the design system's contract ("the class names are the contract").
 */
// `tabindex` is not compared: Base UI writes `tabindex="0"` on a native button,
// which is the element's default and part of the behaviour it owns.
const COMPARED_ATTRIBUTES = new Set(["type", "disabled", "href", "role", "style", "title"]);

export type ParityNode = { tag: string; attributes: Record<string, string>; rr: string[] } | { text: string };

function decode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** The compared projection of a static-markup string, in document order. */
export function parityTree(html: string): ParityNode[] {
  const nodes: ParityNode[] = [];
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g)) {
    const [, closing, tag, rawAttributes, text] = match;
    if (text !== undefined) {
      const trimmed = decode(text).trim();
      if (trimmed) nodes.push({ text: trimmed });
      continue;
    }
    if (closing) {
      nodes.push({ tag: `/${tag}`, attributes: {}, rr: [] });
      continue;
    }
    const attributes: Record<string, string> = {};
    let rr: string[] = [];
    for (const attribute of rawAttributes.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
      const [, name, value = ""] = attribute;
      if (name === "class") {
        rr = decode(value)
          .split(/\s+/)
          .filter((className) => className.startsWith("rr-"))
          .sort();
      } else if (COMPARED_ATTRIBUTES.has(name) || name.startsWith("aria-")) {
        attributes[name] = decode(value);
      }
    }
    nodes.push({ tag, attributes, rr });
  }
  return nodes;
}

/** Both renderings, projected, for `expect(app).toEqual(designSystem)`. */
export function parity(app: ReactElement, designSystem: ReactElement): { app: ParityNode[]; designSystem: ParityNode[] } {
  return {
    app: parityTree(renderToStaticMarkup(app)),
    designSystem: parityTree(renderToStaticMarkup(designSystem)),
  };
}
