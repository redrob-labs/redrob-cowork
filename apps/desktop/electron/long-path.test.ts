import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The Windows extended-length prefix used by the reset's delete calls.
 *
 * A user's fresh start failed on a path one file past Windows' 260-character limit -- a .svelte file
 * inside a bundled node-llama-cpp checkout. The file could not be opened, so every directory above it
 * reported "not empty" up to the target, and the reset stopped with the whole tree still on disk. The
 * retry loop could not help: ENOTEMPTY is retryable, but the cause does not go away.
 *
 * The prefix is what lifts the limit, and it is also what makes this risky: it disables `.`/`..`
 * resolution and forward-slash translation in Win32, so applying it to a path that is not already
 * fully normalized would point a RECURSIVE DELETE somewhere other than intended. These tests exist to
 * hold that line -- every case where the shape is not already absolute, backslash-only and
 * relative-segment-free must be returned untouched.
 */

// The helper lives in nuke.mjs, which imports Electron. Read and evaluate just this function rather
// than importing the module.
const source = readFileSync(path.join(import.meta.dir, "nuke.mjs"), "utf8");
const start = source.indexOf("function longPath(");
const end = source.indexOf("\n}", start) + 2;
const longPath = new Function("path", `${source.slice(start, end)}; return longPath;`)(path) as (
  targetPath: string,
  platform?: string,
) => string;

describe("longPath", () => {
  it("prefixes an absolute Windows path", () => {
    expect(longPath("C:\\Users\\USER\\AppData\\Local\\redrob", "win32")).toBe(
      "\\\\?\\C:\\Users\\USER\\AppData\\Local\\redrob",
    );
  });

  it("uses the UNC form for a network path", () => {
    // \\server\share becomes \\?\UNC\server\share -- not \\?\\\server\share.
    expect(longPath("\\\\server\\share\\redrob", "win32")).toBe("\\\\?\\UNC\\server\\share\\redrob");
  });

  it("leaves a path that is already prefixed alone", () => {
    const already = "\\\\?\\C:\\Users\\USER\\redrob";
    expect(longPath(already, "win32")).toBe(already);
  });

  it("does nothing off Windows", () => {
    expect(longPath("/home/user/.local/share/redrob", "linux")).toBe("/home/user/.local/share/redrob");
  });

  // The refusals. Each of these would change what the path RESOLVES TO under the prefix, so the helper
  // must decline rather than guess -- these are the inputs a recursive delete must never be handed in
  // extended-length form.

  it("refuses a relative path", () => {
    expect(longPath("redrob\\cache", "win32")).toBe("redrob\\cache");
  });

  it("refuses a path containing forward slashes", () => {
    // Win32 translates these normally but not under the prefix, so the meaning would change.
    expect(longPath("C:\\Users/USER\\redrob", "win32")).toBe("C:\\Users/USER\\redrob");
  });

  it("refuses a path with a relative segment", () => {
    // `..` is resolved by Win32 normally and taken LITERALLY under the prefix. Prefixing this would
    // aim the delete at a different directory than the caller means.
    expect(longPath("C:\\Users\\USER\\..\\OTHER\\redrob", "win32")).toBe(
      "C:\\Users\\USER\\..\\OTHER\\redrob",
    );
    expect(longPath("C:\\Users\\.\\USER\\redrob", "win32")).toBe("C:\\Users\\.\\USER\\redrob");
  });

  it("refuses empty and non-string input", () => {
    expect(longPath("", "win32")).toBe("");
    expect(longPath(undefined as unknown as string, "win32")).toBe(undefined as unknown as string);
  });
});
