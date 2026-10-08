import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { OrtRuntime } from "../privacy/detector.js";
import {
  labelEmbedding,
  loadWorkClassifier,
  meanPool,
  PINNED_INSIGHTS_MANIFEST_SHA256,
  WORK_HEAD,
  WorkClassifierSource,
  type WorkHead,
} from "./work-classifier.js";
import { WORK_ACTIONS } from "./vocabulary.js";

const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Two dimensions: along the first is code, along the second is not work. No kind of work. */
const HEAD: WorkHead = {
  prefix: "query: ",
  action: null,
  family: { classes: ["code", null], scale: 20, floor: 0.6, w: [[1, 0], [0, 1]], b: [0, 0] },
};
/** Three dimensions: a fix, a test, or not work; the family head knows code from not work. */
const BOTH: WorkHead = {
  prefix: "query: ",
  action: { classes: ["fix", "test", null], scale: 20, floor: 0.6, w: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], b: [0, 0, 0] },
  family: { classes: ["code", null], scale: 20, floor: 0.6, w: [[1, 0], [1, 0], [0, 1]], b: [0, 0] },
};

const TOKENIZER = JSON.stringify({
  added_tokens: [
    { id: 0, content: "<s>", special: true },
    { id: 2, content: "</s>", special: true },
    { id: 3, content: "<unk>", special: true },
  ],
  normalizer: { type: "Sequence", normalizers: [{ type: "Replace" }] },
  pre_tokenizer: { type: "Metaspace", replacement: "\u2581" },
  model: { type: "Unigram", unk_id: 3, vocab: [["<s>", 0], ["<pad>", 0], ["</s>", 0], ["<unk>", 0], ["\u2581fix", -1], ["\u2581query:", -1]] },
});

/** An encoder whose every token vector is `vector`, recording what it was fed. */
function fakeOrt(vector: number[], seen: bigint[][] = []): OrtRuntime {
  return {
    Tensor: class {
      constructor(
        readonly type: string,
        readonly data: BigInt64Array,
        readonly dims: readonly number[],
      ) {}
    },
    InferenceSession: {
      create: async () => ({
        inputNames: ["input_ids", "attention_mask"],
        run: async (feeds: Record<string, unknown>) => {
          const ids = feeds.input_ids;
          const length = ids && typeof ids === "object" && "data" in ids && ids.data instanceof BigInt64Array ? ids.data.length : 0;
          if (ids && typeof ids === "object" && "data" in ids && ids.data instanceof BigInt64Array) seen.push([...ids.data]);
          const data = new Float32Array(length * vector.length);
          for (let t = 0; t < length; t += 1) data.set(vector, t * vector.length);
          return { last_hidden_state: { data, dims: [1, length, vector.length] } };
        },
      }),
    },
  };
}

async function modelDir(tokenizer = TOKENIZER) {
  const dir = await mkdtemp(join(tmpdir(), "work-model-"));
  const manifest = JSON.stringify({
    id: "test/encoder",
    revision: "0123456789abcdef",
    license: "MIT",
    model: { file: "model.onnx", sha256: sha("weights") },
    tokenizer: { file: "tokenizer.json", sha256: sha(TOKENIZER) },
  });
  await writeFile(join(dir, "manifest.json"), manifest);
  await writeFile(join(dir, "model.onnx"), "weights");
  await writeFile(join(dir, "tokenizer.json"), tokenizer);
  return { dir, manifestSha: sha(manifest) };
}

describe("work classifier", () => {
  test("the pinned hash is the shipped manifest's, and the shipped head names every kind of work and family", async () => {
    const shipped = await readFile(join(import.meta.dir, "../../../desktop/resources/insights-model/manifest.json"));
    expect(sha(shipped)).toBe(PINNED_INSIGHTS_MANIFEST_SHA256!);
    expect(JSON.parse(shipped.toString()).id).toBe("Xenova/multilingual-e5-base");
    expect(WORK_HEAD.prefix).toBe("query: ");
    expect(WORK_HEAD.family.classes).toEqual(["code", "design", "sheet", "write", null]);
    expect(WORK_HEAD.family.w).toHaveLength(768);
    expect(WORK_HEAD.action?.classes).toEqual([...[...WORK_ACTIONS].sort(), null]);
    expect(WORK_HEAD.action?.w).toHaveLength(768);
  });

  test("a kind of work above its floor brings its family; below it, the family head may still name one", () => {
    expect(labelEmbedding(BOTH, Float32Array.from([1, 0, 0]))).toMatchObject({ action: "fix", family: "code" });
    // Torn between a fix and a test, so no kind of work, but surely code.
    expect(labelEmbedding(BOTH, Float32Array.from([0.5, 0.5, 0]))).toMatchObject({ action: null, family: "code" });
    expect(labelEmbedding(BOTH, Float32Array.from([0, 0, 1]))).toMatchObject({ action: null, family: null });
  });

  test("names the family above the floor, and nothing for not work or below it", () => {
    expect(labelEmbedding(HEAD, Float32Array.from([1, 0])).family).toBe("code");
    expect(labelEmbedding(HEAD, Float32Array.from([0, 1])).family).toBeNull();
    const unsure = labelEmbedding(HEAD, Float32Array.from([0.51, 0.49]));
    expect(unsure.family).toBeNull();
    expect(unsure.confidence).toBeGreaterThan(0.5);
  });

  test("mean-pools the tokens and normalises the result", () => {
    expect([...meanPool(Float32Array.from([3, 0, 1, 4]), 2, 2)].map((value) => Math.round(value * 1000) / 1000)).toEqual([0.707, 0.707]);
  });

  test("reads the message with the query prefix, at most 256 tokens, and labels it", async () => {
    const { dir, manifestSha } = await modelDir();
    const seen: bigint[][] = [];
    const classifier = await loadWorkClassifier(dir, fakeOrt([2, 0], seen), { expectedManifestSha256: manifestSha, head: HEAD });
    expect(classifier.id).toBe("test/encoder@01234567");
    expect((await classifier.label("fix")).family).toBe("code");
    expect(seen[0]).toEqual([0n, 5n, 4n, 2n]);
    await classifier.label("fix ".repeat(400));
    expect(seen[1]).toHaveLength(256);
    expect(await classifier.label("   ")).toEqual({ action: null, family: null, confidence: 0 });
    expect(seen).toHaveLength(2);
  });

  test("refuses a manifest that is not the pinned one, and a tokenizer that does not match its hash", async () => {
    const { dir } = await modelDir();
    await expect(loadWorkClassifier(dir, fakeOrt([1, 0]), { expectedManifestSha256: sha("other") })).rejects.toThrow(/pinned hash/);
    const tampered = await modelDir(TOKENIZER.replace("fix", "fox"));
    await expect(loadWorkClassifier(tampered.dir, fakeOrt([1, 0]), { expectedManifestSha256: tampered.manifestSha })).rejects.toThrow(/tokenizer does not match/);
  });

  test("the source says why there is no model, and pointing it at another one loads nothing", async () => {
    expect(WorkClassifierSource.fromEnvironment({}).status()).toEqual({ state: "absent", reason: "no work model is installed" });
    const { dir } = await modelDir();
    for (const env of [{ REDROB_INSIGHTS_MODEL_DIR: dir }, { REDROB_INSIGHTS_MODEL_DIR: dir, REDROB_DEV_MODE: "1" }]) {
      const source = new WorkClassifierSource({
        directory: env.REDROB_INSIGHTS_MODEL_DIR,
        pinnedManifestSha256: PINNED_INSIGHTS_MANIFEST_SHA256,
        allowUnpinned: "REDROB_DEV_MODE" in env,
        loadRuntime: async () => fakeOrt([1, 0]),
      });
      expect(await source.label("fix the login bug")).toBeNull();
      expect(source.status()).toMatchObject({ state: "failed", reason: expect.stringMatching(/integrity check/) });
    }
  });

  test("a model that fails mid-run labels nothing from then on", async () => {
    let calls = 0;
    const empty = new WorkClassifierSource({ directory: import.meta.dir, pinnedManifestSha256: null, allowUnpinned: true });
    expect(empty.status()).toEqual({ state: "absent", reason: "the work model folder has no manifest" });
    const { dir } = await modelDir();
    const ready = new WorkClassifierSource({
      directory: dir,
      pinnedManifestSha256: null,
      allowUnpinned: true,
      loadRuntime: async () => fakeOrt([1, 0]),
      load: async () => ({
        id: "x",
        label: async () => {
          calls += 1;
          throw new Error("boom");
        },
      }),
    });
    expect(await ready.label("a")).toBeNull();
    expect(await ready.label("b")).toBeNull();
    expect(calls).toBe(1);
    expect(ready.status()).toMatchObject({ state: "failed" });
  });
});
