import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const electronDir = dirname(fileURLToPath(import.meta.url));

/**
 * The main process is plain ESM that Electron loads at boot, so a relative
 * import of a deleted file is not a type error or a lint warning: it is an
 * uncaught ERR_MODULE_NOT_FOUND on the first launch, before any window opens.
 * Nothing else in the suite loads main.mjs, because importing it would start
 * Electron, so the module graph is checked statically instead.
 */
test("every relative import in the Electron main process resolves", () => {
  const sources = readdirSync(electronDir).filter(
    (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"),
  );
  assert.ok(sources.includes("main.mjs"), "main.mjs must be part of the scan");

  const missing = [];
  for (const source of sources) {
    const code = readFileSync(join(electronDir, source), "utf8");
    for (const match of code.matchAll(/(?:^|\n)\s*(?:import|export)[^\n;]*?from\s+"(\.[^"]+)"/g)) {
      if (!existsSync(resolve(electronDir, match[1]))) {
        missing.push(`${source} imports ${match[1]}`);
      }
    }
    for (const match of code.matchAll(/\bimport\(\s*"(\.[^"]+)"\s*\)/g)) {
      if (!existsSync(resolve(electronDir, match[1]))) {
        missing.push(`${source} dynamically imports ${match[1]}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});
