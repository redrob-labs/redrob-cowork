import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { migrateLegacyWorkspaceConfig } from "./engine-config-migrate.js";

async function workspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "redrob-migrate-"));
}

describe("legacy engine config migration", () => {
  test("copies a root opencode.jsonc the engine never read to redrob.jsonc", async () => {
    const root = await workspace();
    const legacy = '{\n  // a comment the user wrote\n  "mcp": { "demo": { "type": "local" } }\n}\n';
    await writeFile(join(root, "opencode.jsonc"), legacy, "utf8");

    const from = await migrateLegacyWorkspaceConfig(root);

    expect(from).toBe(join(root, "opencode.jsonc"));
    // Byte-for-byte, so a JSONC comment survives.
    expect(await readFile(join(root, "redrob.jsonc"), "utf8")).toBe(legacy);
    // Non-destructive: the legacy file is left alone.
    expect(await readFile(join(root, "opencode.jsonc"), "utf8")).toBe(legacy);
  });

  test("migrates from .opencode/ when the root file is absent", async () => {
    const root = await workspace();
    await mkdir(join(root, ".opencode"), { recursive: true });
    await writeFile(join(root, ".opencode", "opencode.json"), '{"plugin":["demo"]}', "utf8");

    const from = await migrateLegacyWorkspaceConfig(root);

    expect(from).toBe(join(root, ".opencode", "opencode.json"));
    expect(await readFile(join(root, "redrob.jsonc"), "utf8")).toBe('{"plugin":["demo"]}');
  });

  test("never overwrites an engine-visible config that already exists", async () => {
    const root = await workspace();
    await writeFile(join(root, "redrob.jsonc"), '{"kept":true}', "utf8");
    await writeFile(join(root, "opencode.jsonc"), '{"stale":true}', "utf8");

    expect(await migrateLegacyWorkspaceConfig(root)).toBeNull();
    expect(await readFile(join(root, "redrob.jsonc"), "utf8")).toBe('{"kept":true}');
  });

  test("treats redrob.json as an existing target, so jsonc is not created beside it", async () => {
    const root = await workspace();
    await writeFile(join(root, "redrob.json"), '{"kept":true}', "utf8");
    await writeFile(join(root, "opencode.jsonc"), '{"stale":true}', "utf8");

    expect(await migrateLegacyWorkspaceConfig(root)).toBeNull();
  });

  test("does nothing when there is no legacy file", async () => {
    const root = await workspace();
    expect(await migrateLegacyWorkspaceConfig(root)).toBeNull();
  });

  test("ignores an empty legacy file rather than creating an empty target", async () => {
    const root = await workspace();
    await writeFile(join(root, "opencode.jsonc"), "   \n", "utf8");
    expect(await migrateLegacyWorkspaceConfig(root)).toBeNull();
  });

  test("is a no-op for a blank workspace path", async () => {
    expect(await migrateLegacyWorkspaceConfig("   ")).toBeNull();
  });
});
