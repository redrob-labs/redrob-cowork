/**
 * Pure decisions for fetching the Redrob Code engine sidecar from the public
 * Code CDN at https://cdn.redrob.ai/code/.
 *
 * The CDN is the primary source because it needs no credentials: a plain CI
 * runner can build a runnable desktop distributable without a token for the
 * private `redrob-labs/redrob-code` repository. Every archive has a `.sha256`
 * sidecar in `sha256sum` format beside it, and an unauthenticated download is
 * only trustworthy if that digest is checked, so a mismatch refuses the archive
 * instead of unpacking it. There is deliberately no private-GitHub fallback:
 * desktop builds consume the same public, checksummed artifacts users do.
 */

import { createHash } from "node:crypto";

export const REDROB_CODE_CDN_BASE_URL = "https://cdn.redrob.ai/code";

/** Binary name inside the CDN archives (they ship `redrob-code`, not `redrob`). */
export const REDROB_CODE_CDN_BINARY_BASE = "redrob-code";

/**
 * Archives published to the CDN, keyed by the Rust target triple the desktop
 * build already uses for sidecar naming.
 */
export const REDROB_CODE_CDN_ARCHIVE_BY_TARGET = {
  "x86_64-unknown-linux-gnu": "redrob-code-linux-x64.tar.gz",
  "aarch64-unknown-linux-gnu": "redrob-code-linux-arm64.tar.gz",
  "x86_64-apple-darwin": "redrob-code-darwin-x64.tar.gz",
  "aarch64-apple-darwin": "redrob-code-darwin-arm64.tar.gz",
  "x86_64-pc-windows-msvc": "redrob-code-windows-x64.tar.gz",
  "aarch64-pc-windows-msvc": "redrob-code-windows-arm64.tar.gz",
};

/** CDN archive name for a target triple, or null when the CDN has no build. */
export function redrobCodeCdnArchiveName(targetTriple) {
  return REDROB_CODE_CDN_ARCHIVE_BY_TARGET[targetTriple] ?? null;
}

/** Binary name inside the CDN archive for a target. */
export function redrobCodeCdnBinaryName(options = {}) {
  const { targetTriple, isWindows } = options;
  const windows = isWindows ?? String(targetTriple ?? "").includes("windows");
  return windows ? `${REDROB_CODE_CDN_BINARY_BASE}.exe` : REDROB_CODE_CDN_BINARY_BASE;
}

export function normalizeCdnBaseUrl(raw) {
  const trimmed = String(raw ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/\S+$/.test(trimmed) ? trimmed : REDROB_CODE_CDN_BASE_URL;
}

/**
 * Prefix a version publishes under. `latest` is the CDN's own stable alias, so
 * it is the one floating value that is allowed through; anything else is pinned
 * and loses a leading `v` to match the published prefixes.
 */
export function redrobCodeCdnVersionPrefix(version) {
  const raw = String(version ?? "").trim();
  if (!raw || raw.toLowerCase() === "latest") return "latest";
  return raw.startsWith("v") ? raw.slice(1) : raw;
}

export function redrobCodeCdnArchiveUrl({ baseUrl, version, archiveName }) {
  return `${normalizeCdnBaseUrl(baseUrl)}/${redrobCodeCdnVersionPrefix(version)}/${archiveName}`;
}

export function redrobCodeCdnSha256Url(archiveUrl) {
  return `${archiveUrl}.sha256`;
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Digest out of a `sha256sum` sidecar, checked to describe `archiveName`.
 *
 * A sidecar that names a different file is a publishing mistake, and accepting
 * it would verify the download against the wrong build, so it is refused.
 */
export function parseSha256Sidecar(text, archiveName) {
  const line = String(text ?? "")
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);
  if (!line) {
    throw new Error(`The sha256 sidecar for ${archiveName} is empty.`);
  }
  const match = /^([0-9a-fA-F]{64})\s+\*?(\S+)$/.exec(line);
  if (!match) {
    throw new Error(`The sha256 sidecar for ${archiveName} is not in sha256sum format: ${line}`);
  }
  const named = match[2].replace(/^\.\//, "").split("/").pop();
  if (named !== archiveName) {
    throw new Error(`The sha256 sidecar for ${archiveName} describes ${named} instead.`);
  }
  return match[1].toLowerCase();
}

/**
 * Download `archiveName` from the Code CDN and write it only after its digest
 * matches the published sidecar.
 *
 * The sidecar is read first and the bytes are hashed before anything is written,
 * so a mismatch leaves no archive on disk for a later step to unpack.
 */
export async function downloadRedrobCodeCdnArchive({
  baseUrl,
  version,
  archiveName,
  destPath,
  fetchImpl = fetch,
  writeArchive,
}) {
  if (!archiveName) {
    throw new Error("A CDN archive name is required to download the Redrob Code engine.");
  }
  const archiveUrl = redrobCodeCdnArchiveUrl({ baseUrl, version, archiveName });
  const sha256Url = redrobCodeCdnSha256Url(archiveUrl);

  const sha256Response = await fetchImpl(sha256Url, { redirect: "follow" });
  if (!sha256Response.ok) {
    throw new Error(`The sha256 sidecar for ${archiveName} could not be read from ${sha256Url} (HTTP ${sha256Response.status}).`);
  }
  const expectedDigest = parseSha256Sidecar(await sha256Response.text(), archiveName);

  const archiveResponse = await fetchImpl(archiveUrl, { redirect: "follow" });
  if (!archiveResponse.ok) {
    throw new Error(`Failed to download ${archiveName} from ${archiveUrl} (HTTP ${archiveResponse.status}).`);
  }
  const bytes = new Uint8Array(await archiveResponse.arrayBuffer());
  const actualDigest = sha256Hex(bytes);
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `${archiveName} from ${archiveUrl} failed sha256 verification: expected ${expectedDigest}, got ${actualDigest}.`,
    );
  }

  await writeArchive(destPath, bytes);
  return { archiveUrl, sha256Url, bytes: bytes.byteLength, sha256: actualDigest };
}
