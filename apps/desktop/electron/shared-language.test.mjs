import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseSharedLanguage, readSharedLanguage, sharedRedrobDir } from "./shared-language.mjs";

test("the shared dir follows the launcher's rules per platform", () => {
  const home = path.join("H", "felix");
  assert.equal(sharedRedrobDir({ REDROB_SHARED_DIR: "/custom" }, "linux", home), "/custom");
  assert.equal(sharedRedrobDir({ APPDATA: path.join("C", "Roaming") }, "win32", home), path.join("C", "Roaming", "Redrob", "Shared"));
  assert.equal(sharedRedrobDir({}, "darwin", home), path.join(home, "Library", "Application Support", "ai.redrob.shared"));
  assert.equal(sharedRedrobDir({ XDG_CONFIG_HOME: "/xdg" }, "linux", home), path.join("/xdg", "redrob-shared"));
  assert.equal(sharedRedrobDir({}, "linux", home), path.join(home, ".config", "redrob-shared"));
});

test("parses the suite language, the chosen flag and Cowork's own override", () => {
  assert.deepEqual(parseSharedLanguage('{"language":"ko","chosen":true,"apps":{"redrob-cowork":"en","redrob-canvas":"ko"}}'), { language: "ko", chosen: true, app: "en" });
  assert.deepEqual(parseSharedLanguage('{"language":"en"}'), { language: "en", chosen: false, app: null });
});

test("a broken or meaningless file says nothing", () => {
  assert.equal(parseSharedLanguage("{not json"), null);
  assert.equal(parseSharedLanguage("[]"), null);
  assert.equal(parseSharedLanguage('{"language":"auto; rm"}'), null);
  assert.equal(parseSharedLanguage('{"chosen":true}'), null);
});

test("reads language.json from the directory, and a missing file is null", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "redrob-shared-"));
  try {
    assert.equal(await readSharedLanguage(dir), null);
    await writeFile(path.join(dir, "language.json"), '{"language":"ko","chosen":true}');
    assert.deepEqual(await readSharedLanguage(dir), { language: "ko", chosen: true, app: null });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
