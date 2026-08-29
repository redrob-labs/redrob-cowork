import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `bun test` with no path walks the whole package, so once `pnpm build` has
 * produced `dist/`, an unscoped run collects the compiled copy of every test
 * alongside its source. That doubles the suite and reports failures no source
 * change can explain: `redrobPluginPath` resolves a `.ts` plugin from `src`
 * and a `.js` plugin from `dist`, so the same assertion is correct in one
 * copy and wrong in the other.
 */
const manifest: { scripts?: Record<string, string> } = JSON.parse(
  readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
);

describe("test scope", () => {
  test("the test script never collects built output", () => {
    const script = manifest.scripts?.test;
    expect(script).toBeDefined();
    expect(script).toContain(" test src");
  });

  test("no test script targets dist", () => {
    for (const [name, script] of Object.entries(manifest.scripts ?? {})) {
      if (!name.startsWith("test")) continue;
      expect([name, script.includes("dist")]).toEqual([name, false]);
    }
  });
});
