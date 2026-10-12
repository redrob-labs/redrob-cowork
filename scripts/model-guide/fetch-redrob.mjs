#!/usr/bin/env node
// Reads which thinking levels Redrob serves each ranked model at, from Console's public catalogue
// (GET /v1/pricing, no key), into scripts/model-guide/snapshots/redrob/<date>.json. build.mjs ranks
// Redrob Cowork picks at those levels, so the guide never ranks a setup Redrob cannot run.
//
//   node scripts/model-guide/fetch-redrob.mjs [--date 2026-10-08]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dateArg = process.argv.indexOf("--date");
const date = dateArg > 0 ? process.argv[dateArg + 1] : new Date().toISOString().slice(0, 10);
const method = JSON.parse(await readFile(path.join(here, "config/method.json"), "utf8"));
const { models, imageModels } = JSON.parse(await readFile(path.join(here, "config/models.json"), "utf8"));

const response = await fetch(method.redrob.url, { headers: { accept: "application/json" } });
if (!response.ok) throw new Error(`${method.redrob.url}: HTTP ${response.status}`);
const catalogue = new Map((await response.json()).models.map((m) => [m.id, m]));

const served = {};
const missing = [];
for (const model of [...models, ...imageModels]) {
  if (!model.redrob) continue;
  const entry = catalogue.get(model.redrob);
  if (!entry) {
    missing.push(`${model.id} (${model.redrob})`);
    continue;
  }
  served[model.redrob] = { thinking: entry.capabilities?.thinkingLevels ?? [] };
}
// A configured id the catalogue does not list would silently rank a model nobody can switch to.
if (missing.length) throw new Error(`not in the Redrob catalogue: ${missing.join(", ")}`);

const dir = path.join(here, "snapshots/redrob");
await mkdir(dir, { recursive: true });
const file = path.join(dir, `${date}.json`);
await writeFile(file, `${JSON.stringify({ date, url: method.redrob.url, models: served }, null, 1)}\n`);
console.log(`redrob: ${Object.keys(served).length} models -> ${path.relative(process.cwd(), file)}`);
