// Regression: the packaged app showed "Redrob Work server did not finish starting"
// on every platform in v0.0.3, because server/dist/local-memory-store.js imported
// MEMORY_SCOPE_LOCAL -- a *value* -- from @redrob/types/memory. Two things made
// that fatal, and each one alone is enough:
//
//   1. @redrob/types was a devDependency of apps/server, so it was neither
//      mirrored into apps/desktop/package.json nor packed by electron-builder.
//   2. @redrob/types resolves its production export condition to TypeScript
//      source, which plain Node cannot load even when it *is* packed. That is
//      deliberate and enforced elsewhere (apps/server/src/types-package-exports.test.ts),
//      so the fix is never to point that package at dist/.
//
// Type-only imports are erased by tsc and are therefore always safe. This test
// checks the emitted shape from source: for every server file that tsc compiles
// into app.asar, any workspace package it imports a VALUE from must be a runtime
// dependency, must be mirrored into the desktop package, and must resolve to
// real JavaScript.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const serverSrc = join(repoRoot, "apps/server/src");

const desktopPackage = readJson("apps/desktop/package.json");
const serverPackage = readJson("apps/server/package.json");

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

/**
 * The five files under src/opencode-plugins are bundled by `bun build` and
 * shipped as extraResources; electron-builder excludes their tsc output from
 * app.asar entirely. Bundling inlines workspace source, so those files may
 * import values from a TypeScript-source package. Everything else in src is
 * emitted by tsc and runs from app.asar on plain Node.
 */
function tscEmittedSources(directory = serverSrc, collected = []) {
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      if (absolute === join(serverSrc, "opencode-plugins")) continue;
      tscEmittedSources(absolute, collected);
      continue;
    }
    if (!entry.endsWith(".ts")) continue;
    // Tests are never emitted into the packaged app.
    if (/\.(test|e2e\.test)\.ts$/.test(entry)) continue;
    collected.push(absolute);
  }
  return collected;
}

/**
 * Mirrors what tsc keeps at emit: `import type ...` statements disappear, and so
 * do individual `{ type Foo }` specifiers. A named import binding that is not
 * marked `type` survives as a runtime import.
 */
function valueImportedPackages(source) {
  const found = new Set();
  const importPattern = /import\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  for (const [, typeOnly, clause, specifier] of source.matchAll(importPattern)) {
    if (!specifier.startsWith("@redrob/")) continue;
    if (typeOnly) continue;
    const named = clause.match(/\{([\s\S]*)\}/);
    if (named) {
      const bindings = named[1]
        .split(",")
        .map((binding) => binding.trim())
        .filter(Boolean);
      const hasValueBinding = bindings.some((binding) => !/^type\s/.test(binding));
      const sideEffectOnlyClause = bindings.length === 0 && !clause.replace(/\{[\s\S]*\}/, "").trim();
      if (!hasValueBinding && !sideEffectOnlyClause) continue;
    }
    // "@redrob/types/memory" -> "@redrob/types"
    found.add(specifier.split("/").slice(0, 2).join("/"));
  }
  return found;
}

function productionExportTargets(packageName) {
  const workspaceDirectory = packageName.replace("@redrob/", "");
  const manifest = readJson(join("packages", workspaceDirectory, "package.json"));
  const targets = [];
  for (const target of Object.values(manifest.exports ?? {})) {
    if (typeof target === "string") {
      targets.push(target);
      continue;
    }
    if (typeof target?.default === "string") targets.push(target.default);
  }
  return targets;
}

describe("server runtime imports stay loadable from app.asar", () => {
  const offenders = new Map();
  for (const absolute of tscEmittedSources()) {
    for (const packageName of valueImportedPackages(readFileSync(absolute, "utf8"))) {
      const existing = offenders.get(packageName) ?? [];
      existing.push(absolute.slice(repoRoot.length));
      offenders.set(packageName, existing);
    }
  }

  it("value-imports only workspace packages that ship JavaScript", () => {
    const typescriptOnly = [...offenders].flatMap(([packageName, files]) => {
      const targets = productionExportTargets(packageName);
      return targets.some((target) => target.endsWith(".ts"))
        ? [`${packageName} (imported as a value by ${files.join(", ")})`]
        : [];
    });

    assert.deepEqual(
      typescriptOnly,
      [],
      "These packages resolve their production export condition to TypeScript source, "
        + "which plain Node cannot load from app.asar. Import them with `import type` and "
        + "keep the value in apps/server, rather than pointing the package at dist/ -- "
        + "apps/server/src/types-package-exports.test.ts requires source resolution.",
    );
  });

  it("declares every value-imported workspace package as a server runtime dependency", () => {
    for (const [packageName, files] of offenders) {
      assert.equal(
        typeof serverPackage.dependencies?.[packageName],
        "string",
        `"${packageName}" is imported as a value by ${files.join(", ")}, so it must be in `
          + "apps/server/package.json dependencies. A devDependency is not staged into the "
          + "packaged runtime and fails at startup with ERR_MODULE_NOT_FOUND.",
      );
    }
  });

  it("mirrors every value-imported workspace package into the desktop package", () => {
    for (const [packageName] of offenders) {
      assert.equal(
        desktopPackage.dependencies?.[packageName],
        serverPackage.dependencies?.[packageName],
        `"${packageName}" must be mirrored with the same version in apps/desktop/package.json, `
          + "because electron-builder only packs node_modules declared there.",
      );
    }
  });
});
