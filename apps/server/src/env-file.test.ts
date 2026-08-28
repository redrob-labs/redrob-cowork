import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EnvService,
  EnvStoreReadError,
  InvalidEnvKeyError,
  isReservedEnvKey,
  isValidEnvKey,
} from "./env-file.js";

describe("env-file", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "redrob-env-"));
    path = join(dir, "env.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("isValidEnvKey accepts POSIX names, rejects garbage", () => {
    expect(isValidEnvKey("ANTHROPIC_API_KEY")).toBe(true);
    expect(isValidEnvKey("_x")).toBe(true);
    expect(isValidEnvKey("GCLOUD_PROJECT")).toBe(true);
    expect(isValidEnvKey("1BAD")).toBe(false);
    expect(isValidEnvKey("has space")).toBe(false);
    expect(isValidEnvKey("has-dash")).toBe(false);
    expect(isValidEnvKey("")).toBe(false);
  });

  test("isReservedEnvKey blocks REDROB_ / OPENCODE_ prefixes", () => {
    expect(isReservedEnvKey("REDROB_TOKEN")).toBe(true);
    // Redrob Code reads the managed engine credentials from these names, so a
    // user-supplied value must never be able to override them.
    expect(isReservedEnvKey("REDROB_SERVER_USERNAME")).toBe(true);
    expect(isReservedEnvKey("REDROB_SERVER_PASSWORD")).toBe(true);
    expect(isReservedEnvKey("REDROB_CONFIG")).toBe(true);
    expect(isReservedEnvKey("OPENCODE_SERVER_PASSWORD")).toBe(true);
    expect(isReservedEnvKey("ANTHROPIC_API_KEY")).toBe(false);
    expect(isReservedEnvKey("GCLOUD_PROJECT")).toBe(false);
  });

  test("REDROB_API_KEY is reserved because Redrob Code owns that credential", () => {
    // The Redrob Key lives in the engine's auth store, reached over
    // PUT /auth/redrob. This store must refuse the name so it can never become a
    // second copy; the only code that touches the legacy entry is the one-shot
    // migration, which reads and deletes without going through the write path.
    expect(isReservedEnvKey("REDROB_API_KEY")).toBe(true);
    for (const key of [
      "REDROB_TOKEN",
      "REDROB_HOST_TOKEN",
      "REDROB_API_KEY_2",
      "REDROB_API_KEYS",
      "REDROB_SERVER_PASSWORD",
      "REDROB_ENV_STORE",
      "REDROB_CODE_BIN",
      "REDROB_CONFIG",
    ]) {
      expect(isReservedEnvKey(key)).toBe(true);
    }
    // The other product-owned service credentials are unaffected.
    for (const key of [
      "REDROB_CLOUD_API_KEY",
      "REDROB_MODELS_API_KEY",
      "REDROB_INFERENCE_BASE_URL",
      "REDROB_MODELS_BASE_URL",
    ]) {
      expect(isReservedEnvKey(key)).toBe(false);
    }
  });

  test("upsertMany refuses REDROB_API_KEY", async () => {
    const svc = new EnvService({ path });
    await expect(svc.upsertMany([{ key: "REDROB_API_KEY", value: "rk-test-not-a-real-key" }])).rejects.toThrow(
      InvalidEnvKeyError,
    );
    expect(await svc.list()).toEqual([]);
  });

  test("a legacy REDROB_API_KEY entry stays readable and deletable so it can be migrated out", async () => {
    // Installs created before Redrob Code owned the key have it in this store.
    // The migration must be able to hand it to the engine and then remove it,
    // even though the write path now rejects the name.
    const svc = new EnvService({ path });
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: Date.now(),
        variables: [{ key: "REDROB_API_KEY", value: "rk-test-legacy-not-a-real-key", updatedAt: Date.now() }],
      }),
      "utf8",
    );
    expect((await svc.list()).map((entry) => entry.key)).toEqual(["REDROB_API_KEY"]);
    expect(await svc.delete("REDROB_API_KEY")).toBe(true);
    expect(await svc.list()).toEqual([]);
  });

  test("readForInjection never leaks a legacy REDROB_API_KEY into a child env", async () => {
    // Even mid-migration the value must not widen process injection: the engine
    // gets it over the authenticated PUT /auth/redrob delivery instead.
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: Date.now(),
        variables: [
          { key: "REDROB_API_KEY", value: "rk-test-legacy-not-a-real-key", updatedAt: Date.now() },
          { key: "ANTHROPIC_API_KEY", value: "sk-ant", updatedAt: Date.now() },
        ],
      }),
      "utf8",
    );
    const injected = await EnvService.readForInjection(path);
    expect(injected).toEqual({ ANTHROPIC_API_KEY: "sk-ant" });
    expect(Object.keys(injected)).not.toContain("REDROB_API_KEY");
  });

  test("upsertMany + list round-trips with sorted keys", async () => {
    const svc = new EnvService({ path });
    await svc.upsertMany([
      { key: "ZED", value: "z" },
      { key: "ANTHROPIC_API_KEY", value: "sk-ant-abc123" },
    ]);
    const items = await svc.list();
    expect(items.map((e) => e.key)).toEqual(["ANTHROPIC_API_KEY", "ZED"]);
    expect(items.find((e) => e.key === "ANTHROPIC_API_KEY")?.value).toBe("sk-ant-abc123");
  });

  test("upsertMany updates existing keys in place", async () => {
    const svc = new EnvService({ path });
    await svc.upsertMany([{ key: "FOO", value: "1" }]);
    await svc.upsertMany([{ key: "FOO", value: "2" }]);
    const items = await svc.list();
    expect(items).toHaveLength(1);
    expect(items[0].value).toBe("2");
  });

  test("concurrent upserts do not overwrite each other", async () => {
    const svc = new EnvService({ path });
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        svc.upsertMany([{ key: `KEY_${index}`, value: String(index) }])
      ),
    );

    const items = await svc.list();
    expect(items.map((item) => item.key)).toEqual(
      Array.from({ length: 12 }, (_, index) => `KEY_${index}`).sort(),
    );
  });

  test("write failures do not mutate loaded values", async () => {
    const svc = new EnvService({ path });
    await svc.upsertMany([{ key: "KEEP_ME", value: "old" }]);

    rmSync(path, { force: true });
    mkdirSync(path);

    await expect(svc.upsertMany([{ key: "NEW_KEY", value: "new" }])).rejects.toThrow();
    expect(await svc.list()).toEqual([
      expect.objectContaining({ key: "KEEP_ME", value: "old" }),
    ]);
  });

  test("upsertMany rejects invalid keys with InvalidEnvKeyError", async () => {
    const svc = new EnvService({ path });
    const promise = svc.upsertMany([{ key: "bad-key", value: "x" }]);
    await expect(promise).rejects.toBeInstanceOf(InvalidEnvKeyError);
    await expect(promise).rejects.toMatchObject({ code: "invalid_env_key" });
  });

  test("upsertMany rejects reserved keys", async () => {
    const svc = new EnvService({ path });
    const promise = svc.upsertMany([{ key: "REDROB_TOKEN", value: "x" }]);
    await expect(promise).rejects.toBeInstanceOf(InvalidEnvKeyError);
    await expect(promise).rejects.toMatchObject({ code: "reserved_env_key" });
  });

  test("upsertMany accepts managed voice keys but does not inject them", async () => {
    const svc = new EnvService({ path });
    await svc.upsertMany([
      { key: "REDROB_CLOUD_API_KEY", value: "ow_inf_test" },
      { key: "REDROB_INFERENCE_BASE_URL", value: "https://inference.example.test" },
      { key: "ANTHROPIC_API_KEY", value: "sk-ant" },
    ]);

    expect((await svc.list()).map((entry) => entry.key)).toEqual([
      "ANTHROPIC_API_KEY",
      "REDROB_CLOUD_API_KEY",
      "REDROB_INFERENCE_BASE_URL",
    ]);
    expect(await EnvService.readForInjection(path)).toEqual({ ANTHROPIC_API_KEY: "sk-ant" });
  });

  test("delete returns false when the key is missing", async () => {
    const svc = new EnvService({ path });
    await svc.upsertMany([{ key: "FOO", value: "x" }]);
    expect(await svc.delete("FOO")).toBe(true);
    expect(await svc.delete("FOO")).toBe(false);
  });

  test("persisted file has 0600 perms on POSIX", async () => {
    if (process.platform === "win32") return;
    const svc = new EnvService({ path });
    await svc.upsertMany([{ key: "FOO", value: "bar" }]);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("readForInjection returns a plain key/value map", async () => {
    const svc = new EnvService({ path });
    await svc.upsertMany([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ]);
    const injected = await EnvService.readForInjection(path);
    expect(injected).toEqual({ A: "1", B: "2" });
  });

  test("readForInjection strips reserved keys even if present on disk", async () => {
    // Simulate a hand-edited env.json that contains a reserved key. The
    // service refuses to write these, but the injection path must still
    // defend against a file someone tampered with.
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: Date.now(),
        variables: [
          { key: "REDROB_TOKEN", value: "stolen" },
          { key: "ANTHROPIC_API_KEY", value: "sk-ant" },
        ],
      }),
    );
    const injected = await EnvService.readForInjection(path);
    expect(injected).toEqual({ ANTHROPIC_API_KEY: "sk-ant" });
  });

  test("readForInjection returns {} when the file is missing", async () => {
    const injected = await EnvService.readForInjection(join(dir, "nope.json"));
    expect(injected).toEqual({});
  });

  test("readForInjection returns {} on corrupted JSON", async () => {
    writeFileSync(path, "{ this is not json");
    const injected = await EnvService.readForInjection(path);
    expect(injected).toEqual({});
  });

  test("list rejects corrupted JSON instead of treating it as empty", async () => {
    writeFileSync(path, "{ this is not json");
    const svc = new EnvService({ path });
    await expect(svc.list()).rejects.toBeInstanceOf(EnvStoreReadError);
  });

  test("upsertMany does not overwrite an invalid store", async () => {
    writeFileSync(path, "{ this is not json");
    const svc = new EnvService({ path });
    await expect(svc.upsertMany([{ key: "SAFE", value: "new" }])).rejects.toBeInstanceOf(EnvStoreReadError);
    expect(readFileSync(path, "utf8")).toBe("{ this is not json");
  });
});
