import { describe, expect, test } from "bun:test";

import { ARTIFACT_PREVIEW_BUDGET, artifactPreview, plainMarkdown } from "../src/react-app/cowork/panel/artifact-preview";

// Artifact row previews are plain text that ends cleanly - a whole sentence or word, never "...".

describe("plainMarkdown", () => {
  test.each([
    ["syntax stripped", "## Summary\n- **Chips** are [scarce](https://x.y).\n\n`code`", "Summary Chips are scarce. code"],
    ["front matter, code and tables dropped", "---\ntitle: x\n---\nHello\n```js\nlet a\n```\n| a | b |\nWorld", "Hello World"],
    ["CRLF front matter dropped", "---\r\ntitle: x\r\n---\r\nHello", "Hello"],
    ["snake_case kept", "Set max_tokens_per_call and _private_ notes", "Set max_tokens_per_call and private notes"],
    ["escaped delimiters kept", "2 \\* 3 \\* 4 and \\_x\\_", "2 * 3 * 4 and _x_"],
    ["nested emphasis peeled", "***bold italic*** and **bold _it_**", "bold italic and bold it"],
  ])("%s", (_name, input, expected) => {
    expect(plainMarkdown(input)).toBe(expected);
  });
});

describe("artifactPreview", () => {
  const sentences = `Compute is the binding constraint for the next decade of model training. ${"Export controls widen the gap. ".repeat(6)}`;
  test.each([
    ["leading heading skipped", "# US China AI Race 2035\n\nThe gap narrows by 2030.", "The gap narrows by 2030."],
    ["short text kept whole", "One line.", "One line."],
    ["title-only file gives no preview", "# Only a title", ""],
  ])("%s", (_name, input, expected) => {
    expect(artifactPreview(input)).toBe(expected);
  });

  test.each([
    ["ends on a whole sentence when one fits", sentences, "."],
    ["otherwise ends on a whole word", "word ".repeat(60), "word"],
  ])("%s, within budget and without an ellipsis", (_name, input, ending) => {
    const preview = artifactPreview(input);
    expect(preview.length).toBeLessThanOrEqual(ARTIFACT_PREVIEW_BUDGET);
    expect(preview.endsWith(ending)).toBe(true);
    expect(preview).not.toMatch(/\.\.\.|\u2026/);
  });
});
