#!/usr/bin/env node
/**
 * Parse every shipped desktop module, so a file that does not even parse cannot
 * reach a release again.
 *
 * This gate exists because one did. `main.mjs` carried an unclosed IPC handler
 * from the commit that added the memory-headroom handler, and nothing noticed:
 * the desktop tests import the modules they exercise, and not one of them
 * imports `main.mjs`, so 288 passing tests said nothing about whether the app's
 * entry point was syntactically valid. The release build was the first thing to
 * read the file, and it failed on all four platforms.
 *
 * `node --check` is the whole check on purpose. It is the same parse the runtime
 * performs, it needs no build and no Electron, and it costs milliseconds per
 * file -- a gate this cheap has no excuse for not running on every pull request.
 * It says nothing about whether the code is CORRECT; type checking and the tests
 * are what cover that.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directories whose .mjs files ship in, or build, the desktop app. */
const SCANNED = [
  "apps/desktop/electron",
  "apps/desktop/scripts",
  "scripts",
];

function collect(dir) {
  const absolute = path.join(repoRoot, dir);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      files.push(...collect(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      files.push(full);
    }
  }
  return files;
}

const files = SCANNED.flatMap(collect).sort();
if (files.length === 0) {
  console.error("Syntax check found no .mjs files to parse; the scanned paths moved.");
  process.exit(1);
}

const broken = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = (result.stderr || "").trim().split("\n").slice(0, 4).join("\n");
    broken.push({ file: path.relative(repoRoot, file), detail });
  }
}

if (broken.length > 0) {
  console.error(`Syntax check failed for ${broken.length} file(s):\n`);
  for (const { file, detail } of broken) {
    console.error(`- ${file}\n${detail}\n`);
  }
  process.exit(1);
}

console.log(`Syntax OK: ${files.length} shipped .mjs files parse.`);
