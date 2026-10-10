#!/usr/bin/env node
// Bundles the sample prompts and outputs into what the app loads beside the rankings:
// apps/app/src/react-app/desk/guide/samples/<language>/<profession>.json, one file per profession and
// language, so the guide loads only the samples for the profession and language on screen.
//
//   node scripts/model-guide/samples/build.mjs [--outputs <dir>] [--out <dir>]
//
// Each file: { [task]: { prompt, runs: { "<model>@<level>": { output, date, effort, costUsd, cut } } } }.

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
const outDir = arg("--out", path.join(repo, "apps/app/src/react-app/desk/guide/samples"));

const promptOf = (text) => /## Prompt\n([\s\S]*?)\n## A strong answer/.exec(text)?.[1].trim() ?? null;
const list = async (dir) => (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => !e.name.startsWith("_"));

const bundles = new Map();
let runs = 0;
for (const language of await list(outputsDir)) {
  for (const profession of await list(path.join(outputsDir, language.name))) {
    const tasks = {};
    for (const task of await list(path.join(outputsDir, language.name, profession.name))) {
      const dir = path.join(outputsDir, language.name, profession.name, task.name);
      const promptFile = path.join(here, "prompts", language.name, profession.name, `${task.name}.md`);
      const prompt = promptOf(await readFile(promptFile, "utf8"));
      const entry = { prompt, runs: {} };
      for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()) {
        const run = JSON.parse(await readFile(path.join(dir, file), "utf8"));
        // An output whose prompt has since changed answers a different question, so it is left out.
        const { createHash } = await import("node:crypto");
        if (createHash("sha256").update(prompt).digest("hex").slice(0, 12) !== run.promptSha) continue;
        if (run.filtered || !run.output?.trim()) continue;
        entry.runs[`${run.model}@${run.effort}`] = { output: run.output, date: run.date, effort: run.effort, costUsd: run.costUsd, cut: run.cut };
        runs += 1;
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
console.log(`samples: ${runs} runs in ${bundles.size} files -> ${path.relative(process.cwd(), outDir)}`);
