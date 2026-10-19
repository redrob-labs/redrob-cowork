import { describe, expect, test } from "bun:test";

import { ARTIFACT_PREVIEW_BUDGET, artifactPreview, plainMarkdown } from "../src/react-app/cowork/panel/artifact-preview";

// Artifact row previews end cleanly - a whole sentence or word, never "...".

describe("plainMarkdown", () => {
  test("strips markdown syntax and keeps reading text", () => {
    expect(plainMarkdown("## Summary\n- **Chips** are [scarce](https://x.y).\n\n`code`")).toBe("Summary Chips are scarce. code");
  });
  test("drops front matter, code blocks and table rows", () => {
    expect(plainMarkdown("---\ntitle: x\n---\nHello\n```js\nlet a\n```\n| a | b |\nWorld")).toBe("Hello World");
  });
});

describe("artifactPreview", () => {
  test("skips the leading heading (the row already shows the name)", () => {
    expect(artifactPreview("# US China AI Race 2035\n\nThe gap narrows by 2030.")).toBe("The gap narrows by 2030.");
  });

  test("short text is kept whole", () => {
    expect(artifactPreview("One line.")).toBe("One line.");
  });

  test("long text ends on a whole sentence when one fits", () => {
    const text = `${"Compute is the binding constraint for the next decade of model training."} ${"Export controls widen the gap. ".repeat(6)}`;
    const preview = artifactPreview(text);
    expect(preview.length).toBeLessThanOrEqual(ARTIFACT_PREVIEW_BUDGET);
    expect(preview.endsWith(".")).toBe(true);
    expect(preview).not.toMatch(/\.\.\.|\u2026/);
  });

  test("with no sentence end in range it ends on a whole word, no ellipsis", () => {
    const text = "word ".repeat(60);
    const preview = artifactPreview(text);
    expect(preview.length).toBeLessThanOrEqual(ARTIFACT_PREVIEW_BUDGET);
    expect(preview.endsWith("word")).toBe(true);
  });

  test("empty text gives no preview", () => {
    expect(artifactPreview("# Only a title")).toBe("");
  });
});
