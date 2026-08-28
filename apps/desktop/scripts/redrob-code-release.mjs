/**
 * Pure decisions for resolving and downloading the Redrob Code engine release
 * that ships as the desktop sidecar.
 *
 * `redrob-labs/redrob-code` is a private repository: anonymous raw and
 * release-download URLs return 404. The only download route that accepts a token
 * is the Releases API asset endpoint addressed by asset id, which is what the
 * Redrob Code installer itself uses. This module keeps that resolution testable
 * and separate from prepare-sidecar.mjs's filesystem work.
 */

export const REDROB_CODE_REPO = "redrob-labs/redrob-code";
export const REDROB_CODE_BINARY_BASE = "redrob";

/**
 * Token lookup order, matching the Redrob Code installer. A build environment
 * that lacks all three cannot bundle the engine; no token is ever baked in.
 */
export const GITHUB_TOKEN_ENV_NAMES = ["REDROB_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];

/**
 * Release archive names published by redrob-code, keyed by the Rust target
 * triple the desktop build already uses for sidecar naming. x64 builds ship the
 * `-baseline` variant so pre-AVX2 machines can run them.
 */
export const REDROB_CODE_ARCHIVE_BY_TARGET = {
  "aarch64-apple-darwin": "redrob-darwin-arm64.zip",
  "x86_64-apple-darwin": "redrob-darwin-x64-baseline.zip",
  "x86_64-unknown-linux-gnu": "redrob-linux-x64-baseline.tar.gz",
  "aarch64-unknown-linux-gnu": "redrob-linux-arm64.tar.gz",
  "x86_64-pc-windows-msvc": "redrob-windows-x64-baseline.zip",
  "aarch64-pc-windows-msvc": "redrob-windows-arm64.zip",
};

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function normalizeGithubRepo(raw, fallback = REDROB_CODE_REPO) {
  const normalized = String(raw ?? "")
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .trim();
  return REPO_PATTERN.test(normalized) ? normalized : fallback;
}

export function isWindowsTargetTriple(targetTriple) {
  return String(targetTriple ?? "").includes("windows");
}

/** Archive name for a target triple, or null when the target is unsupported. */
export function redrobCodeArchiveName(targetTriple) {
  return REDROB_CODE_ARCHIVE_BY_TARGET[targetTriple] ?? null;
}

/**
 * Binary name inside the extracted archive and on disk.
 *
 * @param {{ targetTriple?: string | null, isWindows?: boolean }} [options]
 * @returns {string}
 */
export function redrobCodeBinaryName(options = {}) {
  const { targetTriple, isWindows } = options;
  const windows = isWindows ?? isWindowsTargetTriple(targetTriple);
  return windows ? `${REDROB_CODE_BINARY_BASE}.exe` : REDROB_CODE_BINARY_BASE;
}

/**
 * Sidecar filenames the packaged app looks for: the plain alias plus the
 * target-suffixed artifact electron-builder filters on.
 *
 * @param {{ targetTriple?: string | null, isWindows?: boolean }} [options]
 * @returns {{ alias: string, target: string | null }}
 */
export function packagedSidecarNames(options = {}) {
  const { targetTriple, isWindows } = options;
  const windows = isWindows ?? isWindowsTargetTriple(targetTriple);
  const suffix = windows ? ".exe" : "";
  return {
    alias: `${REDROB_CODE_BINARY_BASE}${suffix}`,
    target: targetTriple ? `${REDROB_CODE_BINARY_BASE}-${targetTriple}${suffix}` : null,
  };
}

/** First configured GitHub token, with the env name that supplied it. */
export function selectGithubToken(env = {}) {
  for (const name of GITHUB_TOKEN_ENV_NAMES) {
    const value = env[name]?.trim();
    if (value) return { token: value, source: name };
  }
  return null;
}

export function normalizeReleaseVersion(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.toLowerCase() === "latest") return null;
  return raw.startsWith("v") ? raw.slice(1) : raw;
}

export function releaseTagApiUrl(repo, version) {
  return `https://api.github.com/repos/${repo}/releases/tags/v${version}`;
}

export function releaseAssetApiUrl(repo, assetId) {
  return `https://api.github.com/repos/${repo}/releases/assets/${assetId}`;
}

/** Asset id for `filename` in a Releases API payload, or null when absent. */
export function selectReleaseAssetId(release, filename) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const match = assets.find((asset) => asset?.name === filename);
  return typeof match?.id === "number" ? match.id : null;
}

export function missingGithubTokenMessage(repo = REDROB_CODE_REPO) {
  return [
    `Cannot download the Redrob Code engine: ${repo} is a private repository and no GitHub token is set.`,
    `Set one of ${GITHUB_TOKEN_ENV_NAMES.join(", ")} to a token with read access to that repository,`,
    "or point REDROB_CODE_BIN at a locally built redrob binary.",
  ].join(" ");
}

function apiHeaders(token, accept) {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "User-Agent": "redrob-work-prepare-sidecar",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Download the release archive for `archiveName` to `destPath`.
 *
 * Uses Node `fetch` so macOS, Linux, and Windows share one code path instead of
 * diverging into curl and PowerShell. Throws an actionable error when the token
 * is missing, the release or asset is absent, or the download fails.
 */
export async function downloadRedrobCodeArchive({
  repo = REDROB_CODE_REPO,
  version,
  archiveName,
  destPath,
  env = {},
  fetchImpl = fetch,
  writeArchive,
}) {
  const normalizedVersion = normalizeReleaseVersion(version);
  if (!normalizedVersion) {
    throw new Error("A pinned Redrob Code version is required to download the engine archive.");
  }
  const credentials = selectGithubToken(env);
  if (!credentials) {
    throw new Error(missingGithubTokenMessage(repo));
  }

  const releaseUrl = releaseTagApiUrl(repo, normalizedVersion);
  const releaseResponse = await fetchImpl(releaseUrl, {
    headers: apiHeaders(credentials.token, "application/vnd.github+json"),
  });
  if (!releaseResponse.ok) {
    throw new Error(
      `Redrob Code release v${normalizedVersion} could not be read from ${releaseUrl} ` +
        `(HTTP ${releaseResponse.status} using ${credentials.source}).`,
    );
  }
  const release = await releaseResponse.json();
  const assetId = selectReleaseAssetId(release, archiveName);
  if (assetId === null) {
    throw new Error(`${archiveName} is not attached to Redrob Code release v${normalizedVersion}.`);
  }

  const assetUrl = releaseAssetApiUrl(repo, assetId);
  const assetResponse = await fetchImpl(assetUrl, {
    headers: apiHeaders(credentials.token, "application/octet-stream"),
    redirect: "follow",
  });
  if (!assetResponse.ok) {
    throw new Error(
      `Failed to download ${archiveName} from ${assetUrl} (HTTP ${assetResponse.status} using ${credentials.source}).`,
    );
  }

  const bytes = new Uint8Array(await assetResponse.arrayBuffer());
  await writeArchive(destPath, bytes);
  return { assetId, assetUrl, bytes: bytes.byteLength, tokenSource: credentials.source, version: normalizedVersion };
}
