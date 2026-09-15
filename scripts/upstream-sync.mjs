#!/usr/bin/env node
/**
 * upstream-sync.mjs — what upstream changed that this fork actually ships.
 *
 * This fork is a hard fork, not a patch stack: it deleted 2,128 upstream files
 * (the whole EE tree) and modified 688 more, so replaying upstream wholesale is
 * neither possible nor wanted. What IS wanted is the small slice of upstream
 * work that touches files we still carry — that slice is what this reports.
 *
 * Usage:
 *   node scripts/upstream-sync.mjs setup     # add/repoint the upstream remote
 *   node scripts/upstream-sync.mjs fetch     # fetch upstream (network)
 *   node scripts/upstream-sync.mjs report    # commits touching files we ship
 *   node scripts/upstream-sync.mjs files     # just the colliding path list
 *
 * `report` reads only local objects, so run `fetch` first. Nothing here writes
 * to the working tree or moves a branch: merging is a human decision, and the
 * EE boundary in upstream-base.json must survive it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PIN_PATH = join(REPO_ROOT, "upstream-base.json");

// This tool's output is long and people pipe it into `head`. A closed pipe is a
// normal end, not a crash.
process.stdout.on("error", (error) => {
  if (error?.code === "EPIPE") process.exit(0);
  throw error;
});

function git(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    // A git failure here is an operator problem (wrong branch name, no network,
    // missing objects), so report it as one instead of a node stack trace.
    const detail = typeof error?.stderr === "string" && error.stderr.trim()
      ? error.stderr.trim().split("\n").at(-1)
      : (error?.message ?? "unknown error");
    fail(`git ${args.slice(0, 3).join(" ")} failed: ${detail}`);
    throw error; // unreachable: fail() exits
  }
}

function readPin() {
  const pin = JSON.parse(readFileSync(PIN_PATH, "utf8"));
  for (const key of ["remote", "remoteName", "defaultBranch", "base", "excludedPrefixes"]) {
    if (pin[key] === undefined) {
      throw new Error(`upstream-base.json is missing "${key}"`);
    }
  }
  return pin;
}

function haveCommit(sha) {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isExcluded(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(prefix));
}

/** Paths this fork currently tracks on HEAD. */
function shippedPaths() {
  return new Set(git(["ls-tree", "-r", "--name-only", "HEAD"]).split("\n").filter(Boolean));
}

function upstreamRef(pin) {
  return `${pin.remoteName}/${pin.defaultBranch}`;
}

function requireUpstream(pin) {
  if (!haveCommit(pin.base)) {
    fail(
      `base commit ${pin.base.slice(0, 9)} is not in this clone yet.\n` +
        `Run: node scripts/upstream-sync.mjs setup && node scripts/upstream-sync.mjs fetch`,
    );
  }
  try {
    git(["rev-parse", "--verify", `${upstreamRef(pin)}^{commit}`], { stdio: "ignore" });
  } catch {
    fail(`${upstreamRef(pin)} is missing. Run: node scripts/upstream-sync.mjs fetch`);
  }
}

function fail(message) {
  process.stderr.write(`upstream-sync: ${message}\n`);
  process.exit(1);
}

function setup(pin) {
  const existing = git(["remote"]).split("\n").filter(Boolean);
  if (existing.includes(pin.remoteName)) {
    git(["remote", "set-url", pin.remoteName, pin.remote]);
    process.stdout.write(`Repointed remote "${pin.remoteName}" at ${pin.remote}\n`);
    return;
  }
  git(["remote", "add", pin.remoteName, pin.remote]);
  process.stdout.write(`Added remote "${pin.remoteName}" -> ${pin.remote}\n`);
}

function fetchUpstream(pin) {
  process.stdout.write(`Fetching ${pin.remoteName} (${pin.remote})…\n`);
  git(["fetch", "--no-tags", pin.remoteName, pin.defaultBranch], { stdio: "inherit" });
}

/** Upstream paths changed since the base that this fork still ships. */
function collidingPaths(pin) {
  const shipped = shippedPaths();
  const changed = git([
    "diff",
    "--name-only",
    pin.base,
    upstreamRef(pin),
  ])
    .split("\n")
    .filter(Boolean);

  return changed.filter((path) => shipped.has(path) && !isExcluded(path, pin.excludedPrefixes));
}

function groupByArea(paths) {
  const counts = new Map();
  for (const path of paths) {
    const area = path.split("/").slice(0, 2).join("/") || path;
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function report(pin) {
  requireUpstream(pin);

  const ref = upstreamRef(pin);
  const totalCommits = Number(git(["rev-list", "--count", `${pin.base}..${ref}`]).trim());
  const paths = collidingPaths(pin);

  process.stdout.write(`Upstream base : ${pin.base.slice(0, 9)}  ${pin.baseDate ?? ""}\n`);
  process.stdout.write(`Upstream head : ${git(["rev-parse", "--short", ref]).trim()}\n`);
  process.stdout.write(`Commits since : ${totalCommits}\n`);
  process.stdout.write(`Files we ship that upstream touched: ${paths.length}\n\n`);

  if (paths.length === 0) {
    process.stdout.write("Nothing upstream changed inside this fork's surface.\n");
    return;
  }

  process.stdout.write("By area:\n");
  for (const [area, count] of groupByArea(paths)) {
    process.stdout.write(`  ${String(count).padStart(4)}  ${area}\n`);
  }

  // Commits are listed only when they touch the colliding surface, which is the
  // whole point: it turns hundreds of upstream commits into a triage list.
  const log = git([
    "log",
    "--no-merges",
    "--format=%h %cs %s",
    `${pin.base}..${ref}`,
    "--",
    ...paths,
  ])
    .split("\n")
    .filter(Boolean);

  process.stdout.write(`\nCommits touching our surface: ${log.length}\n`);
  for (const line of log.slice(0, 60)) {
    process.stdout.write(`  ${line}\n`);
  }
  if (log.length > 60) {
    process.stdout.write(`  … ${log.length - 60} more\n`);
  }
}

function files(pin) {
  requireUpstream(pin);
  for (const path of collidingPaths(pin)) {
    process.stdout.write(`${path}\n`);
  }
}

const command = process.argv[2] ?? "report";
const pin = readPin();

switch (command) {
  case "setup":
    setup(pin);
    break;
  case "fetch":
    fetchUpstream(pin);
    break;
  case "report":
    report(pin);
    break;
  case "files":
    files(pin);
    break;
  default:
    fail(`unknown command "${command}". Use setup | fetch | report | files.`);
}
