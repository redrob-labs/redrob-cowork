// Regression: a new workspace used to be seeded with `opencode.jsonc` carrying
// upstream's `https://opencode.ai/config.json` schema. The engine reads neither,
// so the file was inert and the schema pointed at the wrong product's contract.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  resolveWorkspaceEngineConfigPath,
  workspaceEngineConfigCandidates,
} from "@redrob/paths";

const runtimeSource = readFileSync(new URL("./runtime.mjs", import.meta.url), "utf8");

describe("engine config seeding", () => {
  it("seeds the schema URL the engine publishes", () => {
    assert.match(
      runtimeSource,
      /https:\/\/code\.redrob\.ai\/config\.json/,
      "runtime.mjs must seed the Redrob Code config schema.",
    );
    assert.doesNotMatch(
      runtimeSource,
      /https:\/\/opencode\.ai\/config\.json/,
      "runtime.mjs must not seed upstream OpenCode's config schema.",
    );
  });

  it("seeds a filename the engine actually loads", () => {
    const seeded = resolveWorkspaceEngineConfigPath("/repo/workspace");
    assert.ok(
      /\/redrob\.jsonc?$/.test(seeded),
      `Seed target must be redrob.json(c); got ${seeded}.`,
    );
    for (const candidate of workspaceEngineConfigCandidates("/repo/workspace")) {
      assert.doesNotMatch(
        candidate,
        /opencode\.jsonc?$/,
        "No engine-visible candidate may use an upstream opencode filename.",
      );
    }
  });

  it("isolates dev mode through the variable the engine reads", () => {
    // The engine reads REDROB_CONFIG_DIR. Setting only OPENCODE_CONFIG_DIR left
    // dev mode sharing the real config directory.
    assert.match(runtimeSource, /env\.REDROB_CONFIG_DIR = /);
  });
});
