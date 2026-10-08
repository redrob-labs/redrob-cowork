/*
 * Puts the route model the installer ships into resources/route-model.
 *
 * The model is the one @redrob-labs/route-labeller pins in its src/manifest.json: every file named
 * with its SHA-256 and the pinned Hugging Face revision it comes from. This script trusts no download:
 * a file is kept only when it hashes to the manifest, and the manifest is written beside the files so
 * the packaged app carries the same pins. REDROB_ROUTE_MODEL_SOURCE copies from a local folder
 * (e.g. packages/route-labeller/.route-model after `pnpm --filter @redrob-labs/route-labeller model`).
 *
 * A packaged build without the model still labels requests, by words alone, so a missing model is
 * a warning here rather than a failed build; REDROB_REQUIRE_ROUTE_MODEL=1 makes it fatal for release.
 *
 * Imports the package's built output, so the package is built first (electron-build.mjs does that).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROUTE_MODEL_DIR = resolve(here, "..", "resources", "route-model");
const packageNode = resolve(here, "..", "..", "..", "packages", "route-labeller", "dist", "node.js");

if (import.meta.url === `file://${process.argv[1]}`) {
  const { prepareRouteModel } = await import(packageNode);
  try {
    await prepareRouteModel(DEFAULT_ROUTE_MODEL_DIR, {
      source: process.env.REDROB_ROUTE_MODEL_SOURCE?.trim() || null,
      log: (line) => process.stderr.write(`[route-model] ${line}\n`),
    });
    process.stderr.write(`[route-model] ready in ${DEFAULT_ROUTE_MODEL_DIR}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.REDROB_REQUIRE_ROUTE_MODEL === "1") {
      process.stderr.write(`[route-model] ${message}\n`);
      process.exit(1);
    }
    process.stderr.write(`[route-model] packaging without the route model (labels by words alone): ${message}\n`);
  }
}
