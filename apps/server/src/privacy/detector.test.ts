import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DetectorSource } from "./detector-source.js";
import {
  decodeEntities,
  DetectorIntegrityError,
  loadDetector,
  parseTag,
  refineEntities,
  type DetectedEntity,
  type DetectorManifest,
  type EntityDetector,
  type OrtRuntime,
} from "./detector.js";
import parity from "./fixtures/wordpiece-parity.json" with { type: "json" };
import { PrivacyGate } from "./gate.js";
import type { PrivacyRules } from "./labels.js";
import { WordPiece } from "./wordpiece.js";
import type { ServerConfig } from "../types.js";

const LABELS = ["O", "B-PS", "I-PS", "B-OG", "I-OG", "B-LC", "I-LC"];
const MANIFEST: Pick<DetectorManifest, "labels" | "categories"> = {
  labels: LABELS,
  categories: { PS: "PERSON", OG: "ORG", LC: "ADDRESS" },
};
const vocab = new Map(Object.entries(parity.vocab as Record<string, number>));
const tokenizer = new WordPiece({ vocab });

/** Tokenizes `text` and tags each token with the label named for its piece (default O). */
function decode(text: string, tags: string[], options?: { minScore?: number; score?: number }) {
  const tokens = tokenizer.tokenize(text);
  expect(tokens.length).toBe(tags.length);
  const predictions = tags.map((tag) => ({ label: LABELS.indexOf(tag), score: options?.score ?? 0.95 }));
  return decodeEntities(text, tokens, predictions, MANIFEST, { minScore: options?.minScore });
}

const values = (entities: DetectedEntity[]) => entities.map(({ category, value }) => [category, value]);

describe("decoding the model's tags", () => {
  test("tag forms: prefix, suffix and O", () => {
    expect(parseTag("B-PS")).toEqual({ kind: "B", type: "PS" });
    expect(parseTag("PER-I")).toEqual({ kind: "I", type: "PER" });
    expect(parseTag("S-ADDRESS")).toEqual({ kind: "S", type: "ADDRESS" });
    expect(parseTag("O")).toEqual({ kind: "O", type: "" });
    expect(parseTag("garbage")).toEqual({ kind: "O", type: "" });
  });

  test("a name keeps its last syllable and drops the honorific and the particle after it", () => {
    // 김지 / ##원 / ##님 / ##은 계약 ##했 ##다 .
    const found = decode("김지원님은 계약했다.", ["B-PS", "I-PS", "I-PS", "O", "O", "O", "O", "O"]);
    expect(values(found)).toEqual([["PERSON", "김지원"]]);
  });

  test("a piece of a word the name already covers stays with it, whatever the model called it", () => {
    const found = decode("김지원님은 계약했다.", ["B-PS", "B-OG", "O", "O", "O", "O", "O", "O"]);
    expect(values(found)).toEqual([["PERSON", "김지원"]]);
  });

  test("a word the model stopped tagging stays out, so a particle never joins the next entity", () => {
    // ##원 tagged O ends the name; ##님 tagged as a name again does not start one mid-word.
    const found = decode("김지원님은 계약했다.", ["B-PS", "O", "B-PS", "O", "O", "O", "O", "O"]);
    expect(values(found)).toEqual([["PERSON", "김지"]]);
  });

  test("entities under the minimum score are dropped", () => {
    expect(decode("김지원님은 계약했다.", ["B-PS", "I-PS", "O", "O", "O", "O", "O", "O"], { score: 0.4 })).toEqual([]);
    expect(decode("김지원님은 계약했다.", ["B-PS", "I-PS", "O", "O", "O", "O", "O", "O"], { score: 0.4, minScore: 0.3 })).toHaveLength(1);
  });

  test("a Korean legal form before an organisation joins it", () => {
    // ( 주 ) 한빛 ...: only 한빛 is tagged.
    const text = "(주)한빛 Bluecrest Capital LLC";
    const tags = tokenizer.tokenize(text).map((token) => (token.piece === "한빛" ? "B-OG" : "O"));
    expect(values(decode(text, tags))).toEqual([["ORG", "(주)한빛"]]);
  });
});

describe("boundary fixes after decoding", () => {
  const at = (text: string, value: string, category: DetectedEntity["category"]): DetectedEntity => {
    const start = text.indexOf(value);
    return { category, start, end: start + value.length, value, score: 0.9 };
  };

  test("capitalised words up to an English legal form make an organisation", () => {
    const text = "Payable to Bluecrest Capital LLC by Friday.";
    expect(values(refineEntities(text, [at(text, "Bluecrest", "PERSON")]))).toEqual([["ORG", "Bluecrest Capital LLC"]]);
    // Already ending in a legal form: nothing added.
    const self = "Acme Corp, Seoul";
    expect(values(refineEntities(self, [at(self, "Acme Corp", "ORG")]))).toEqual([["ORG", "Acme Corp"]]);
  });

  test("pieces of one address split by commas are one address, with its ZIP code", () => {
    const text = "Ship to 8700 Pine Lane, Suite 387, Austin, TX 78701 today.";
    const found = refineEntities(text, [at(text, "8700 Pine Lane", "ADDRESS"), at(text, "Suite 387, Austin", "ADDRESS")]);
    expect(values(found)).toEqual([["ADDRESS", "8700 Pine Lane, Suite 387, Austin, TX 78701"]]);
  });

  test("two people next to each other stay two people", () => {
    const text = "김지원, 박서연 참석";
    const found = refineEntities(text, [at(text, "김지원", "PERSON"), at(text, "박서연", "PERSON")]);
    expect(values(found)).toEqual([
      ["PERSON", "김지원"],
      ["PERSON", "박서연"],
    ]);
  });

  test("an overlap prefers the organisation and keeps the wider span", () => {
    const text = "주식회사 한빛 대표";
    const found = refineEntities(text, [at(text, "한빛", "PERSON"), at(text, "주식회사 한빛", "ORG")]);
    expect(values(found)).toEqual([["ORG", "주식회사 한빛"]]);
  });
});

/* ---------- Loading a model directory ---------- */

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop() ?? "", { recursive: true, force: true }).catch(() => {});
});

const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A fake runtime whose "model" tags every token of 김지원 as a person and the rest O. */
function fakeRuntime(calls: { runs: number; windows: number[] }): OrtRuntime {
  const personIds = new Set([vocab.get("김지")!, vocab.get("##원")!]);
  class Tensor {
    constructor(
      readonly type: string,
      readonly data: BigInt64Array,
      readonly dims: readonly number[],
    ) {}
  }
  return {
    Tensor: Tensor as unknown as OrtRuntime["Tensor"],
    InferenceSession: {
      async create() {
        return {
          inputNames: ["input_ids", "attention_mask", "token_type_ids"],
          async run(feeds: Record<string, unknown>) {
            calls.runs += 1;
            const ids = (feeds.input_ids as Tensor).data;
            calls.windows.push(ids.length);
            const logits = new Float32Array(ids.length * LABELS.length);
            ids.forEach((id, position) => {
              const prev = position > 0 ? ids[position - 1]! : -1n;
              const label = personIds.has(Number(id)) ? (Number(id) === vocab.get("김지") || !personIds.has(Number(prev)) ? 1 : 2) : 0;
              logits[position * LABELS.length + label] = 10;
            });
            return { logits: { data: logits, dims: [1, ids.length, LABELS.length] } };
          },
        };
      },
    },
  };
}

async function modelDir(tamper?: "model" | "tokenizer") {
  const dir = await mkdtemp(join(tmpdir(), "redrob-detector-"));
  dirs.push(dir);
  const model = "fake onnx bytes";
  const tokenizerJson = JSON.stringify({ model: { type: "WordPiece", vocab: parity.vocab } });
  const manifest: DetectorManifest = {
    id: "test/fake-ner",
    revision: "0123456789abcdef",
    license: "Apache-2.0",
    model: { file: "model.onnx", sha256: sha256(model) },
    tokenizer: { file: "tokenizer.json", sha256: sha256(tokenizerJson) },
    ...MANIFEST,
  };
  const manifestText = JSON.stringify(manifest);
  await writeFile(join(dir, "manifest.json"), manifestText);
  await writeFile(join(dir, "model.onnx"), tamper === "model" ? `${model}!` : model);
  await writeFile(join(dir, "tokenizer.json"), tamper === "tokenizer" ? `${tokenizerJson} ` : tokenizerJson);
  return { dir, manifestSha256: sha256(manifestText) };
}

describe("loading a model", () => {
  test("a verified model finds every mention, across windows longer than the model's limit", async () => {
    const { dir, manifestSha256 } = await modelDir();
    const calls = { runs: 0, windows: [] as number[] };
    const detector = await loadDetector(dir, fakeRuntime(calls), { expectedManifestSha256: manifestSha256 });
    expect(detector.id).toBe("test/fake-ner@01234567");
    // 김지 ##원 계약 = 3 tokens a mention: 150 mentions need several 254-token windows.
    const text = Array.from({ length: 150 }, () => "김지원 계약").join(" ");
    const found = await detector.detect(text);
    expect(calls.runs).toBeGreaterThan(1);
    expect(Math.max(...calls.windows)).toBeLessThanOrEqual(256);
    expect(found).toHaveLength(150);
    expect(new Set(found.map((entity) => entity.value))).toEqual(new Set(["김지원"]));
    expect(await detector.detect("   ")).toEqual([]);
  });

  test("a model, tokenizer or manifest that does not match its hash is refused before it runs", async () => {
    const calls = { runs: 0, windows: [] as number[] };
    for (const tamper of ["model", "tokenizer"] as const) {
      const { dir } = await modelDir(tamper);
      await expect(loadDetector(dir, fakeRuntime(calls))).rejects.toBeInstanceOf(DetectorIntegrityError);
    }
    const { dir } = await modelDir();
    await expect(loadDetector(dir, fakeRuntime(calls), { expectedManifestSha256: "0".repeat(64) })).rejects.toBeInstanceOf(
      DetectorIntegrityError,
    );
    expect(calls.runs).toBe(0);
  });
});

describe("the detector source", () => {
  test("no model, an unpinned model outside dev mode, and a failed load all say why", async () => {
    expect(new DetectorSource({ directory: null, pinnedManifestSha256: null, allowUnpinned: true }).status()).toEqual({
      state: "absent",
      reason: "no privacy model is installed",
    });
    const { dir } = await modelDir();
    const unpinned = new DetectorSource({ directory: dir, pinnedManifestSha256: null, allowUnpinned: false });
    expect(unpinned.status().state).toBe("absent");
    expect(await unpinned.get()).toBeNull();

    const broken = new DetectorSource({
      directory: dir,
      pinnedManifestSha256: null,
      allowUnpinned: true,
      loadRuntime: async () => {
        throw new Error("dlopen failed");
      },
    });
    expect(broken.status()).toEqual({ state: "not-loaded" });
    expect(await broken.get()).toBeNull();
    expect(broken.status()).toEqual({ state: "failed", reason: "the privacy model could not be loaded: dlopen failed" });

    const tampered = await modelDir("model");
    const refused = new DetectorSource({
      directory: tampered.dir,
      pinnedManifestSha256: tampered.manifestSha256,
      allowUnpinned: false,
      loadRuntime: async () => fakeRuntime({ runs: 0, windows: [] }),
    });
    expect(await refused.get()).toBeNull();
    expect(refused.status().state).toBe("failed");
    expect((refused.status() as { reason: string }).reason).toContain("integrity check");
  });

  test("a pinned model loads once, and a text already read is not read again", async () => {
    const { dir, manifestSha256 } = await modelDir();
    const calls = { runs: 0, windows: [] as number[] };
    const source = new DetectorSource({
      directory: dir,
      pinnedManifestSha256: manifestSha256,
      allowUnpinned: false,
      loadRuntime: async () => fakeRuntime(calls),
    });
    const [a, b] = await Promise.all([source.get(), source.get()]);
    expect(a).toBe(b);
    expect(source.status()).toEqual({ state: "ready", model: "test/fake-ner@01234567" });
    await source.detect(a!, "김지원 계약");
    await source.detect(a!, "김지원 계약");
    expect(calls.runs).toBe(1);
  });
});

/* ---------- The gate with a detector ---------- */

class FixedRulesGate extends PrivacyGate {
  constructor(
    private readonly fixed: PrivacyRules,
    detectors: DetectorSource,
  ) {
    super({ workspaces: [] } as unknown as ServerConfig, () => null, detectors);
  }
  override async rules(): Promise<PrivacyRules> {
    return this.fixed;
  }
}

function sourceWith(detector: EntityDetector | Error): DetectorSource {
  const source = new DetectorSource({ directory: null, pinnedManifestSha256: null, allowUnpinned: true });
  // The source's loading is covered above; here only what the gate does with a detector matters.
  source.get = async () => (detector instanceof Error ? null : detector);
  return source;
}

const fakeDetector = (entities: (text: string) => DetectedEntity[]): EntityDetector => ({
  id: "fake",
  detect: async (text) => entities(text),
});

const find = (text: string, value: string, category: DetectedEntity["category"]): DetectedEntity[] => {
  const start = text.indexOf(value);
  return start < 0 ? [] : [{ category, start, end: start + value.length, value, score: 0.9 }];
};

describe("the gate with a detection model", () => {
  const text = "박서연 대표가 서울시 강남구 테헤란로 152에서 한빛상사와 계약했다.";
  const detector = fakeDetector((input) => [
    ...find(input, "박서연", "PERSON"),
    ...find(input, "서울시 강남구 테헤란로 152", "ADDRESS"),
    ...find(input, "한빛상사", "ORG"),
  ]);

  test("Strict labels the model's names, organisations and addresses, and every later mention", async () => {
    const gate = new FixedRulesGate({ level: "strict", names: [] }, sourceWith(detector));
    const out = await gate.label({ sessionID: "s1", directory: null, texts: [text] });
    expect(out.detection).toBe("model");
    for (const secret of ["박서연", "테헤란로", "한빛상사"]) expect(out.texts[0]).not.toContain(secret);
    expect(out.found).toEqual(expect.arrayContaining(["PERSON", "ADDRESS", "ORG"]));
    expect(gate.restore({ sessionID: "s1", value: out.texts[0] }).value).toBe(text);

    // A later turn the model misses still gets the chat's labels.
    const blind = new FixedRulesGate({ level: "strict", names: [] }, sourceWith(fakeDetector(() => [])));
    const shared = (gate as unknown as { maps: Map<string, unknown> }).maps;
    (blind as unknown as { maps: Map<string, unknown> }).maps.set("s1", shared.get("s1"));
    const later = await blind.label({ sessionID: "s1", directory: null, texts: ["박서연에게 회신"] });
    expect(later.texts[0]).toBe("[PERSON_1]에게 회신");
  });

  test("High uses the model for organisations and addresses but leaves its names alone", async () => {
    const gate = new FixedRulesGate({ level: "high", names: [] }, sourceWith(detector));
    const out = await gate.label({ sessionID: "s2", directory: null, texts: [text] });
    expect(out.texts[0]).toContain("박서연");
    expect(out.texts[0]).not.toContain("한빛상사");
    expect(out.texts[0]).not.toContain("테헤란로");
  });

  test("Standard never loads the model, and without one the gate says it used patterns", async () => {
    let asked = 0;
    const source = sourceWith(detector);
    source.get = async () => {
      asked += 1;
      return detector;
    };
    const standard = await new FixedRulesGate({ level: "standard", names: [] }, source).label({ sessionID: "s3", directory: null, texts: [text] });
    expect(asked).toBe(0);
    expect(standard.texts[0]).toBe(text);
    expect(standard.detection).toBe("patterns");

    const none = await new FixedRulesGate({ level: "strict", names: [] }, sourceWith(new Error("absent"))).label({
      sessionID: "s4",
      directory: null,
      texts: [text],
    });
    expect(none.detection).toBe("patterns");
    expect(none.texts[0]).toContain("박서연");
  });

  test("a model that fails while reading fails the request, it does not send the text unlabelled", async () => {
    const gate = new FixedRulesGate(
      { level: "strict", names: [] },
      sourceWith(
        fakeDetector(() => {
          throw new Error("session lost");
        }),
      ),
    );
    await expect(gate.label({ sessionID: "s5", directory: null, texts: [text] })).rejects.toThrow("session lost");
  });
});
