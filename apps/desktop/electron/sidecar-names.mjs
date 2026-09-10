/**
 * Sidecar naming rules shared by the packaged main process and the build
 * scripts that produce those files.
 *
 * This lives under `electron/` rather than `scripts/` because it is the only
 * part of the sidecar contract the RUNTIME needs. `electron-builder.base.yml`
 * packs `electron/**` and `server/**` into app.asar and nothing else, so a main
 * process import that reaches into `scripts/` resolves fine in the repo and
 * then throws ERR_MODULE_NOT_FOUND on the user's machine at boot, before any
 * window opens. Keeping the read side here and having `scripts/` re-export it
 * means the writer and the reader still cannot drift.
 *
 * Build-only concerns -- release resolution, GitHub tokens, archive download --
 * stay in `scripts/redrob-code-release.mjs` and must never be imported from
 * `electron/`.
 */

export const REDROB_CODE_BINARY_BASE = "redrob";

export function isWindowsTargetTriple(targetTriple) {
  return String(targetTriple ?? "").includes("windows");
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
  // The Windows engine is already Authenticode-signed by the Code release.
  // Store it with a non-.exe resource name so electron-builder does not try to
  // sign the nested executable again. CreateProcess accepts an explicit PE
  // path regardless of extension, and renaming does not alter its signature.
  const suffix = windows ? ".bin" : "";
  return {
    alias: `${REDROB_CODE_BINARY_BASE}${suffix}`,
    target: targetTriple ? `${REDROB_CODE_BINARY_BASE}-${targetTriple}${suffix}` : null,
  };
}

/**
 * Names for the sidecar version metadata, which rides in the same directory.
 *
 * It takes the engine's suffix rather than `.json` because electron-builder
 * filters this directory by exact filename: a suffix the filter does not list
 * is a file that never reaches the package, and `afterPack` then finds a
 * sidecar directory with no metadata in it.
 *
 * @param {{ targetTriple?: string | null, isWindows?: boolean }} [options]
 * @returns {{ alias: string, target: string | null }}
 */
export function packagedSidecarMetadataNames(options = {}) {
  const { targetTriple, isWindows } = options;
  const windows = isWindows ?? isWindowsTargetTriple(targetTriple);
  const suffix = windows ? ".bin" : "";
  return {
    alias: "versions.json",
    target: targetTriple ? `versions.json-${targetTriple}${suffix}` : null,
  };
}

/**
 * Every filename the packaged app may find a sidecar under, most specific
 * first. This is the read side of `packagedSidecarNames`, and it is here so the
 * two cannot drift: a Windows engine written as `.bin` and looked up only as
 * `.exe` is a bundled engine the app reports as missing.
 *
 * `.exe` stays ahead of `.bin` because a pack builds its own helpers as `.exe`
 * and an installed CLI on PATH is `redrob.exe`; only the pre-signed engine
 * resource takes the `.bin` name.
 *
 * @param {string} baseName
 * @param {{ platform?: string, targetTriple?: string | null }} [options]
 * @returns {string[]}
 */
export function sidecarFileNames(baseName, options = {}) {
  const { platform = process.platform, targetTriple = null } = options;
  const extensions = platform === "win32" ? [".exe", ".bin"] : [""];
  return extensions
    .flatMap((ext) => [targetTriple ? `${baseName}-${targetTriple}${ext}` : null, `${baseName}${ext}`])
    .filter(Boolean);
}
