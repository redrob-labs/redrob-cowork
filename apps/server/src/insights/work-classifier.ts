import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { DetectorIntegrityError, type OrtRuntime } from "../privacy/detector.js";
import { unigramFromTokenizerJson, type Unigram } from "./unigram.js";
import trainedHead from "./work-head.json" with { type: "json" };

/*
 * The work classifier: which family of work a session was (writing, a sheet, code, design), read
 * from its first message on this machine. Only the label leaves it.
 *
 * A frozen multilingual-e5-small encoder (int8 ONNX, about 118 MB, shipped like the privacy model)
 * turns the message into a sentence embedding; a softmax head trained on the hand-written set
 * (work-head.json, from scripts/insights-model/train.py) names the family or says it is not work.
 * Measured in docs/features/ai-work-insights/model-evaluation.md: the family level passes the bar,
 * the kind-of-work level does not yet, so the head carries no `action` and none is ever named.
 *
 * Trust mirrors the privacy model: REDROB_INSIGHTS_MODEL_DIR says where to look, the pinned manifest
 * hash says what to load, and the manifest's own hashes pin the weights and tokenizer.
 */

/** SHA-256 of apps/desktop/resources/insights-model/manifest.json. A test fails when they drift. */
export const PINNED_INSIGHTS_MANIFEST_SHA256: string | null = "185259b5d6b32571a57b6e67652f98f2fbc03daa6a7b91c652b62e5ff55fd296";

export const WORK_FAMILIES = ["write", "sheet", "code", "design"] as const;
export type WorkFamily = (typeof WORK_FAMILIES)[number];
export type WorkLabel = { family: WorkFamily | null; confidence: number };

/** What the encoder reads at most, as in training (truncation 256). */
const MAX_TOKENS = 256;

const Level = z.object({
  classes: z.array(z.enum(WORK_FAMILIES).nullable()),
  scale: z.number(),
  floor: z.number(),
  w: z.array(z.array(z.number())),
  b: z.array(z.number()),
});
const Head = z.object({ prefix: z.string(), family: Level });
export type WorkHead = z.infer<typeof Head>;

export const WORK_HEAD: WorkHead = Head.parse(trainedHead);

const Manifest = z.object({
  id: z.string(),
  revision: z.string(),
  license: z.string(),
  model: z.object({ file: z.string(), sha256: z.string() }),
  tokenizer: z.object({ file: z.string(), sha256: z.string() }),
});

/** The family for an L2-normalised sentence embedding, or null below the floor or for not work. */
export function labelEmbedding(head: WorkHead, embedding: Float32Array): WorkLabel {
  const { classes, scale, floor, w, b } = head.family;
  const logits = b.map((bias, k) => {
    let sum = bias;
    for (let i = 0; i < embedding.length; i += 1) sum += embedding[i]! * scale * w[i]![k]!;
    return sum;
  });
  const top = Math.max(...logits);
  const exps = logits.map((logit) => Math.exp(logit - top));
  const total = exps.reduce((sum, value) => sum + value, 0);
  const best = exps.indexOf(Math.max(...exps));
  const confidence = exps[best]! / total;
  const family = classes[best]!;
  return { family: family && confidence >= floor ? family : null, confidence };
}

/** Mean of the token vectors (every token is attended), then L2 normalisation. */
export function meanPool(hidden: Float32Array, tokens: number, width: number): Float32Array {
  const out = new Float32Array(width);
  for (let t = 0; t < tokens; t += 1) for (let i = 0; i < width; i += 1) out[i]! += hidden[t * width + i]! / tokens;
  const norm = Math.hypot(...out);
  for (let i = 0; i < width; i += 1) out[i]! /= norm;
  return out;
}

type OrtSession = {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown; dims: readonly number[] }>>;
  inputNames: readonly string[];
};

export interface WorkClassifier {
  readonly id: string;
  label(text: string): Promise<WorkLabel>;
}

class OnnxWorkClassifier implements WorkClassifier {
  constructor(
    readonly id: string,
    private readonly ort: OrtRuntime,
    private readonly session: OrtSession,
    private readonly tokenizer: Unigram,
    private readonly head: WorkHead,
  ) {}

  async label(text: string): Promise<WorkLabel> {
    if (!text.trim()) return { family: null, confidence: 0 };
    const ids = BigInt64Array.from(this.tokenizer.encode(this.head.prefix + text, MAX_TOKENS).map(BigInt));
    const dims = [1, ids.length] as const;
    const feeds: Record<string, unknown> = {
      input_ids: new this.ort.Tensor("int64", ids, dims),
      attention_mask: new this.ort.Tensor("int64", new BigInt64Array(ids.length).fill(1n), dims),
    };
    if (this.session.inputNames.includes("token_type_ids")) feeds.token_type_ids = new this.ort.Tensor("int64", new BigInt64Array(ids.length), dims);
    const output = (await this.session.run(feeds)).last_hidden_state;
    if (!output || !(output.data instanceof Float32Array)) throw new Error("the work model returned no last_hidden_state");
    return labelEmbedding(this.head, meanPool(output.data, ids.length, output.dims[2]!));
  }
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function loadWorkClassifier(
  directory: string,
  ort: OrtRuntime,
  options: { expectedManifestSha256?: string; head?: WorkHead } = {},
): Promise<WorkClassifier> {
  const manifestBytes = await readFile(join(directory, "manifest.json"));
  if (options.expectedManifestSha256 && sha256(manifestBytes) !== options.expectedManifestSha256) {
    throw new DetectorIntegrityError("work model manifest does not match the pinned hash");
  }
  const manifest = Manifest.parse(JSON.parse(manifestBytes.toString("utf8")));
  const [modelBytes, tokenizerBytes] = await Promise.all([
    readFile(join(directory, manifest.model.file)),
    readFile(join(directory, manifest.tokenizer.file)),
  ]);
  if (sha256(modelBytes) !== manifest.model.sha256) throw new DetectorIntegrityError("work model file does not match its manifest");
  if (sha256(tokenizerBytes) !== manifest.tokenizer.sha256) throw new DetectorIntegrityError("work model tokenizer does not match its manifest");
  const tokenizer = unigramFromTokenizerJson(JSON.parse(tokenizerBytes.toString("utf8")));
  const session = await ort.InferenceSession.create(new Uint8Array(modelBytes), {
    executionProviders: ["cpu"],
    // Basic only: exact, so the embeddings are the ones the head was trained on (train.py does the same).
    graphOptimizationLevel: "basic",
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
  });
  return new OnnxWorkClassifier(`${manifest.id}@${manifest.revision.slice(0, 8)}`, ort, session, tokenizer, options.head ?? WORK_HEAD);
}

export type WorkClassifierStatus =
  | { state: "ready"; model: string }
  | { state: "not-loaded" }
  | { state: "absent"; reason: string }
  | { state: "failed"; reason: string };

/**
 * The one work classifier per process, loaded on first use. Without a model, or in a runtime that
 * cannot load it, sessions are labeled without a family and `status()` says why; never throws.
 */
export class WorkClassifierSource {
  private loading: Promise<WorkClassifier | null> | null = null;
  private current: WorkClassifierStatus;

  constructor(
    private readonly options: {
      directory: string | null;
      pinnedManifestSha256: string | null;
      allowUnpinned: boolean;
      loadRuntime?: () => Promise<OrtRuntime>;
      load?: typeof loadWorkClassifier;
    },
  ) {
    const { directory, pinnedManifestSha256, allowUnpinned } = options;
    if (!directory) this.current = { state: "absent", reason: "no work model is installed" };
    else if (!existsSync(join(directory, "manifest.json"))) this.current = { state: "absent", reason: "the work model folder has no manifest" };
    else if (!pinnedManifestSha256 && !allowUnpinned) this.current = { state: "absent", reason: "this build trusts no work model yet" };
    else this.current = { state: "not-loaded" };
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): WorkClassifierSource {
    return new WorkClassifierSource({
      directory: env.REDROB_INSIGHTS_MODEL_DIR?.trim() || null,
      pinnedManifestSha256: PINNED_INSIGHTS_MANIFEST_SHA256,
      allowUnpinned: env.REDROB_DEV_MODE === "1",
    });
  }

  status(): WorkClassifierStatus {
    return this.current;
  }

  get(): Promise<WorkClassifier | null> {
    if (this.current.state === "absent" || this.current.state === "failed") return Promise.resolve(null);
    this.loading ??= this.load();
    return this.loading;
  }

  /** The family for a message, or null when there is no model or it fails. */
  async label(text: string): Promise<WorkLabel | null> {
    const classifier = await this.get();
    if (!classifier) return null;
    try {
      return await classifier.label(text);
    } catch (error) {
      this.current = { state: "failed", reason: `the work model failed: ${error instanceof Error ? error.message : String(error)}` };
      return null;
    }
  }

  private async load(): Promise<WorkClassifier | null> {
    const { directory, pinnedManifestSha256 } = this.options;
    try {
      const ort = await (this.options.loadRuntime ?? (async () => (await import("onnxruntime-node")) as unknown as OrtRuntime))();
      const classifier = await (this.options.load ?? loadWorkClassifier)(directory!, ort, {
        expectedManifestSha256: pinnedManifestSha256 ?? undefined,
      });
      this.current = { state: "ready", model: classifier.id };
      return classifier;
    } catch (error) {
      const reason =
        error instanceof DetectorIntegrityError
          ? `the work model failed its integrity check: ${error.message}`
          : `the work model could not be loaded: ${error instanceof Error ? error.message : String(error)}`;
      this.current = { state: "failed", reason };
      return null;
    }
  }
}
