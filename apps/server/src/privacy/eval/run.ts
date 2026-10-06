/*
 * `pnpm privacy:eval`: measures each prepared candidate (scripts/privacy-model/prepare.py) on the
 * evaluation set, in the runtime redrob-server ships (onnxruntime-node; run it under Node, as
 * the desktop app runs the server inside Electron, with `pnpm privacy:eval`), and writes a JSON and a Markdown report.
 *
 *   pnpm privacy:eval [--models DIR] [--out DIR]
 *       [--threads N] [--min-score 0.5] [--only key,key]
 *
 * Scoring, per category (PERSON, ORG, ADDRESS):
 *   - precision: found entities that overlap a marked entity of the same category;
 *   - recall: marked entities a found entity of the same category fully covers, since a name only
 *     half hidden is still a leak;
 *   - exact: found entities with exactly the marked boundaries, reported, not gated.
 * The gate (the plan's quality bar): PERSON precision >= 0.90 and recall >= 0.85, model file at most
 * 120 MB, and 1,000 characters in at most 150 ms (median of 40 runs).
 *
 * `pipeline` scores what the gate actually sends at Strict: patterns and the model together, through
 * labelText, against the same marks, next to patterns alone.
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, loadavg } from "node:os";
import { parseArgs } from "node:util";

import { loadDetector, type DetectedEntity, type EntityDetector, type OrtRuntime } from "../detector.js";
import { emptyLabelMap, labelText, MODEL_CATEGORIES, type DetectedValue, type PrivacyRules } from "../labels.js";
import { buildEvaluationSet, latencyDocument, type GoldCategory, type Sample } from "./dataset.js";

/** apps/server, found from this file so the script runs the same under Bun and Node. */
const SERVER_ROOT = process.env.REDROB_SERVER_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const CATEGORIES: GoldCategory[] = ["PERSON", "ORG", "ADDRESS"];
/** Latency runs per candidate, after 3 warm-up runs. */
const RUNS = 40;
const BAR = { precision: 0.9, recall: 0.85, maxBytes: 120 * 1024 * 1024, maxMs: 150 };

type Counts = { tp: number; fp: number; covered: number; exact: number; gold: number; found: number };
const empty = (): Counts => ({ tp: 0, fp: 0, covered: 0, exact: 0, gold: 0, found: 0 });

function score(samples: Sample[], found: Map<string, DetectedEntity[]>) {
  const by: Record<string, Counts> = {};
  const bucket = (key: string) => (by[key] ??= empty());
  for (const sample of samples) {
    const entities = found.get(sample.id) ?? [];
    for (const category of CATEGORIES) {
      const gold = sample.gold.filter((span) => span.category === category);
      const mine = entities.filter((entity) => entity.category === category);
      for (const key of [category, `${category}/${sample.lang}`, `${category}/${sample.source}`]) {
        const counts = bucket(key);
        counts.gold += gold.length;
        counts.found += mine.length;
        for (const entity of mine) {
          const overlaps = gold.some((span) => entity.start < span.end && span.start < entity.end);
          if (overlaps) counts.tp += 1;
          else counts.fp += 1;
          if (gold.some((span) => span.start === entity.start && span.end === entity.end)) counts.exact += 1;
        }
        for (const span of gold) {
          if (mine.some((entity) => entity.start <= span.start && entity.end >= span.end)) counts.covered += 1;
        }
      }
    }
  }
  const metrics: Record<string, { precision: number; recall: number; exactF1: number; gold: number; found: number; falseAlarms: number }> = {};
  for (const [key, counts] of Object.entries(by)) {
    const precision = counts.found ? counts.tp / counts.found : counts.gold ? 0 : 1;
    const recall = counts.gold ? counts.covered / counts.gold : 1;
    const exactP = counts.found ? counts.exact / counts.found : 0;
    const exactR = counts.gold ? counts.exact / counts.gold : 0;
    metrics[key] = {
      precision,
      recall,
      exactF1: exactP + exactR ? (2 * exactP * exactR) / (exactP + exactR) : 0,
      gold: counts.gold,
      found: counts.found,
      falseAlarms: counts.fp,
    };
  }
  return metrics;
}

/** Where labelText put labels, as spans in the original text, by category. */
function pipelineSpans(sample: Sample, detected: DetectedValue[]): DetectedEntity[] {
  const rules: PrivacyRules = { level: "strict", names: [] };
  const map = emptyLabelMap();
  labelText(sample.text, rules, map, detected);
  const spans: DetectedEntity[] = [];
  for (const [label, value] of Object.entries(map.byLabel)) {
    const category = /^\[([A-Z]+)_\d+\]$/.exec(label)?.[1];
    if (category !== "PERSON" && category !== "ORG" && category !== "ADDRESS") continue;
    let from = 0;
    for (;;) {
      const at = sample.text.indexOf(value, from);
      if (at < 0) break;
      spans.push({ category, start: at, end: at + value.length, value, score: 1 });
      from = at + value.length;
    }
  }
  return spans;
}

async function loadRuntime(): Promise<OrtRuntime> {
  return (await import("onnxruntime-node")) as unknown as OrtRuntime;
}

const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)]!;
const median = (values: number[]) => quantile(values, 0.5);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

async function measure(key: string, directory: string, ort: OrtRuntime, samples: Sample[], threads: number, minScore: number) {
  const started = performance.now();
  const detector = (await loadDetector(directory, ort, { threads, decode: { minScore } })) as EntityDetector & {
    manifest: { model: { file: string }; id: string; revision: string; license: string };
  };
  const loadMs = performance.now() - started;
  const bytes = (await stat(join(directory, detector.manifest.model.file))).size;

  const found = new Map<string, DetectedEntity[]>();
  const pipeline = new Map<string, DetectedEntity[]>();
  for (const sample of samples) {
    const entities = await detector.detect(sample.text);
    found.set(sample.id, entities);
    const allowed = new Set(MODEL_CATEGORIES.strict);
    pipeline.set(
      sample.id,
      pipelineSpans(
        sample,
        entities.filter((entity) => allowed.has(entity.category)).map(({ category, value }) => ({ category, value })),
      ),
    );
  }

  const doc = latencyDocument();
  for (let index = 0; index < 3; index += 1) await detector.detect(doc);
  const times: number[] = [];
  for (let index = 0; index < RUNS; index += 1) {
    const t0 = performance.now();
    await detector.detect(doc);
    times.push(performance.now() - t0);
  }

  const model = score(samples, found);
  const person = model.PERSON!;
  const passes = {
    precision: person.precision >= BAR.precision,
    recall: person.recall >= BAR.recall,
    size: bytes <= BAR.maxBytes,
    latency: median(times) <= BAR.maxMs,
  };
  return {
    key,
    id: detector.manifest.id,
    revision: detector.manifest.revision,
    license: detector.manifest.license,
    bytes,
    loadMs: Math.round(loadMs),
    latencyMs: { median: Number(median(times).toFixed(1)), p10: Number(quantile(times, 0.1).toFixed(1)), max: Number(Math.max(...times).toFixed(1)), chars: doc.length },
    model,
    pipeline: score(samples, pipeline),
    passes,
    passed: Object.values(passes).every(Boolean),
  };
}

type Result = Awaited<ReturnType<typeof measure>>;

function markdown(results: Result[], baseline: ReturnType<typeof score>, meta: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`# Privacy model measurement`, "", `Generated by \`pnpm privacy:eval\` on ${meta.date}. Runtime: ${meta.runtime} (${meta.threads} thread(s)) on ${meta.platform}, ${meta.cpu}, load average ${meta.load} at start. Evaluation set: ${meta.samples} samples (${meta.breakdown}). Minimum entity score ${meta.minScore}.`, "");
  lines.push(`Bar: PERSON precision ≥ 90% and recall ≥ 85%, model ≤ 120 MB, 1,000 characters ≤ 150 ms (median).`, "");
  lines.push(`| Candidate | Size | Load | ms / 1k chars (median, p10) | PERSON P / R | ORG P / R | ADDRESS P / R | Bar |`, `|---|---|---|---|---|---|---|---|`);
  for (const r of results) {
    const cell = (c: string) => `${pct(r.model[c]!.precision)} / ${pct(r.model[c]!.recall)}`;
    const failed = Object.entries(r.passes).filter(([, ok]) => !ok).map(([name]) => name);
    lines.push(`| ${r.id} (${r.key}) | ${(r.bytes / 1e6).toFixed(1)} MB | ${r.loadMs} ms | ${r.latencyMs.median} (${r.latencyMs.p10}) | ${cell("PERSON")} | ${cell("ORG")} | ${cell("ADDRESS")} | ${r.passed ? "pass" : `fail: ${failed.join(", ")}`} |`);
  }
  lines.push("", `## By language and source (PERSON precision / recall)`, "", `| Candidate | ko | en | mixed | generated | handwritten | false alarms on negatives |`, `|---|---|---|---|---|---|---|`);
  for (const r of results) {
    const cell = (k: string) => (r.model[k] ? `${pct(r.model[k]!.precision)} / ${pct(r.model[k]!.recall)}` : "–");
    const negatives = CATEGORIES.reduce((sum, c) => sum + (r.model[`${c}/negative`]?.falseAlarms ?? 0), 0);
    lines.push(`| ${r.key} | ${cell("PERSON/ko")} | ${cell("PERSON/en")} | ${cell("PERSON/mixed")} | ${cell("PERSON/generated")} | ${cell("PERSON/handwritten")} | ${negatives} |`);
  }
  lines.push("", `## What the gate sends at Strict (patterns + model, recall)`, "", `| | PERSON | ORG | ADDRESS |`, `|---|---|---|---|`);
  lines.push(`| patterns only | ${pct(baseline.PERSON!.recall)} | ${pct(baseline.ORG!.recall)} | ${pct(baseline.ADDRESS!.recall)} |`);
  for (const r of results) lines.push(`| + ${r.key} | ${pct(r.pipeline.PERSON!.recall)} | ${pct(r.pipeline.ORG!.recall)} | ${pct(r.pipeline.ADDRESS!.recall)} |`);
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({
    options: {
      models: { type: "string", default: resolve(SERVER_ROOT, ".privacy-models") },
      out: { type: "string", default: resolve(SERVER_ROOT, ".privacy-models", "report") },
      threads: { type: "string", default: "2" },
      "min-score": { type: "string", default: "0.5" },
      only: { type: "string" },
    },
  });
  const samples = buildEvaluationSet();
  const threads = Number(values.threads);
  const ort = await loadRuntime();
  const minScore = Number(values["min-score"]);
  const only = values.only ? new Set(values.only.split(",")) : null;
  const keys = (await readdir(values.models!, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("report") && (!only || only.has(entry.name)))
    .map((entry) => entry.name)
    .sort();

  const results: Result[] = [];
  for (const key of keys) {
    const directory = join(values.models!, key);
    try {
      await readFile(join(directory, "manifest.json"));
    } catch {
      continue;
    }
    const result = await measure(key, directory, ort, samples, threads, minScore);
    console.log(`${key}: PERSON ${pct(result.model.PERSON!.precision)}/${pct(result.model.PERSON!.recall)}, ${result.latencyMs.median} ms, ${result.passed ? "PASS" : "fail"}`);
    results.push(result);
  }

  const baseline = score(samples, new Map(samples.map((sample) => [sample.id, pipelineSpans(sample, [])])));
  const counts = (source: string) => samples.filter((sample) => sample.source === source).length;
  const meta = {
    date: new Date().toISOString().slice(0, 10),
    runtime: `onnxruntime-node under ${typeof (globalThis as { Bun?: unknown }).Bun === "undefined" ? `Node ${process.version}` : "Bun"}`,
    cpu: cpus()[0]?.model ?? "unknown CPU",
    load: loadavg()[0]!.toFixed(1),
    threads,
    minScore,
    platform: `${process.platform}-${process.arch}`,
    samples: samples.length,
    breakdown: `${counts("generated")} generated, ${counts("handwritten")} hand-written, ${counts("negative")} with nothing to find`,
  };
  await mkdir(values.out!, { recursive: true });
  await writeFile(join(values.out!, "report.json"), JSON.stringify({ meta, bar: BAR, baseline, results }, null, 2));
  await writeFile(join(values.out!, "report.md"), markdown(results, baseline, meta));
  console.log(`report: ${join(values.out!, "report.md")}`);
}

await main();
