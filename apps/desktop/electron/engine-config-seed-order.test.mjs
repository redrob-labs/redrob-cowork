import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  globalEngineConfigCandidates,
  legacyWorkspaceConfigCandidates,
  resolveWorkspaceEngineConfigPath,
} from "@redrob/paths";

/**
 * The desktop seeds a workspace's engine config before the embedded server
 * boots, and the server's legacy migration runs only when no engine-visible
 * config exists yet. Seeding a `$schema`-only stub therefore satisfied that
 * guard and the migration was skipped permanently, silently dropping every MCP
 * server and plugin the user had in `opencode.jsonc`. The migration is one-way
 * and never retried, so the loss was not recoverable.
 *
 * This asserts the ordering contract directly: with a legacy config present, the
 * seed must leave the destination alone so the migration can still see it.
 */

/** The seed's real condition, mirrored from runtime.mjs `ensureOpencodeConfig`. */
function wouldSeed(workspaceRoot) {
  if (existsSync(resolveWorkspaceEngineConfigPath(workspaceRoot))) return false;
  for (const legacy of legacyWorkspaceConfigCandidates(workspaceRoot)) {
    if (existsSync(legacy)) return false;
  }
  return true;
}

function workspace() {
  return mkdtempSync(join(tmpdir(), "seed-order-"));
}

test("a clean workspace is seeded", () => {
  assert.equal(wouldSeed(workspace()), true);
});

test("a workspace carrying a legacy config is NOT seeded", () => {
  const root = workspace();
  writeFileSync(join(root, "opencode.jsonc"), '{ "mcp": { "linear": {} } }\n', "utf8");
  assert.equal(
    wouldSeed(root),
    false,
    "seeding here writes a stub that makes migrateLegacyWorkspaceConfig skip the copy forever",
  );
});

test("the nested legacy location also suppresses the seed", () => {
  const root = workspace();
  mkdirSync(join(root, ".opencode"), { recursive: true });
  writeFileSync(join(root, ".opencode", "opencode.json"), '{ "plugin": ["x"] }\n', "utf8");
  assert.equal(wouldSeed(root), false);
});

test("an existing engine config short-circuits before the legacy probe", () => {
  const root = workspace();
  writeFileSync(join(root, "redrob.jsonc"), '{ "$schema": "x" }\n', "utf8");
  writeFileSync(join(root, "opencode.jsonc"), '{ "mcp": {} }\n', "utf8");
  assert.equal(wouldSeed(root), false);
});

test("the desktop seed actually carries the legacy probe", () => {
  // Reverse-verification against the real source: the assertions above model the
  // condition, so they would keep passing if the implementation lost it.
  const source = readFileSync(new URL("./runtime.mjs", import.meta.url), "utf8");
  const seed = source.slice(source.indexOf("async function ensureOpencodeConfig"));
  const body = seed.slice(0, seed.indexOf("\n  }\n"));
  assert.match(
    body,
    /legacyWorkspaceConfigCandidates/,
    "ensureOpencodeConfig must not seed over a legacy config",
  );
});

/**
 * The engine reads `redrob.json(c)` only. The global config editor was left on
 * `opencode.json(c)` when the project scope moved onto that contract, so every
 * global setting written through it was inert -- and in a directory the legacy
 * migration does not scan, so nothing would ever pick it up.
 */
test("the global config scope names files the engine reads", () => {
  const candidates = globalEngineConfigCandidates({
    env: { XDG_CONFIG_HOME: "/tmp/cfg" },
    homeDir: "/home/ada",
    platform: "linux",
  });
  assert.deepEqual(candidates, ["/tmp/cfg/redrob/redrob.jsonc", "/tmp/cfg/redrob/redrob.json"]);
  for (const candidate of candidates) {
    assert.doesNotMatch(candidate, /opencode/, "the engine does not load opencode.* globally");
  }
});

test("the main process resolves the global scope through that helper", () => {
  const source = readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("function resolveOpencodeConfigPath"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /globalEngineConfigCandidates\(\)/);
  assert.doesNotMatch(body, /"opencode\.jsonc"/, "global scope must not hand-build opencode.jsonc");
});
