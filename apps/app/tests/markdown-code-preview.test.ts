import { describe, expect, test } from "bun:test";

import { previewDocument } from "../src/components/markdown/markdown";
import {
  previewableCodeLanguage,
  renderHighlightedMarkdownHtml,
  renderMarkdownHtml,
} from "../src/components/markdown/markdown-primitive";

const page = "```html\n<!doctype html><h1>Hi</h1>\n```";

describe("chat code block preview", () => {
  test("a page or drawing fence gets a Preview button, and nothing else does", () => {
    expect(renderMarkdownHtml(page)).toContain('data-redrob-code-preview="html"');
    expect(renderMarkdownHtml("```svg\n<svg></svg>\n```")).toContain('data-redrob-code-preview="svg"');
    for (const fence of ["```ts\nconst x = 1\n```", "```\nplain\n```", "```jsx\n<div/>\n```"]) {
      expect(renderMarkdownHtml(fence)).not.toContain("data-redrob-code-preview");
    }
  });

  test("the button survives the highlighted render, which every fenced message upgrades to", async () => {
    const html = await renderHighlightedMarkdownHtml(page);
    expect(html).toContain('data-redrob-code-preview="html"');
    expect(html).toContain("data-redrob-shiki");
  });

  test("the button never appears outside chat", async () => {
    expect(renderMarkdownHtml(page, "surface")).not.toContain("data-redrob-code-preview");
    expect(await renderHighlightedMarkdownHtml(page, "surface")).not.toContain("data-redrob-code-preview");
  });

  test("the code itself is still escaped text, never live markup in the message", () => {
    const html = renderMarkdownHtml("```html\n<script>alert(1)</script>\n```");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("languages map to the right preview, and an svg is centred on a page", () => {
    expect(previewableCodeLanguage("HTML")).toBe("html");
    expect(previewableCodeLanguage("htm")).toBe("html");
    expect(previewableCodeLanguage("svg")).toBe("svg");
    expect(previewableCodeLanguage("css")).toBeNull();
    expect(previewDocument("<h1>Hi</h1>", "html")).toBe("<h1>Hi</h1>");
    const svg = previewDocument("<svg width='10'></svg>", "svg");
    expect(svg.startsWith("<!doctype html>")).toBe(true);
    expect(svg).toContain("<svg width='10'></svg>");
  });
});
