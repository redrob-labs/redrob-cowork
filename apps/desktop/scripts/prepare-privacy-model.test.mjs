import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MODEL_DIR,
  pinnedFiles,
  preparePrivacyModel,
  releaseAssetUrl,
  removeUnverified,
} from "./prepare-privacy-model.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");
const MODEL = "fake onnx bytes";
const TOKENIZER = '{"model":{"vocab":{}}}';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "privacy-model-"));
  const modelDir = path.join(root, "privacy-model");
  const source = path.join(root, "source");
  await Promise.all([mkdir(modelDir), mkdir(source)]);
  const manifest = {
    id: "test/model",
    model: { file: "model.int8.onnx", sha256: sha(MODEL) },
    tokenizer: { file: "tokenizer.json", sha256: sha(TOKENIZER) },
  };
  await writeFile(path.join(modelDir, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(source, "model.int8.onnx"), MODEL);
  await writeFile(path.join(source, "tokenizer.json"), TOKENIZER);
  return { modelDir, source };
}

const quiet = () => {};

describe("prepare-privacy-model", () => {
  it("copies from a local folder, and leaves verified files alone on the next run", async () => {
    const { modelDir, source } = await fixture();
    assert.deepEqual(await preparePrivacyModel({ modelDir, source, releaseTag: "t", log: quiet }), {
      "model.int8.onnx": "source",
      "tokenizer.json": "source",
    });
    assert.equal(await readFile(path.join(modelDir, "model.int8.onnx"), "utf8"), MODEL);
    assert.deepEqual(await preparePrivacyModel({ modelDir, source: null, releaseTag: "t", fetchImpl: () => assert.fail("no download"), log: quiet }), {
      "model.int8.onnx": "present",
      "tokenizer.json": "present",
    });
  });

  it("downloads from the pinned release and keeps only bytes that match the manifest", async () => {
    const { modelDir } = await fixture();
    const asked = [];
    const fetchImpl = async (url) => {
      asked.push(url);
      return new Response(url.endsWith("tokenizer.json") ? TOKENIZER : MODEL);
    };
    await preparePrivacyModel({ modelDir, source: null, releaseTag: "privacy-model-x", fetchImpl, log: quiet });
    assert.deepEqual(asked, [
      "https://github.com/redrob-labs/redrob-cowork/releases/download/privacy-model-x/model.int8.onnx",
      "https://github.com/redrob-labs/redrob-cowork/releases/download/privacy-model-x/tokenizer.json",
    ]);
  });

  it("refuses a tampered download or source, and writes nothing in its place", async () => {
    const { modelDir, source } = await fixture();
    await assert.rejects(
      preparePrivacyModel({ modelDir, source: null, releaseTag: "t", fetchImpl: async () => new Response("evil"), log: quiet }),
      /does not match the pinned SHA-256/,
    );
    assert.equal(existsSync(path.join(modelDir, "model.int8.onnx")), false);
    await writeFile(path.join(source, "tokenizer.json"), "{}");
    await assert.rejects(preparePrivacyModel({ modelDir, source, releaseTag: "t", log: quiet }), /tokenizer\.json does not match/);
    assert.equal(existsSync(path.join(modelDir, "tokenizer.json")), false);
  });

  it("fails on a release that does not answer, and removeUnverified clears a stale file", async () => {
    const { modelDir } = await fixture();
    await assert.rejects(
      preparePrivacyModel({ modelDir, source: null, releaseTag: "t", fetchImpl: async () => new Response("", { status: 404 }), log: quiet }),
      /answered 404/,
    );
    await writeFile(path.join(modelDir, "model.int8.onnx"), "stale");
    await removeUnverified(modelDir);
    assert.equal(existsSync(path.join(modelDir, "model.int8.onnx")), false);
  });

  it("refuses a manifest that points outside its folder", () => {
    assert.throws(
      () => pinnedFiles({ model: { file: "../../etc/x", sha256: sha("a") }, tokenizer: { file: "t.json", sha256: sha("b") } }),
      /names a path/,
    );
    assert.equal(releaseAssetUrl("a b", "m.onnx"), "https://github.com/redrob-labs/redrob-cowork/releases/download/a%20b/m.onnx");
  });

  it("the tracked manifest pins both files, and constants.json names the release they come from", async () => {
    const manifest = JSON.parse(await readFile(path.join(DEFAULT_MODEL_DIR, "manifest.json"), "utf8"));
    assert.deepEqual(pinnedFiles(manifest).map((entry) => entry.file), ["model.int8.onnx", "tokenizer.json"]);
    const constants = JSON.parse(
      await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../constants.json"), "utf8"),
    );
    assert.match(constants.privacyModelRelease, /^privacy-model-/);
  });
});
