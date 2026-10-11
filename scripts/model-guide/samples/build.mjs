#!/usr/bin/env node
// Bundles the sample prompts, task cards, outputs and grades into what the app loads beside the rankings:
// apps/app/src/react-app/desk/guide/samples/<language>/<profession>.json, one file per profession and
// language, so the guide loads only the samples for the profession and language on screen.
//
//   node scripts/model-guide/samples/build.mjs [--outputs <dir>] [--grades <dir>] [--out <dir>]
//
// Each file: { [task]: { prompt, card, checks, runs: { "<model>@<level>": run } } }, where `checks` are the
// scorecard lines in the file's language and each run's `verdicts` follow them line for line.

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const outputsDir = arg("--outputs", path.join(here, "outputs"));
const gradesDir = arg("--grades", path.join(here, "grades"));
const outDir = arg("--out", path.join(repo, "apps/app/src/react-app/desk/guide/samples"));

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const section = (text, name) => {
  const m = new RegExp(`\\n## ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(text);
  return m ? m[1].trim() : null;
};
const bullets = (s) => (s ?? "").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());
const promptOf = (text) => /## Prompt\n([\s\S]*?)\n## A strong answer/.exec(text)?.[1].trim() ?? null;
const list = async (dir) => (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => !e.name.startsWith("_"));
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

/** The task card, as the prompt file states it. Null when the file has none. */
function cardOf(text) {
  const card = section(text, "Card");
  if (!card) return null;
  const field = (k) => new RegExp(`^${k}: (.+)$`, "m").exec(card)?.[1].trim() ?? null;
  const items = (k) => bullets(new RegExp(`^${k}:\\n((?:- .+\\n?)+)`, "m").exec(card)?.[1]);
  return { brief: field("brief"), given: items("given"), asked: items("asked"), limit: field("limit"), hard: field("hard") };
}

const bundles = new Map();
let runs = 0;
let graded = 0;
for (const language of await list(outputsDir)) {
  for (const profession of await list(path.join(outputsDir, language.name))) {
    const tasks = {};
    for (const task of await list(path.join(outputsDir, language.name, profession.name))) {
      const dir = path.join(outputsDir, language.name, profession.name, task.name);
      const text = await readFile(path.join(here, "prompts", language.name, profession.name, `${task.name}.md`), "utf8");
      const prompt = promptOf(text);
      // The lines graded on (English) and the lines shown (the file's language); line n is the same check.
      const graders = bullets(section(text, "Scorecard"));
      const shown = bullets(section(text, "Scorecard, shown"));
      const checks = shown.length === graders.length && shown.length ? shown : graders;
      const entry = { prompt, card: cardOf(text), checks, runs: {} };
      for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()) {
        const run = await readJson(path.join(dir, file));
        // An output whose prompt has since changed answers a different question, so it is left out.
        if (sha(prompt) !== run.promptSha) continue;
        if (run.filtered || !run.output?.trim()) continue;
        const grade = await readJson(path.join(gradesDir, language.name, profession.name, task.name, file)).catch(() => null);
        // A grade against an older scorecard would mark lines the page no longer shows.
        const current = grade && grade.scorecardSha === sha(graders.join("\n")) && grade.lines.length === checks.length;
        entry.runs[`${run.model}@${run.effort}`] = {
          output: run.output,
          date: run.date,
          effort: run.ranAt ?? run.effort,
          costUsd: run.costUsd,
          latencyMs: run.latencyMs,
          cut: run.cut,
          ...(current ? { verdicts: grade.lines.map((l) => ({ verdict: l.verdict, quote: l.quote })) } : {}),
        };
        runs += 1;
        if (current) graded += 1;
      }
      if (Object.keys(entry.runs).length) tasks[task.name] = entry;
    }
    if (Object.keys(tasks).length) bundles.set(`${language.name}/${profession.name}`, tasks);
  }
}

await rm(outDir, { recursive: true, force: true });
for (const [key, tasks] of bundles) {
  const file = path.join(outDir, `${key}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(tasks));
}
console.log(`samples: ${runs} runs (${graded} graded) in ${bundles.size} files -> ${path.relative(process.cwd(), outDir)}`);
