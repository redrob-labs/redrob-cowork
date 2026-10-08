#!/usr/bin/env node
// Reads every leaderboard the Model Guide cites and writes them, as the boards print them, to
// scripts/model-guide/snapshots/<date>.json. build.mjs ranks from a snapshot, so a ranking can be
// re-derived later from exactly the figures it was made from.
//
//   node scripts/model-guide/fetch.mjs [--date 2026-10-08]

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aaEloTable, aaModels, arenaAgent, arenaElo, briefcaseByFile, vals } from "./lib/fetch-sources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dateArg = process.argv.indexOf("--date");
const date = dateArg > 0 ? process.argv[dateArg + 1] : new Date().toISOString().slice(0, 10);

/** Board id -> how to read it, its label in the guide, where a reader can check it, and its kind. */
export const BOARDS = {
  "arena-text": { read: () => arenaElo("text"), label: "LMArena Text Arena (Overall)", url: "https://arena.ai/leaderboard/text", kind: "measured" },
  "arena-text-ko": { read: () => arenaElo("text/korean"), label: "LMArena Text Arena - Korean slice", url: "https://arena.ai/leaderboard/text/korean", kind: "measured" },
  "arena-webdev": { read: () => arenaElo("code/webdev"), label: "LMArena Code Arena: WebDev (Overall)", url: "https://arena.ai/leaderboard/code/webdev", kind: "measured" },
  "arena-webdev-brand": { read: () => arenaElo("code/webdev/brand-marketing"), label: "LMArena Code Arena: WebDev - Brand & Marketing", url: "https://arena.ai/leaderboard/code/webdev/brand-marketing", kind: "measured" },
  "arena-webdev-reference": { read: () => arenaElo("code/webdev/reference-based-design"), label: "LMArena Code Arena: WebDev - Reference-Based Design", url: "https://arena.ai/leaderboard/code/webdev/reference-based-design", kind: "measured" },
  "arena-image-to-webdev": { read: () => arenaElo("code/image-to-webdev"), label: "LMArena Code Arena: Image-to-WebDev", url: "https://arena.ai/leaderboard/code/image-to-webdev", kind: "measured" },
  "arena-agent": { read: () => arenaAgent(), label: "LMArena Agent Arena (Overall)", url: "https://arena.ai/leaderboard/agent", kind: "measured" },
  "arena-text-to-image": { read: () => arenaElo("text-to-image"), label: "LMArena Text-to-Image Arena", url: "https://arena.ai/leaderboard/text-to-image", kind: "measured" },
  gdpval: { read: () => aaEloTable("gdpval-aa"), label: "GDPval-AA v2.1 (Artificial Analysis)", url: "https://artificialanalysis.ai/evaluations/gdpval-aa", kind: "measured" },
  briefcase: { read: () => aaEloTable("aa-briefcase"), label: "AA-Briefcase v1.1 (Artificial Analysis)", url: "https://artificialanalysis.ai/evaluations/aa-briefcase", kind: "measured" },
  "vals-emb": { read: () => vals("emb"), label: "Vals Excel Modeling Benchmark (EMB)", url: "https://www.vals.ai/benchmarks/emb", kind: "published" },
  "vals-finance-agent": { read: () => vals("fabv2"), label: "Vals Finance Agent v2", url: "https://www.vals.ai/benchmarks/fabv2", kind: "published" },
  "vals-tax-agent": { read: () => vals("tax_agent_bench"), label: "Vals Tax Agent Bench", url: "https://www.vals.ai/benchmarks/tax_agent_bench", kind: "published" },
  "vals-harvey-lab": { read: () => vals("hlab"), label: "Harvey Legal Agent Benchmark (LAB), Vals run", url: "https://www.vals.ai/benchmarks/hlab", kind: "published" },
  "vals-legalbench": { read: () => vals("legal_bench"), label: "LegalBench (Vals AI run)", url: "https://www.vals.ai/benchmarks/legal_bench", kind: "published" },
};

/** Boards read off the Artificial Analysis models page rather than a page of their own. */
export const AA_FIELDS = {
  "aa-index": { field: "index", label: "Artificial Analysis Intelligence Index", url: "https://artificialanalysis.ai/leaderboards/models", kind: "measured" },
  "terminal-bench": { field: "terminalBench", label: "Terminal-Bench 4.0 (AA run)", url: "https://artificialanalysis.ai/leaderboards/models", kind: "measured" },
  tau2: { field: "tau2", label: "tau2-bench (AA run)", url: "https://artificialanalysis.ai/leaderboards/models", kind: "measured" },
};

async function main() {
  const snapshot = { date, boards: {}, aaModels: {}, briefcaseByFile: {} };
  const failures = [];
  for (const [id, board] of Object.entries(BOARDS)) {
    try {
      const result = await board.read();
      snapshot.boards[id] = result.entries;
      if (id === "briefcase") snapshot.briefcaseByFile = briefcaseByFile(result.html);
      console.log(`${id}: ${Object.keys(result.entries).length} entries`);
    } catch (error) {
      failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    snapshot.aaModels = await aaModels();
    console.log(`aa models: ${Object.keys(snapshot.aaModels).length} variants`);
  } catch (error) {
    failures.push(`aa models: ${error instanceof Error ? error.message : String(error)}`);
  }
  // A partial snapshot would rank with a board silently missing, so it is never written.
  if (failures.length) {
    console.error(`Not written; ${failures.length} board(s) failed:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  const dir = path.join(here, "snapshots");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${date}.json`);
  await writeFile(file, `${JSON.stringify(snapshot, null, 1)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
