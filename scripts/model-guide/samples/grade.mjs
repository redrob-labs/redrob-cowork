#!/usr/bin/env node
// Grades every recorded sample answer against its task's scorecard, with two graders from different labs,
// and writes one file per answer under samples/grades/. A line both graders pass is a pass, one both miss
// is a miss, and anything they disagree on is partial, so no single grader decides a line alone.
//
//   REDROB_API_KEY=... node scripts/model-guide/samples/grade.mjs [--cap 30] [--trial 20] [--dry-run]
//
// Spend is capped like run.mjs: counted over every grade already written, with each call's worst case
// reserved before it starts, and the cap can only be lowered.

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureData } from "./data.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
// The cap counts the grades already written, so the pinned set must be there first.
await ensureData();

/** The ceiling no flag can raise: the spend grading was approved for. */
const HARD_CAP_USD = 30;
const CAP = Math.min(Number(arg("--cap", HARD_CAP_USD)), HARD_CAP_USD);
const DRY = process.argv.includes("--dry-run");
const TRIAL = Number(arg("--trial", 0));
const CONCURRENCY = Number(arg("--concurrency", 6));
const DEADLINE = Date.now() + Number(arg("--deadline", Infinity)) * 1000;
const BASE = process.env.REDROB_BASE_URL ?? "https://console.redrob.ai/api/backend/v1";
const MAX_OUTPUT_TOKENS = 6000;
/** Two labs, so a line stands only where both agree. */
const GRADERS = [
  { id: "openai/gpt-6.1-sol", thinking: "medium" },
  { id: "google/gemini-3.8-flash", thinking: "medium" },
];

const outputsDir = path.join(here, "outputs");
const gradesDir = path.join(here, "grades");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const section = (text, name) => {
  const m = new RegExp(`\\n## ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(text);
  return m ? m[1].trim() : null;
};
const bullets = (s) => (s ?? "").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());

async function walk(dir) {
  const found = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith("_")) found.push(...(await walk(p)));
    } else if (e.name.endsWith(".json")) found.push(p);
  }
  return found;
}

/** Every answer the guide shows: recorded, not failed, not stopped by a safety filter. */
async function answers() {
  const out = [];
  for (const file of await walk(outputsDir)) {
    const run = JSON.parse(await readFile(file, "utf8"));
    if (run.failed || run.filtered || !run.output?.trim()) continue;
    const text = await readFile(path.join(here, "prompts", run.language, run.profession, `${run.task}.md`), "utf8");
    const prompt = /## Prompt\n([\s\S]*?)\n## A strong answer/.exec(text)[1].trim();
    if (sha(prompt) !== run.promptSha) continue;
    const lines = bullets(section(text, "Scorecard"));
    if (!lines.length) continue;
    out.push({ run, prompt, lines, reference: section(text, "A strong answer"), scorecardSha: sha(lines.join("\n")) });
  }
  return out;
}

const fileOf = (a) => path.join(gradesDir, a.run.language, a.run.profession, a.run.task, `${a.run.model}@${a.run.effort}.json`);

const SYSTEM = `You grade one answer to a professional task against a checklist. Be strict and fair.
For each checklist line, decide:
- "pass": the answer clearly does what the line says, with the right figure or decision.
- "partial": it gets part of it, or gets it right but with a material error or omission.
- "miss": it does not do it, gets it wrong, or contradicts it.
Judge substance, not wording. An equivalent correct figure or decision passes. Where the reference notes an
acceptable alternative, accept it. Do not reward length or confidence. The answer may be in Korean or Hindi;
the checklist is in English.
For each line give a short verbatim quote from the answer (at most 25 words, copied exactly, in the answer's
language) that shows the verdict, or "" if nothing in it addresses the line, and a reason of at most 20 words.
Reply with JSON only, no prose and no code fence:
{"lines":[{"n":1,"verdict":"pass","quote":"...","reason":"..."}]}`;

function userMessage(a) {
  return [
    "## The task the answer was written for",
    a.prompt,
    "## Checklist (grade every line, in order)",
    a.lines.map((l, i) => `${i + 1}. ${l}`).join("\n"),
    "## Reference notes for the grader (never shown to the model that answered)",
    a.reference ?? "",
    "## The answer to grade",
    a.run.output,
  ].join("\n\n");
}

const pricing = DRY && !process.env.REDROB_API_KEY ? null : await (await fetch(`${BASE}/pricing`)).json();
const price = Object.fromEntries((pricing?.models ?? []).map((m) => [m.id, m]));
function worstCase(promptChars) {
  return GRADERS.reduce((s, g) => {
    const p = price[g.id] ?? { inputPricePerMillionUsd: 10, outputPricePerMillionUsd: 50 };
    return s + (1.25 * ((promptChars / 2) * p.inputPricePerMillionUsd + MAX_OUTPUT_TOKENS * p.outputPricePerMillionUsd)) / 1e6;
  }, 0);
}
function billed(id, json) {
  if (typeof json?.redrob?.costUsd === "number") return json.redrob.costUsd;
  const p = price[id];
  const u = json?.usage;
  if (!p || !u) return 0;
  return ((u.prompt_tokens ?? 0) * p.inputPricePerMillionUsd + (u.completion_tokens ?? 0) * p.outputPricePerMillionUsd) / 1e6;
}

/** The grader's JSON, checked: one verdict per line, in order. Null when it is not usable. */
function parse(content, count) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  let json;
  try {
    json = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
  const lines = json?.lines;
  if (!Array.isArray(lines) || lines.length !== count) return null;
  const ok = lines.every((l, i) => ["pass", "partial", "miss"].includes(l?.verdict) && Number(l?.n) === i + 1);
  return ok ? lines.map((l) => ({ verdict: l.verdict, quote: String(l.quote ?? ""), reason: String(l.reason ?? "") })) : null;
}

/** A quote counts only if it is really in the answer; a grader paraphrasing or inventing one is dropped. */
const squash = (s) => s.replace(/[*_`>#|]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
function verified(quote, answer) {
  const q = squash(quote);
  return q.length >= 4 && squash(answer).includes(q) ? quote : "";
}

async function grade(grader, a) {
  let cost = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.REDROB_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: grader.id,
        thinking: grader.thinking,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMessage(a) },
        ],
      }),
      signal: AbortSignal.timeout(660_000),
    }).catch((error) => ({ ok: false, status: 599, json: async () => ({ error: { message: String(error?.message ?? error) } }) }));
    const json = await response.json().catch(() => ({}));
    cost += billed(grader.id, json);
    if (!response.ok) {
      if (attempt === 3 || !(response.status === 429 || response.status >= 500)) return { error: `${response.status} ${JSON.stringify(json).slice(0, 200)}`, cost };
      continue;
    }
    const lines = parse(json.choices?.[0]?.message?.content ?? "", a.lines.length);
    if (lines) return { lines, cost };
  }
  return { error: "no usable verdicts after 3 tries", cost };
}

function merge(a, results) {
  const lines = a.lines.map((check, i) => {
    const verdicts = results.map((r) => r.lines[i].verdict);
    const verdict = verdicts.every((v) => v === "pass") ? "pass" : verdicts.every((v) => v === "miss") ? "miss" : "partial";
    // The quote shown is the first one that is really in the answer, from a grader whose verdict matches.
    const quote = results.map((r) => verified(r.lines[i].quote, a.run.output)).find(Boolean) ?? "";
    return {
      check,
      verdict,
      agreed: new Set(verdicts).size === 1,
      quote,
      by: results.map((r, g) => ({ grader: GRADERS[g].id, verdict: r.lines[i].verdict, reason: r.lines[i].reason })),
    };
  });
  return { passed: lines.filter((l) => l.verdict === "pass").length, partial: lines.filter((l) => l.verdict === "partial").length, of: lines.length, lines };
}

// ---- run ----
const all = await answers();
const done = new Map();
for (const file of await walk(gradesDir)) {
  const g = JSON.parse(await readFile(file, "utf8"));
  done.set(g.key, g);
}
let spent = [...done.values()].reduce((s, g) => s + (g.costUsd ?? 0), 0);
for (const file of await walk(path.join(gradesDir, "_failed"))) spent += JSON.parse(await readFile(file, "utf8")).costUsd ?? 0;
let todo = all.filter((a) => done.get(a.run.key)?.scorecardSha !== a.scorecardSha);
if (TRIAL) {
  // A spread a reviewer can judge the graders on: languages in turn, and within each the profession and
  // model seen least so far, in a fixed pseudo-random order so a trial is repeatable.
  const order = [...todo].sort((x, y) => sha(x.run.key).localeCompare(sha(y.run.key)));
  const languages = [...new Set(order.map((a) => a.run.language))].sort();
  const seen = { profession: new Map(), model: new Map() };
  const count = (kind, k) => seen[kind].get(k) ?? 0;
  const picked = [];
  for (let i = 0; picked.length < Math.min(TRIAL, order.length); i++) {
    const language = languages[i % languages.length];
    const pool = order.filter((a) => a.run.language === language && !picked.includes(a));
    if (!pool.length) continue;
    pool.sort((x, y) => count("profession", x.run.profession) - count("profession", y.run.profession) || count("model", x.run.model) - count("model", y.run.model));
    const a = pool[0];
    picked.push(a);
    seen.profession.set(a.run.profession, count("profession", a.run.profession) + 1);
    seen.model.set(a.run.model, count("model", a.run.model) + 1);
  }
  todo = picked;
}
console.log(`${all.length} answers, ${done.size} graded ($${spent.toFixed(2)}), ${todo.length} to grade, cap $${CAP}.`);
if (DRY) {
  for (const a of todo.slice(0, 40)) console.log(`would grade ${a.run.key} (${a.lines.length} lines)`);
  process.exit(0);
}
if (!process.env.REDROB_API_KEY) throw new Error("REDROB_API_KEY is not set");

let reserved = 0;
let stopped = null;
let next = 0;
async function one(a) {
  const reserve = worstCase(a.prompt.length + a.run.output.length + (a.reference?.length ?? 0));
  if (spent + reserved + reserve > CAP) {
    stopped ??= `cap: $${spent.toFixed(2)} spent, next reserves $${reserve.toFixed(2)}`;
    return;
  }
  reserved += reserve;
  try {
    const results = await Promise.all(GRADERS.map((g) => grade(g, a)));
    const cost = results.reduce((s, r) => s + r.cost, 0);
    spent += cost;
    const failed = results.find((r) => r.error);
    if (failed) {
      if (cost > 0) {
        await mkdir(path.join(gradesDir, "_failed"), { recursive: true });
        await writeFile(path.join(gradesDir, "_failed", `${a.run.key.replaceAll("/", "__")}-${Date.now()}.json`), JSON.stringify({ key: a.run.key, costUsd: cost, error: failed.error }));
      }
      return console.log(`FAIL ${a.run.key}: ${failed.error}`);
    }
    const record = {
      key: a.run.key,
      language: a.run.language,
      profession: a.run.profession,
      task: a.run.task,
      model: a.run.model,
      effort: a.run.effort,
      scorecardSha: a.scorecardSha,
      graders: GRADERS.map((g) => `${g.id}@${g.thinking}`),
      ...merge(a, results),
      costUsd: cost,
      date: new Date().toISOString().slice(0, 10),
    };
    await mkdir(path.dirname(fileOf(a)), { recursive: true });
    await writeFile(fileOf(a), `${JSON.stringify(record, null, 1)}\n`);
    const agreed = record.lines.filter((l) => l.agreed).length;
    console.log(`ok   ${a.run.key}: ${record.passed}/${record.of}${record.partial ? ` +${record.partial}◐` : ""} (graders agreed ${agreed}/${record.of}) $${cost.toFixed(4)} | total $${spent.toFixed(2)}`);
  } finally {
    reserved -= reserve;
  }
}
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length && !stopped && Date.now() < DEADLINE) await one(todo[next++]);
  }),
);
console.log(JSON.stringify({ graded: (await walk(gradesDir)).filter((f) => !f.includes("_failed")).length, of: all.length, spentUsd: Number(spent.toFixed(4)), capUsd: CAP, stopped }));
