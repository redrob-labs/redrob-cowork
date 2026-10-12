#!/usr/bin/env node
// Ranks every task from a snapshot and writes the research the app ships,
// apps/app/src/react-app/desk/guide/model-guide.json. Method: README.md beside this file.
//
//   node scripts/model-guide/build.mjs [--snapshot 2026-10-08] [--out path]

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findEntry } from "./lib/match.mjs";
import { AA_FIELDS, BOARDS } from "./fetch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const snapshotName =
  arg("--snapshot") ||
  (await readdir(path.join(here, "snapshots"))).filter((f) => f.endsWith(".json")).sort().pop().replace(/\.json$/, "");
const snapshot = await readJson(path.join(here, "snapshots", `${snapshotName}.json`));
const { models, imageModels } = await readJson(path.join(here, "config/models.json"));
const { professions } = await readJson(path.join(here, "config/tasks.json"));
const method = await readJson(path.join(here, "config/method.json"));
const outFile = arg("--out") || path.join(repo, "apps/app/src/react-app/desk/guide/model-guide.json");
const date = snapshot.date;

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ELO = new Set(method.quality.elo);
const FILE_NAME = { docx: "Word", pdf: "PDF", pptx: "PowerPoint", xlsx: "Excel" };
const BRIEFCASE_FILE = { "briefcase-docx": "docx", "briefcase-pdf": "pdf", "briefcase-pptx": "pptx", "briefcase-xlsx": "xlsx" };

/** A model's figure on a board: `{ value, ci?, effort }`, where `effort` is set when the board ran another effort. */
function figure(model, board) {
  if (AA_FIELDS[board]) return aaFigure(model, (r) => r[AA_FIELDS[board].field]);
  if (BRIEFCASE_FILE[board]) {
    const file = BRIEFCASE_FILE[board];
    return aaFigure(model, (_, name) => snapshot.briefcaseByFile[name]?.[file] ?? null);
  }
  const hit = findEntry(snapshot.boards[board] || {}, model);
  return hit ? { value: hit.entry.value, ci: hit.entry.ci, effort: hit.effort } : null;
}

/** From the AA models page, which names each effort exactly: the ranked effort, else the best effort. */
function aaFigure(model, read) {
  const at = (effort) => {
    const name = model.aa[effort];
    const record = name && snapshot.aaModels[name];
    const value = record ? read(record, name) : null;
    return typeof value === "number" ? value : null;
  };
  const ranked = at(model.effort);
  if (ranked !== null) return { value: ranked, effort: null };
  const others = model.efforts.map((e) => [e, at(e)]).filter(([, v]) => v !== null);
  if (!others.length) return null;
  others.sort((a, b) => b[1] - a[1]);
  return { value: others[0][1], effort: others[0][0] };
}

// Every figure once, and the best on each board among the models we rank.
const allBoards = new Set([...Object.keys(BOARDS), ...Object.keys(AA_FIELDS), ...Object.keys(BRIEFCASE_FILE)]);
const figures = new Map();
const best = {};
for (const board of allBoards) {
  for (const model of models) {
    const f = figure(model, board);
    figures.set(`${model.id}|${board}`, f);
    if (f && (best[board] === undefined || f.value > best[board])) best[board] = f.value;
  }
}

/** How far below the best a value is: % of the best, or for an Elo board % of win probability. */
function gapOf(board, value) {
  const top = best[board];
  if (ELO.has(board)) return 100 * (1 - 2 / (1 + 10 ** ((top - value) / 400)));
  return (100 * (top - value)) / top;
}

function gapFor(model, board, language) {
  const f = figures.get(`${model.id}|${board}`);
  if (!f) return null;
  const g = gapOf(board, f.value);
  const ko = method.quality.korean;
  if (language === "ko" && board === ko.replaces) {
    const k = figures.get(`${model.id}|${ko.board}`);
    if (k) return (g + gapOf(ko.board, k.value)) / 2;
  }
  return g;
}

/** Interval on a gap, from the board's own interval where it prints one, else 2% of the best. */
function gapCi(model, board) {
  const f = figures.get(`${model.id}|${board}`);
  if (!f) return null;
  if (ELO.has(board) && f.ci) return Math.abs(gapOf(board, f.value - f.ci) - gapOf(board, f.value));
  return 2;
}

function taskQuality(model, task, language, output) {
  const gaps = Object.entries(task.benchmarks).map(([b, w]) => [b, w, gapFor(model, b, language)]);
  const known = gaps.filter(([, , g]) => g !== null);
  if (!known.length) return null;
  const fill = mean(known.map(([, , g]) => g));
  let q = 100 - gaps.reduce((s, [, w, g]) => s + w * (g === null ? fill : g), 0);
  let imputed = known.length < gaps.length;
  const ciParts = gaps.map(([b, w]) => [w, gapCi(model, b) ?? 2]);
  let ci = ciParts.reduce((s, [w, c]) => s + w * c, 0);
  const used = Object.keys(task.benchmarks);
  if (output) {
    const obs = method.quality.output.benchmarks[output];
    const og = obs.map((b) => gapFor(model, b, language)).filter((g) => g !== null);
    const share = method.quality.output.share;
    if (!og.length) imputed = true;
    q = (1 - share) * q + share * (100 - (og.length ? mean(og) : fill));
    ci = (1 - share) * ci + share * 2;
    used.unshift(...obs);
  }
  return { quality: Math.max(0, Math.min(100, q)), imputed, ci, used };
}

const carriedReliability = models.filter((m) => m.carried?.reliability).map((m) => m.carried.reliability);
const costPool = Object.values(snapshot.aaModels).map((r) => r.costPerTask).filter((c) => c > 0);
const [costMin, costMax] = [Math.min(...costPool), Math.max(...costPool)];
const opus = models.find((m) => m.id === "claude-opus-5-5");
const aaCost = (model, effort) => snapshot.aaModels[model.aa[effort]]?.costPerTask ?? null;

function dims(model) {
  const estimated = [];
  let reliability = model.carried?.reliability;
  if (reliability === undefined) {
    reliability = Math.min(...carriedReliability);
    estimated.push("reliability");
  }
  let speed = model.carried?.speed;
  if (speed === undefined) {
    const tps = snapshot.aaModels[model.aa[model.effort]]?.tokensPerSecond;
    speed = tps ? Math.max(0, Math.min(100, method.speed.a * Math.log(tps) + method.speed.b)) : 0;
    estimated.push("speed");
  }
  const c = aaCost(model, model.effort);
  const cost = c ? (100 * (Math.log(costMax) - Math.log(c))) / (Math.log(costMax) - Math.log(costMin)) : 0;
  if (!c) estimated.push("cost");
  return { reliability, speed, cost, estimated };
}

/** Cost of one run at an effort, relative to the task's own cost per run. */
function runFactor(model, effort) {
  if (model.costPerRun?.[effort] !== undefined) return model.costPerRun[effort];
  const c = aaCost(model, effort);
  return c ? (opus.costPerRun.max * c) / aaCost(opus, "max") : null;
}

function reliabilityOn(base, harness, task) {
  if (method.reliability.nativeConnectors.includes(harness)) return base;
  const connectors = task.tools.filter((t) => method.reliability.connectors.includes(t)).length;
  return base * (1 - method.reliability.connectorPenalty * (connectors / task.tools.length));
}

const image = imageModels[0];
const benchmarkPick = (model, harness) =>
  method.benchmarkPicks.picks.some((p) => p.model === model.id && p.harness === harness);

function candidates(task, language, output) {
  const out = [];
  for (const model of models) {
    const q = taskQuality(model, task, language, output);
    if (!q) continue;
    const d = dims(model);
    for (const harness of model.harnesses) {
      const reliability = reliabilityOn(d.reliability, harness, task);
      const score = { quality: q.quality, reliability, speed: d.speed, cost: d.cost };
      const total = Object.entries(method.weights).reduce((s, [k, w]) => s + w * score[k], 0);
      out.push({ model, harness, score, total, q, d, benchmark: benchmarkPick(model, harness) });
    }
  }
  return out.sort((a, b) => b.total - a.total);
}

function sourceValue(model, board) {
  const f = figures.get(`${model.id}|${board}`);
  const v = ELO.has(board) ? String(Math.round(f.value)) : String(f.value);
  return f.effort ? `${v} (${f.effort})` : v;
}

function sourceOf(board) {
  if (AA_FIELDS[board]) return AA_FIELDS[board];
  if (BRIEFCASE_FILE[board])
    return { ...BOARDS.briefcase, label: `AA-Briefcase, ${FILE_NAME[BRIEFCASE_FILE[board]]} pass rate`, kind: "measured" };
  return BOARDS[board];
}

function pick(c, id, task, language, output, flags) {
  const { model, harness } = c;
  // Graphics always ends in an image; another output replaces whatever the task makes by default.
  const withImage = output ? output === "graphics" : task.image;
  const monthlyAt = (effort) => {
    const f = runFactor(model, effort);
    if (f === null) return null;
    const run = task.costPerRun * f * method.monthly.languageCost[language];
    return task.runs * run + (withImage ? task.runs * image.imagesPerRun * image.pricePerImage : 0);
  };
  const efforts = model.efforts
    .map((e) => [e, monthlyAt(e)])
    .filter(([, m]) => m !== null)
    .map(([e, m]) => [e, round(m, 2)])
    .sort((a, b) => a[1] - b[1]);
  const monthly = monthlyAt(model.effort);
  const perRun = (monthly - (withImage ? task.runs * image.imagesPerRun * image.pricePerImage : 0)) / task.runs;
  const record = snapshot.aaModels[model.aa[model.effort]];
  const sources = [];
  const seen = new Set();
  for (const board of c.q.used) {
    if (seen.has(board) || !figures.get(`${model.id}|${board}`)) continue;
    seen.add(board);
    const s = sourceOf(board);
    sources.push({ label: s.label, value: sourceValue(model, board), kind: s.kind, url: s.url, date });
  }
  sources.push({ label: "price", model: model.id, value: `$${record?.priceIn} / $${record?.priceOut}`, kind: "published", url: model.priceUrl, date });
  sources.push({ label: "monthly", value: `${task.runs} runs/month x $${perRun.toFixed(5)}/run`, kind: "estimate", date });
  if (withImage)
    sources.push({ label: "image", value: `${task.runs} runs x ${image.imagesPerRun} images x $${image.pricePerImage}`, kind: "estimate", date });
  const estimated = c.q.imputed || c.d.estimated.length > 0 || (language === "ko" && task.noKoreanBenchmark === true);
  const planned = method.harnesses[harness].planned || [];
  const picked = {
    id,
    steps: [{ model: model.id, effort: model.effort }, ...(withImage ? [{ model: image.id, role: "image" }] : [])],
    harness,
    kind: estimated ? "estimate" : "derived",
    score: {
      quality: round(c.score.quality),
      reliability: round(c.score.reliability),
      speed: round(c.score.speed),
      cost: round(c.score.cost),
      ci: round(Math.max(method.ci.floor, method.weights.quality * c.q.ci)),
    },
    monthly: round(monthly, 2),
    monthlyKind: "estimate",
    monthlyRange: method.monthly.range.map((r) => round(monthly * r, 2)),
    efforts,
    comingSoon: task.tools.some((t) => planned.includes(t)),
    missing: [],
    flags: [...flags, ...(estimated ? ["partly-estimated"] : []), ...(model.outsideUs ? ["outside-us"] : [])],
    sources,
  };
  if (c.benchmark) picked.benchmark = true;
  return picked;
}

/** The top five, one pick per model at its best harness, with any benchmark that would make the cut beside it. */
function rank(task, language, output) {
  const all = candidates(task, language, output);
  const ranked = [];
  for (const c of all) if (!c.benchmark && !ranked.some((r) => r.model.id === c.model.id)) ranked.push(c);
  const top = ranked.slice(0, method.limit);
  const bar = top[top.length - 1].total;
  const next = ranked[method.limit];
  const list = [];
  top.forEach((c, i) => {
    const flags = i === top.length - 1 && next && c.total - next.total < method.closeCall ? ["close-call"] : [];
    list.push(pick(c, `${language}-${i + 1}`, task, language, output, flags));
  });
  for (const b of all.filter((c) => c.benchmark && c.total >= bar)) {
    const at = list.findIndex((p) => !p.benchmark && p.steps[0].model === b.model.id);
    const entry = pick(b, `${language}-${b.harness}-${b.model.id}`, task, language, output, []);
    if (at >= 0) list.splice(at + 1, 0, entry);
    else {
      const after = top.filter((c) => c.total > b.total).length;
      const idx = list.findIndex((p, j) => !p.benchmark && list.slice(0, j + 1).filter((x) => !x.benchmark).length === after);
      list.splice(idx + 1, 0, entry);
    }
  }
  return list;
}

const used = new Set([image.id]);
const research = {
  asOf: date,
  weights: method.weights,
  models: {},
  planned: Object.fromEntries(Object.entries(method.harnesses).filter(([, h]) => h.planned).map(([id, h]) => [id, h.planned])),
  professions: professions.map((p) => ({
    id: p.id,
    label: p.label,
    tasks: p.tasks.map((task) => {
      const picks = Object.fromEntries(method.languages.map((l) => [l, rank(task, l)]));
      const byOutput = Object.fromEntries(
        task.outputs.map((o) => [o, Object.fromEntries(method.languages.map((l) => [l, rank(task, l, o)]))]),
      );
      for (const list of [...Object.values(picks), ...Object.values(byOutput).flatMap((x) => Object.values(x))])
        for (const k of list) for (const s of k.steps) used.add(s.model);
      return { id: task.id, label: task.label, runs: task.runs, tools: task.tools, outputs: task.outputs, picks, picksByOutput: byOutput };
    }),
  })),
};
for (const m of [...models, ...imageModels]) if (used.has(m.id)) research.models[m.id] = m.name;
research.models = Object.fromEntries(Object.entries(research.models).sort());

await writeFile(outFile, JSON.stringify(research));
const count = research.professions.reduce((n, p) => n + p.tasks.length, 0);
console.log(`ranked ${count} tasks across ${research.professions.length} professions from snapshot ${snapshotName} -> ${path.relative(process.cwd(), outFile)}`);
