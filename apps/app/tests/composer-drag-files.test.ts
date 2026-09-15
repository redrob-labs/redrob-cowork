import { describe, expect, test } from "bun:test";

import { dragEventHasFiles } from "../src/react-app/domains/session/surface/composer/drag-files";

/** Minimal DataTransfer stand-in: only the fields the helper reads. */
function transfer(input: {
  types?: string[];
  files?: number;
  items?: Array<{ kind: string }>;
}): DataTransfer {
  return {
    types: input.types ?? [],
    files: { length: input.files ?? 0 },
    items: input.items,
  } as unknown as DataTransfer;
}

describe("dragEventHasFiles", () => {
  test("detects a file drag during dragover, when the file list is still empty", () => {
    // This is the real dragover payload: protected mode hides `files`, so the
    // old `files.length` check never fired and no highlight ever showed.
    expect(dragEventHasFiles(transfer({ types: ["Files"], files: 0 }))).toBe(true);
  });

  test("detects files on drop, when the list is populated", () => {
    expect(dragEventHasFiles(transfer({ types: [], files: 2 }))).toBe(true);
  });

  test("falls back to items[].kind when types omits Files", () => {
    expect(dragEventHasFiles(transfer({ types: [], items: [{ kind: "file" }] }))).toBe(true);
  });

  test("ignores a text-only drag", () => {
    expect(
      dragEventHasFiles(transfer({ types: ["text/plain", "text/uri-list"], items: [{ kind: "string" }] })),
    ).toBe(false);
  });

  test("ignores a missing dataTransfer", () => {
    expect(dragEventHasFiles(null)).toBe(false);
    expect(dragEventHasFiles(undefined)).toBe(false);
  });
});
