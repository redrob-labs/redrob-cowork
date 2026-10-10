#!/usr/bin/env node
// Runs each task's example prompt on every model the guide ranks for it, through the Redrob API, and
// writes one file per run under samples/outputs/. Spend is capped: before each call the run reserves that
// call's worst case (its prompt plus `MAX_OUTPUT_TOKENS` at the model's output price), and it stops
// rather than start a call that could take the total past the cap. The total counts every output already
// written, so re-running never spends the cap twice.
//
//   REDROB_API_KEY=... node scripts/model-guide/samples/run.mjs [--cap 150] [--dry-run] [--concurrency 6]
//
// Order: every task's #1 in every language, then every #2, and so on. If the cap stops the run, what is
// missing is the lower-ranked picks, never a whole language.

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};

/** The ceiling no flag can raise: the spend the samples were approved for. */
const HARD_CAP_USD = 150;
const CAP = Math.min(Number(arg("--cap", HARD_CAP_USD)), HARD_CAP_USD);
const DRY = process.argv.includes("--dry-run");
const CONCURRENCY = Number(arg("--concurrency", 6));
const BASE = process.env.REDROB_BASE_URL ?? "https://console.redrob.ai/api/backend/v1";
/** Visible answer plus thinking. A run that hits it is kept and marked cut. */
const MAX_OUTPUT_TOKENS = 24000;
/** Stop after this many calls, so a CI job can commit what it has in batches. */
const MAX_RUNS = Number(arg("--max-runs", Infinity));
/**
 * Some models run only when the request agrees that the provider may keep its prompts and outputs
 * (`requiresProviderDataShare` in the catalogue). That is the account holder's consent to give, so those
 * models are skipped unless `--allow-data-share` is passed.
 */
const ALLOW_DATA_SHARE = process.argv.includes("--allow-data-share");
/**
 * Seconds after which no new call starts; calls already in flight finish (each is bounded at 240 s per
 * try). So a run inside a time-limited shell ends cleanly instead of being killed with paid calls open.
 */
const DEADLINE = Date.now() + Number(arg("--deadline", Infinity)) * 1000;
const LANGUAGES = ["en", "ko", "hi"];
const SYSTEM = {
  en: "You are a capable professional doing this task for a colleague. Everything you need is in the message: there are no tools, files or web access. Answer in Markdown.",
  ko: "당신은 동료를 위해 이 업무를 수행하는 유능한 전문가입니다. 필요한 정보는 모두 메시지에 있으며 도구, 파일, 웹 검색은 쓸 수 없습니다. Markdown으로 답하세요.",
  hi: "आप एक सक्षम पेशेवर हैं जो किसी सहकर्मी के लिए यह काम कर रहे हैं। ज़रूरी सारी जानकारी संदेश में है: कोई टूल, फ़ाइल या वेब एक्सेस नहीं है। Markdown में उत्तर दें।",
};

const research = JSON.parse(await readFile(path.join(repo, "apps/app/src/react-app/desk/guide/model-guide.json"), "utf8"));
const outDir = path.join(here, "outputs");

/** The prompt text of a prompt file: everything under "## Prompt" up to "## A strong answer". */
async function promptFor(language, profession, task) {
  const file = path.join(here, "prompts", language, profession, `${task}.md`);
  const text = await readFile(file, "utf8").catch(() => null);
  if (!text) return null;
  const match = /## Prompt\n([\s\S]*?)\n## A strong answer/.exec(text);
  if (!match) throw new Error(`${file}: no "## Prompt" section`);
  return match[1].trim();
}

const fileOf = (job) => path.join(outDir, job.language, job.profession, job.task, `${job.model}@${job.effort}.json`);

async function readJsonOrNull(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/** Every output written so far, so the total and the skip list survive a restart. */
async function written() {
  const found = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (entry.name.endsWith(".json")) found.push(await readJsonOrNull(p));
    }
  }
  await walk(outDir);
  return found.filter(Boolean);
}

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

// The jobs, in rank order across languages. One per (task, language, model, level): a model ranked for a
// deliverable as well as for the task shares the task's run.
const jobs = [];
const seen = new Set();
for (let rank = 1; rank <= 5; rank++)
  for (const language of LANGUAGES)
    for (const profession of research.professions)
      for (const task of profession.tasks) {
        const ranked = (task.picks[language] ?? []).filter((k) => !k.benchmark);
        const pick = ranked[rank - 1];
        if (!pick || pick.harness !== "redrob-desk") continue;
        const model = pick.steps[0].model;
        const catalogueId = research.catalogue?.[model];
        if (!catalogueId) continue;
        const effort = pick.steps[0].effort ?? "default";
        const key = `${language}/${profession.id}/${task.id}/${model}@${effort}`;
        if (seen.has(key)) continue;
        seen.add(key);
        jobs.push({ key, rank, language, profession: profession.id, task: task.id, model, catalogueId, effort });
      }

const pricing = await (await fetch(`${BASE}/pricing`)).json();
const price = Object.fromEntries(pricing.models.map((m) => [m.id, m]));
const worstCase = (job, promptChars) => {
  const p = price[job.catalogueId];
  if (!p) throw new Error(`${job.catalogueId} is not in the Redrob catalogue`);
  // Generously, a token per 2 characters of prompt; Hangul and Devanagari run denser than English.
  // A quarter over list, for anything Redrob bills above it (a long-context or priority rate).
  return (1.25 * ((promptChars / 2) * p.inputPricePerMillionUsd + MAX_OUTPUT_TOKENS * p.outputPricePerMillionUsd)) / 1e6;
};

const done = await written();
// A billed failure is on file for the total, but its run is still to do.
const doneKeys = new Set(done.filter((o) => !o.failed).map((o) => o.key));
let spent = done.reduce((s, o) => s + (o.costUsd ?? 0), 0);
let reserved = 0;
let stopped = null;
const needsShare = (job) => price[job.catalogueId]?.capabilities?.requiresProviderDataShare === true;
const held = jobs.filter((j) => !doneKeys.has(j.key) && needsShare(j) && !ALLOW_DATA_SHARE);
if (held.length) console.log(`${held.length} runs held: their models need --allow-data-share (${[...new Set(held.map((j) => j.model))].join(", ")}).`);
/** Models to leave for a later run, e.g. ones whose answers outlast Redrob's 120 s upstream limit. */
const EXCLUDE = new Set((arg("--exclude-models", "") || "").split(",").filter(Boolean));
/** Runs already seen to time out in an earlier log, so a pass moves on instead of retrying them first. */
const skipLog = arg("--skip-timed-out", null);
const timedOut = new Set();
if (skipLog) {
  const text = await readFile(skipLog, "utf8").catch(() => "");
  for (const m of text.matchAll(/^FAIL (\S+): 50\d .*timeout/gm)) timedOut.add(m[1]);
}
const todo = jobs.filter((j) => !doneKeys.has(j.key) && !held.includes(j) && !EXCLUDE.has(j.model) && !timedOut.has(j.key));
console.log(`${jobs.length} runs planned, ${done.length} already written ($${spent.toFixed(2)}), ${todo.length} to go, cap $${CAP}.`);

async function call(job, prompt) {
  const body = {
    model: job.catalogueId,
    messages: [
      { role: "system", content: SYSTEM[job.language] },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    ...(job.effort !== "default" ? { thinking: job.effort } : {}),
    ...(ALLOW_DATA_SHARE && needsShare(job) ? { provider_data_share: true } : {}),
  };
  // A failed attempt can still be billed, so every attempt's cost is summed, retried ones included.
  let cost = 0;
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    // Redrob ends an upstream call at 120 s; anything still open well past that is a dead connection.
    const response = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.REDROB_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240_000),
    }).catch((error) => ({ ok: false, status: 599, json: async () => ({ error: { message: String(error?.message ?? error) } }) }));
    const json = await response.json().catch(() => ({}));
    cost += billed(job, json);
    if (response.ok) return { json, ms: Date.now() - started, cost };
    // Redrob ends an upstream call at 120 s. An answer that needs longer times out on every try, so a
    // timeout gets one retry (for an unlucky slow start) and is left for the next run.
    const tries = /timeout|aborted/i.test(JSON.stringify(json)) ? 2 : 3;
    const retry = (response.status === 429 || response.status >= 500) && attempt < tries;
    if (!retry) return { error: `${response.status} ${JSON.stringify(json).slice(0, 300)}`, json, cost };
    await new Promise((r) => setTimeout(r, 2000 * attempt * attempt));
  }
}

/**
 * What a call cost: Redrob's own figure, the amount the balance moved. Should a response ever lack it, the
 * list price of the tokens it reports stands in, so the cap is never enforced against a zero.
 */
function billed(job, json) {
  const reported = json?.redrob?.costUsd;
  if (typeof reported === "number") return reported;
  const p = price[job.catalogueId];
  const u = json?.usage;
  if (!u) return 0;
  // A response with no usage and no cost is an error that never reached a model.
  return ((u.prompt_tokens ?? 0) * p.inputPricePerMillionUsd + (u.completion_tokens ?? 0) * p.outputPricePerMillionUsd) / 1e6;
}

let started = 0;

async function runOne(job) {
  const prompt = await promptFor(job.language, job.profession, job.task);
  if (!prompt) return console.log(`skip ${job.key}: no prompt`);
  const reserve = worstCase(job, prompt.length);
  if (spent + reserved + reserve > CAP) {
    stopped ??= `cap: $${spent.toFixed(2)} spent, $${reserved.toFixed(2)} in flight, next call reserves $${reserve.toFixed(2)}`;
    return;
  }
  if (DRY) return console.log(`would run ${job.key} (reserve $${reserve.toFixed(3)})`);
  reserved += reserve;
  started += 1;
  try {
    const { json, ms, error, cost } = await call(job, prompt);
    spent += cost;
    if (error) {
      // Kept on file so the total, which is read back from disk, still counts what it cost.
      if (cost > 0) {
        const file = path.join(outDir, "_failed", `${job.key.replaceAll("/", "__")}-${Date.now()}.json`);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, `${JSON.stringify({ key: job.key, failed: true, costUsd: cost, error }, null, 1)}\n`);
      }
      return console.log(`FAIL ${job.key}: ${error} (billed $${cost.toFixed(4)})`);
    }
    const choice = json.choices?.[0];
    const record = {
      key: job.key,
      language: job.language,
      profession: job.profession,
      task: job.task,
      rank: job.rank,
      model: job.model,
      catalogueId: job.catalogueId,
      routedModel: json.redrob?.routedModel ?? json.model,
      effort: job.effort,
      promptSha: sha(prompt),
      output: choice?.message?.content ?? "",
      cut: choice?.finish_reason === "length",
      finishReason: choice?.finish_reason ?? null,
      // A provider's safety filter stopped the answer, or nothing came back. Kept so its cost counts and it
      // is not re-run on every restart, but never shown: a half answer would misrepresent the model.
      filtered: choice?.finish_reason === "content_filter" || !(choice?.message?.content ?? "").trim(),
      usage: json.usage,
      costUsd: cost,
      latencyMs: json.redrob?.latencyMs ?? ms,
      requestId: json.redrob?.requestId ?? null,
      date: new Date().toISOString().slice(0, 10),
    };
    await mkdir(path.dirname(fileOf(job)), { recursive: true });
    await writeFile(fileOf(job), `${JSON.stringify(record, null, 1)}\n`);
    console.log(`ok   ${job.key} $${cost.toFixed(4)} ${record.usage?.completion_tokens ?? "?"} tok${record.cut ? " CUT" : ""}${record.filtered ? " FILTERED" : ""} | total $${spent.toFixed(2)}`);
  } finally {
    reserved -= reserve;
  }
}

if (!DRY && !process.env.REDROB_API_KEY) throw new Error("REDROB_API_KEY is not set");
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length && !stopped && started < MAX_RUNS && Date.now() < DEADLINE) await runOne(todo[next++]);
  }),
);
const final = await written();
const ran = final.filter((o) => !o.failed);
const summary = {
  planned: jobs.length,
  written: ran.length,
  cut: ran.filter((o) => o.cut).length,
  filtered: ran.filter((o) => o.filtered).length,
  failedBilled: final.length - ran.length,
  spentUsd: Number(final.reduce((s, o) => s + (o.costUsd ?? 0), 0).toFixed(4)),
  capUsd: CAP,
  stopped,
  complete: ran.length >= jobs.length,
};
if (!DRY) await writeFile(path.join(here, "run-summary.json"), `${JSON.stringify(summary, null, 1)}\n`);
console.log(JSON.stringify(summary));
