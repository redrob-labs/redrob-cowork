#!/usr/bin/env node
/**
 * check-upstream-boundary.mjs — the EE tree must never come back.
 *
 * Upstream licenses everything under /ee under the OpenWork Enterprise Edition
 * License: production use requires a valid OpenWork subscription. This fork
 * ships MIT-licensed content only, so those paths were deleted on import.
 *
 * Selective upstream merges are exactly the operation that can silently
 * resurrect them — a merge that adds files nobody reviewed, in a directory no
 * one is looking at. This is the gate that fails such a merge, so run it in CI
 * and after every upstream sync.
 *
 * It also fails on a LICENSE that describes a directory this fork does not
 * ship: a public repository whose LICENSE grants terms for an absent /ee tree
 * is a false statement about what the reader received.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PIN_PATH = join(REPO_ROOT, "upstream-base.json");

function git(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

const violations = [];

const pin = JSON.parse(readFileSync(PIN_PATH, "utf8"));
const excluded = pin.excludedPrefixes ?? [];

if (excluded.length === 0) {
  violations.push("upstream-base.json lists no excludedPrefixes; the EE boundary is unenforced.");
}

// 1. No tracked file may live under an excluded prefix.
//    Both the committed tree AND the index are checked: a merge stages its
//    additions before they are committed, and that is the moment worth failing.
const tracked = [
  ...new Set([
    ...git(["ls-tree", "-r", "--name-only", "HEAD"]).split("\n"),
    ...git(["ls-files"]).split("\n"),
  ]),
].filter(Boolean);
for (const prefix of excluded) {
  const hits = tracked.filter((path) => path === prefix || path.startsWith(prefix));
  if (hits.length > 0) {
    violations.push(
      `${hits.length} tracked file(s) under the excluded prefix "${prefix}" — first: ${hits[0]}. ` +
        `These carry upstream's Enterprise Edition license and must not ship here.`,
    );
  }
}

// 2. LICENSE must retain the MIT notice and STATE the exclusion, so a reader of
//    the public repository learns that the EE tree is not what they received.
//    Prose cannot be verified mechanically; what is checked is that the excluded
//    path is named alongside an explicit exclusion phrase, rather than being
//    silently absent (a reader assumes they got everything) or described by a
//    stale granting clause carried over from upstream.
const EXCLUSION_PHRASES = [
  /not part of this tree/i,
  /deliberately not/i,
  /not shipped/i,
  /excluded/i,
];

const licensePath = join(REPO_ROOT, "LICENSE");
if (!existsSync(licensePath)) {
  violations.push("LICENSE is missing. Upstream's MIT notice must be retained in a fork.");
} else {
  const license = readFileSync(licensePath, "utf8");
  if (!/MIT/.test(license)) {
    violations.push("LICENSE no longer names the MIT license the upstream content is under.");
  }
  const licenceBearing = excluded.filter((prefix) => prefix === "ee/");
  for (const prefix of licenceBearing) {
    const bare = prefix.replace(/\/$/, "");
    const mentioned = new RegExp(`/?${bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|\\b)`).test(license);
    const statesExclusion = EXCLUSION_PHRASES.some((phrase) => phrase.test(license));
    if (!mentioned || !statesExclusion) {
      violations.push(
        `LICENSE must say plainly that upstream's "${bare}" tree is not part of this repository ` +
          `(it carries the Enterprise Edition license). Name the path and state the exclusion.`,
      );
    }
  }
}

// 3. Attribution must survive. MIT requires the upstream copyright notice to be
//    retained in every copy, so the check is that upstream's holder is still
//    named — in the human-readable LICENSE, in the SPDX license text, and in the
//    machine-readable REUSE map. A rebrand sweep that replaces "Different AI"
//    everywhere is the realistic way this breaks, and it breaks the license.
const UPSTREAM_HOLDER = "Different AI";
const FORK_HOLDER = "Redrob Work";

const attributionFiles = [
  { path: "LICENSE", label: "LICENSE" },
  { path: "LICENSES/MIT.txt", label: "LICENSES/MIT.txt (SPDX license text)" },
  { path: "REUSE.toml", label: "REUSE.toml (machine-readable map)" },
];

for (const { path, label } of attributionFiles) {
  const full = join(REPO_ROOT, path);
  if (!existsSync(full)) {
    violations.push(`${label} is missing; attribution and the license map must ship with the code.`);
    continue;
  }
  const text = readFileSync(full, "utf8");
  if (!text.includes(UPSTREAM_HOLDER)) {
    violations.push(
      `${label} no longer names the upstream copyright holder "${UPSTREAM_HOLDER}". ` +
        `MIT requires that notice be retained — add your line, never replace theirs.`,
    );
  }
  if (!text.includes(FORK_HOLDER)) {
    violations.push(`${label} does not name this fork's copyright holder "${FORK_HOLDER}".`);
  }
}

// 4. The REUSE map must not annotate a tree this fork does not ship.
const reusePath = join(REPO_ROOT, "REUSE.toml");
if (existsSync(reusePath)) {
  const reuse = readFileSync(reusePath, "utf8");
  if (/LicenseRef-OpenWork-EE/.test(reuse) || /path\s*=\s*"ee\//.test(reuse)) {
    violations.push(
      "REUSE.toml still annotates upstream's ee/ tree, which this fork does not ship. " +
        "Remove that annotation so scanners do not report an EE-licensed component.",
    );
  }
}

if (violations.length > 0) {
  process.stderr.write("Upstream boundary check failed.\n");
  for (const violation of violations) {
    process.stderr.write(`- ${violation}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `Upstream boundary OK: ${excluded.length} excluded prefix(es), ${tracked.length} tracked files, LICENSE consistent.\n`,
);
