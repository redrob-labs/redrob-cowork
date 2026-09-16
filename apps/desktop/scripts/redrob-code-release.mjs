/**
 * Pure decisions for resolving and downloading the Redrob Code engine release
 * that ships as the desktop sidecar.
 *
 * `redrob-labs/redrob-code` is PUBLIC, so the plain browser download URL
 * `releases/download/<tag>/<asset>` serves anonymously and no credential is
 * needed -- a plain CI runner can bundle the engine without one. This module was
 * written when that repository was private and had to address assets by id
 * through the authenticated Releases API; that route still works for a
 * credential holder, but requiring one would make a public artifact unreachable
 * without it.
 *
 * Each release carries ONE `SHA256SUMS` manifest covering all of its assets, and
 * an unauthenticated download is only trustworthy if that digest is checked, so
 * a mismatch refuses the archive instead of unpacking it.
 *
 * The sidecar NAMING rules live in `../electron/sidecar-names.mjs` and are
 * re-exported here, because the packaged main process needs them and app.asar
 * contains `electron/**` but not `scripts/**`. Do not move them back: an
 * `electron/` import of this file resolves in the repo and fails at boot on a
 * user's machine with ERR_MODULE_NOT_FOUND.
 */

import { createHash } from "node:crypto";

export {
  REDROB_CODE_BINARY_BASE,
  isWindowsTargetTriple,
  packagedSidecarMetadataNames,
  packagedSidecarNames,
  redrobCodeBinaryName,
  sidecarFileNames,
} from "../electron/sidecar-names.mjs";

export const REDROB_CODE_REPO = "redrob-labs/redrob-code";

/**
 * Release archive names published by redrob-code, keyed by the Rust target
 * triple the desktop build already uses for sidecar naming. x64 builds ship the
 * `-baseline` variant so pre-AVX2 machines can run them.
 *
 * Every platform is a `.zip`, Linux included: the engine's release workflow
 * publishes no tarballs, so the two `.tar.gz` names this table used to carry
 * could never resolve. The `-musl` variants it also publishes stay unmapped --
 * a distributable must not silently swap libc under the triple it claims.
 */
export const REDROB_CODE_ARCHIVE_BY_TARGET = {
  "aarch64-apple-darwin": "redrob-darwin-arm64.zip",
  "x86_64-apple-darwin": "redrob-darwin-x64-baseline.zip",
  "x86_64-unknown-linux-gnu": "redrob-linux-x64-baseline.zip",
  "aarch64-unknown-linux-gnu": "redrob-linux-arm64.zip",
  "x86_64-pc-windows-msvc": "redrob-windows-x64-baseline.zip",
  "aarch64-pc-windows-msvc": "redrob-windows-arm64.zip",
};

/** One digest manifest per release, in `sha256sum` format, covering every asset. */
export const REDROB_CODE_SHA256SUMS_NAME = "SHA256SUMS";

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function normalizeGithubRepo(raw, fallback = REDROB_CODE_REPO) {
  const normalized = String(raw ?? "")
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .trim();
  return REPO_PATTERN.test(normalized) ? normalized : fallback;
}

/** Archive name for a target triple, or null when the target is unsupported. */
export function redrobCodeArchiveName(targetTriple) {
  return REDROB_CODE_ARCHIVE_BY_TARGET[targetTriple] ?? null;
}

export function normalizeReleaseVersion(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.toLowerCase() === "latest") return null;
  return raw.startsWith("v") ? raw.slice(1) : raw;
}

/**
 * Public download URL for one asset of a release.
 *
 * GitHub spells a pinned tag and the floating alias differently --
 * `releases/download/<tag>/<asset>` versus `releases/latest/download/<asset>` --
 * and the alias resolves only for an EXACT asset name, which is why the engine
 * publishes version-less names.
 */
export function releaseDownloadUrl(repo, version, assetName) {
  const normalized = normalizeReleaseVersion(version);
  const base = `https://github.com/${repo}/releases`;
  return normalized ? `${base}/download/v${normalized}/${assetName}` : `${base}/latest/download/${assetName}`;
}

/** Digest manifest URL for the same release the asset comes from. */
export function releaseSha256SumsUrl(repo, version) {
  return releaseDownloadUrl(repo, version, REDROB_CODE_SHA256SUMS_NAME);
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Digest for `assetName` out of a release's `SHA256SUMS`.
 *
 * The manifest covers every asset in the release, so unlike a per-asset sidecar
 * this has to SELECT the right line. A manifest that does not mention the asset
 * is a publishing mistake, and accepting the download unverified would defeat
 * the check entirely, so it is refused.
 */
export function parseSha256Sums(text, assetName) {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw new Error(`The ${REDROB_CODE_SHA256SUMS_NAME} manifest is empty, so ${assetName} cannot be verified.`);
  }
  for (const line of lines) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(\S+)$/.exec(line);
    if (!match) {
      throw new Error(`${REDROB_CODE_SHA256SUMS_NAME} is not in sha256sum format: ${line}`);
    }
    const named = match[2].replace(/^\.\//, "").split("/").pop();
    if (named === assetName) return match[1].toLowerCase();
  }
  throw new Error(`${REDROB_CODE_SHA256SUMS_NAME} does not list ${assetName}, so it cannot be verified.`);
}

/**
 * Download the release archive for `archiveName` to `destPath`, writing it only
 * after its digest matches the release's manifest.
 *
 * Uses Node `fetch` so macOS, Linux, and Windows share one code path instead of
 * diverging into curl and PowerShell. The manifest is read and the bytes hashed
 * before anything is written, so a mismatch leaves no archive on disk for a
 * later step to unpack.
 */
export async function downloadRedrobCodeArchive({
  repo = REDROB_CODE_REPO,
  version,
  archiveName,
  destPath,
  fetchImpl = fetch,
  writeArchive,
}) {
  const normalizedVersion = normalizeReleaseVersion(version);
  if (!normalizedVersion) {
    throw new Error("A pinned Redrob Code version is required to download the engine archive.");
  }
  if (!archiveName) {
    throw new Error("A release asset name is required to download the Redrob Code engine.");
  }

  const sha256Url = releaseSha256SumsUrl(repo, version);
  const sha256Response = await fetchImpl(sha256Url, { redirect: "follow" });
  if (!sha256Response.ok) {
    throw new Error(
      `The ${REDROB_CODE_SHA256SUMS_NAME} manifest for Redrob Code v${normalizedVersion} could not be read ` +
        `from ${sha256Url} (HTTP ${sha256Response.status}).`,
    );
  }
  const expectedDigest = parseSha256Sums(await sha256Response.text(), archiveName);

  const assetUrl = releaseDownloadUrl(repo, version, archiveName);
  const assetResponse = await fetchImpl(assetUrl, { redirect: "follow" });
  if (!assetResponse.ok) {
    throw new Error(`Failed to download ${archiveName} from ${assetUrl} (HTTP ${assetResponse.status}).`);
  }

  const bytes = new Uint8Array(await assetResponse.arrayBuffer());
  const actualDigest = sha256Hex(bytes);
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `${archiveName} from ${assetUrl} failed sha256 verification: expected ${expectedDigest}, got ${actualDigest}.`,
    );
  }

  await writeArchive(destPath, bytes);
  return { assetUrl, sha256Url, bytes: bytes.byteLength, sha256: actualDigest, version: normalizedVersion };
}
