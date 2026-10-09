/*
 * Puts the work classifier's encoder (multilingual-e5-base, about 278 MB) into resources/insights-model,
 * the same way prepare-privacy-model.mjs does for the privacy model: the tracked manifest.json, pinned
 * the same pins as @redrob-labs/work-labeller's (packages/work-labeller/src/manifest.json, which
 * redrob-server checks the files against), names each file with its SHA-256, and a file is kept only when it matches. The files come from this
 * repository's release named by constants.json `insightsModelRelease`, or a local folder
 * (REDROB_INSIGHTS_MODEL_SOURCE, e.g. a Hugging Face snapshot of the pinned revision).
 *
 * Unlike the privacy model, a build without it still protects everything: sessions are then sent
 * without a work family. So a missing or mismatching file warns and packages without the model,
 * removing anything unverified, instead of failing the build.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { preparePrivacyModel, removeUnverified } from "./prepare-privacy-model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_INSIGHTS_MODEL_DIR = resolve(here, "..", "resources", "insights-model");
const CONSTANTS_PATH = resolve(here, "..", "..", "..", "constants.json");
const log = (line) => process.stderr.write(`[insights-model] ${line}\n`);

export async function prepareInsightsModel({
  modelDir = DEFAULT_INSIGHTS_MODEL_DIR,
  source = process.env.REDROB_INSIGHTS_MODEL_SOURCE?.trim() || null,
  releaseTag = null,
  fetchImpl = fetch,
} = {}) {
  const tag = releaseTag ?? JSON.parse(await readFile(CONSTANTS_PATH, "utf8")).insightsModelRelease ?? null;
  if (!tag && !source) throw new Error("constants.json has no insightsModelRelease, and REDROB_INSIGHTS_MODEL_SOURCE is not set");
  return preparePrivacyModel({ modelDir, source, releaseTag: tag, fetchImpl, log });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modelDir = DEFAULT_INSIGHTS_MODEL_DIR;
  try {
    const placed = await prepareInsightsModel({ modelDir });
    process.stdout.write(`${JSON.stringify({ ok: true, modelDir, placed })}\n`);
  } catch (error) {
    await removeUnverified(modelDir);
    log(`WARNING: packaging WITHOUT the work model, so sessions carry no work family (${error.message})`);
    process.stdout.write(`${JSON.stringify({ ok: false, modelDir, reason: error.message })}\n`);
  }
}
