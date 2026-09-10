import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
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

/**
 * Existing on disk is not enough: `electron-builder.base.yml` packs
 * `electron/**` and `server/**` into app.asar and nothing else, so a main
 * process import that reaches OUT of `electron/` -- `../scripts/...`,
 * `../resources/...` -- resolves during development and then throws
 * ERR_MODULE_NOT_FOUND on the user's machine at boot, before any window opens.
 * That is exactly how `runtime.mjs` shipped a broken macOS build once.
 *
 * Shared build/runtime rules therefore live under `electron/` and are
 * re-exported by `scripts/`, never the other way round.
 */
test("no Electron main-process module imports outside the packaged asar tree", () => {
  const sources = readdirSync(electronDir).filter(
    (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"),
  );

  const escaping = [];
  for (const source of sources) {
    const code = readFileSync(join(electronDir, source), "utf8");
    const specifiers = [
      ...code.matchAll(/(?:^|\n)\s*(?:import|export)[^\n;]*?from\s+"(\.[^"]+)"/g),
      ...code.matchAll(/\bimport\(\s*"(\.[^"]+)"\s*\)/g),
    ].map((match) => match[1]);

    for (const specifier of specifiers) {
      const resolved = resolve(electronDir, specifier);
      if (resolved !== electronDir && !resolved.startsWith(electronDir + sep)) {
        escaping.push(`${source} imports ${specifier}, which is outside electron/ and not packed into app.asar`);
      }
    }
  }

  assert.deepEqual(escaping, []);
});
