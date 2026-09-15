#!/usr/bin/env node
/**
 * check-brand.mjs — the retired product name must not come back.
 *
 * The product was renamed from "Redrob Work" to "Redrob Cowork" across 1,710
 * occurrences. A rename that large is undone one file at a time: a
 * copy-pasted string, a doc written from memory, a merge that resurrects an old
 * hunk. None of those fail a build on their own, so this is the gate that makes
 * them fail.
 *
 * Historical records are exempt on purpose. What shipped as "Redrob Work"
 * shipped under that name, and rewriting a changelog entry or a finished task
 * log to say otherwise would be false.
 *
 * Functional identifiers are NOT checked here because the rename never touched
 * them: io.redrob.work (owns the userData directory), cdn.redrob.ai/work/ (the
 * updater feed), the @redrob/* package scope and the REDROB_* env prefix all
 * survive verbatim and must keep doing so.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Retired display names, with the replacement to suggest. */
const RETIRED = [
  ["Redrob Work", "Redrob Cowork"],
  ["레드롭 워크", "레드롭 코워크"],
];

/**
 * Historical records: they name what shipped, and that name was correct then.
 * `.agents/` holds finished task logs. `changelog/` and `prds/` do not exist in
 * this fork today; they are listed because upstream has them and a sync could
 * bring them in, at which point they must be exempt rather than swept.
 */
const EXEMPT_PREFIXES = [".agents/", "changelog/", "prds/"];

/**
 * This file names the retired strings in order to search for them, so it
 * necessarily contains them. Exempted by exact path rather than by hiding the
 * needles behind string concatenation, which would make the rule unreadable.
 *
 * Found by CI, not by the local run: `git ls-files` only sees tracked files, so
 * while this script was still untracked it excluded itself by accident and
 * passed. A self-referential guard has to be verified in its committed state.
 */
const EXEMPT_FILES = new Set(["scripts/check-brand.mjs"]);

const files = execFileSync("git", ["ls-files"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split("\n")
  .filter(Boolean)
  .filter((path) => !EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix)))
  .filter((path) => !EXEMPT_FILES.has(path));

const violations = [];

for (const path of files) {
  let buffer;
  try {
    buffer = readFileSync(join(REPO_ROOT, path));
  } catch {
    continue;
  }
  if (buffer.includes(0)) continue; // binary

  const text = buffer.toString("utf8");
  for (const [retired, replacement] of RETIRED) {
    if (!text.includes(retired)) continue;
    const lines = text.split("\n");
    const first = lines.findIndex((line) => line.includes(retired));
    const count = text.split(retired).length - 1;
    violations.push(
      `${path}:${first + 1} uses the retired name "${retired}" (${count}x) — use "${replacement}"`,
    );
  }
}

if (violations.length > 0) {
  process.stderr.write("Brand check failed.\n");
  for (const violation of violations.slice(0, 40)) {
    process.stderr.write(`- ${violation}\n`);
  }
  if (violations.length > 40) {
    process.stderr.write(`- … ${violations.length - 40} more\n`);
  }
  process.stderr.write(
    `\nIf the mention is a historical record of what shipped, it belongs under one of: ${EXEMPT_PREFIXES.join(", ")}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `Brand OK: ${files.length} tracked files carry no retired product name (exempt: ${EXEMPT_PREFIXES.join(", ")}).\n`,
);
