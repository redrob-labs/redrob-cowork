/*
 * Puts the privacy detection model the installer ships into resources/privacy-model.
 *
 * resources/privacy-model/manifest.json is tracked in git and pinned by redrob-server
 * (PINNED_MANIFEST_SHA256 in apps/server/src/privacy/detector-source.ts). It names each weight file
 * with its SHA-256, so this script trusts no download: a file is kept only when it hashes to what the
 * tracked manifest says. The weights themselves are too large for git (about 104 MB) and are fetched
 * from this repository's release named by constants.json `privacyModelRelease`, or copied from a
 * local folder (REDROB_PRIVACY_MODEL_SOURCE, e.g. apps/server/.privacy-models/veil-ko-lite after
 * `pnpm privacy:eval`'s prepare.py).
 *
 * A packaged build without the model would quietly lose name detection at High and Strict, so a
 * missing or mismatching file fails the build. REDROB_ALLOW_NO_PRIVACY_MODEL=1 packages without it
 * (the app then reports patterns only); use it for local smoke builds, never for a release.
 */
import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MODEL_DIR = resolve(here, "..", "resources", "privacy-model");
const CONSTANTS_PATH = resolve(here, "..", "..", "..", "constants.json");
export const PRIVACY_MODEL_REPO = "redrob-labs/redrob-cowork";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The weight files a manifest pins, as { file, sha256 }. Refuses a manifest that names a path. */
export function pinnedFiles(manifest) {
  const files = [manifest?.model, manifest?.tokenizer];
  for (const entry of files) {
    if (!entry || typeof entry.file !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? "")) {
      throw new Error("privacy-model/manifest.json must pin model and tokenizer as { file, sha256 }");
    }
    if (entry.file !== entry.file.split(/[\\/]/).pop() || entry.file.startsWith(".")) {
      throw new Error(`privacy-model/manifest.json names a path, not a file: ${entry.file}`);
    }
  }
  return files.map(({ file, sha256: digest }) => ({ file, sha256: digest }));
}

export function releaseAssetUrl(tag, file, repo = PRIVACY_MODEL_REPO) {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`;
}

async function hashOf(path) {
  return existsSync(path) ? sha256(await readFile(path)) : null;
}

/** Writes bytes only when they hash to `expected`; the old file is replaced atomically. */
async function placeVerified(path, bytes, expected, origin) {
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`${origin} does not match the pinned SHA-256 (expected ${expected}, got ${actual})`);
  }
  const partial = `${path}.partial`;
  await writeFile(partial, bytes);
  await rename(partial, path);
}

/**
 * Makes every pinned file in `modelDir` present and verified. Returns, per file, where it came from:
 * "present" (already there and matching), "source" (copied) or "release" (downloaded).
 */
export async function preparePrivacyModel({
  modelDir = DEFAULT_MODEL_DIR,
  source = process.env.REDROB_PRIVACY_MODEL_SOURCE?.trim() || null,
  releaseTag = null,
  fetchImpl = fetch,
  log = (line) => process.stderr.write(`[privacy-model] ${line}\n`),
} = {}) {
  const manifest = JSON.parse(await readFile(join(modelDir, "manifest.json"), "utf8"));
  const tag = releaseTag ?? JSON.parse(await readFile(CONSTANTS_PATH, "utf8")).privacyModelRelease ?? null;
  const placed = {};
  for (const { file, sha256: expected } of pinnedFiles(manifest)) {
    const target = join(modelDir, file);
    if ((await hashOf(target)) === expected) {
      placed[file] = "present";
      continue;
    }
    if (source) {
      const from = resolve(source, file);
      await placeVerified(target, await readFile(from), expected, from);
      placed[file] = "source";
      continue;
    }
    if (!tag) throw new Error("constants.json has no privacyModelRelease, and REDROB_PRIVACY_MODEL_SOURCE is not set");
    const url = releaseAssetUrl(tag, file);
    log(`downloading ${url}`);
    const response = await fetchImpl(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    await placeVerified(target, new Uint8Array(await response.arrayBuffer()), expected, url);
    placed[file] = "release";
  }
  return placed;
}

/** Removes weight files that are not verified, so a build without the model ships none half-written. */
export async function removeUnverified(modelDir = DEFAULT_MODEL_DIR) {
  const manifest = JSON.parse(await readFile(join(modelDir, "manifest.json"), "utf8"));
  for (const { file, sha256: expected } of pinnedFiles(manifest)) {
    const target = join(modelDir, file);
    if ((await hashOf(target)) !== expected) await rm(target, { force: true });
    await rm(`${target}.partial`, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modelDir = DEFAULT_MODEL_DIR;
  try {
    const placed = await preparePrivacyModel({ modelDir });
    process.stdout.write(`${JSON.stringify({ ok: true, modelDir, placed })}\n`);
  } catch (error) {
    if (process.env.REDROB_ALLOW_NO_PRIVACY_MODEL !== "1") {
      process.stderr.write(
        `[privacy-model] ${error.message}\n` +
          "[privacy-model] The installer must ship the pinned privacy model. Set REDROB_PRIVACY_MODEL_SOURCE to a folder " +
          "holding it, or REDROB_ALLOW_NO_PRIVACY_MODEL=1 for a local build without it (patterns only).\n",
      );
      process.exit(1);
    }
    await removeUnverified(modelDir);
    process.stderr.write(`[privacy-model] WARNING: packaging WITHOUT the privacy model (${error.message})\n`);
    process.stdout.write(`${JSON.stringify({ ok: false, modelDir, reason: error.message })}\n`);
  }
}
