import { spawnSync } from "child_process";
import { createHash } from "crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { writeFile } from "fs/promises";
import { basename, dirname, join, resolve } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

import {
  downloadRedrobCodeArchive,
  normalizeGithubRepo,
  normalizeReleaseVersion,
  packagedSidecarMetadataNames,
  packagedSidecarNames,
  redrobCodeArchiveName,
  redrobCodeBinaryName,
} from "./redrob-code-release.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readArg = (name) => {
  const raw = process.argv.slice(2);
  const direct = raw.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.split("=")[1];
  const index = raw.indexOf(name);
  if (index >= 0 && raw[index + 1]) return raw[index + 1];
  return null;
};

const sidecarOverride = process.env.REDROB_SIDECAR_DIR?.trim() || readArg("--outdir");
const sidecarDir = sidecarOverride ? resolve(sidecarOverride) : join(__dirname, "..", "resources", "sidecars");
const constantsPath = resolve(__dirname, "..", "..", "..", "constants.json");

const pinnedRedrobCodeVersion = (() => {
  try {
    const raw = readFileSync(constantsPath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.redrobCodeVersion === "string" ? parsed.redrobCodeVersion.trim() || null : null;
  } catch {
    return null;
  }
})();

const archiveOverride = process.env.REDROB_CODE_ASSET?.trim() || null;

// Target triple for native platform binaries
const resolvedTargetTriple = (() => {
  const envTarget =
    process.env.TAURI_ENV_TARGET_TRIPLE ??
    process.env.CARGO_CFG_TARGET_TRIPLE ??
    process.env.TARGET;
  if (envTarget) return envTarget;
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
  }
  if (process.platform === "win32") {
    return process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  }
  return null;
})();
const isWindowsTarget = process.platform === "win32" || resolvedTargetTriple?.includes("windows") === true;

const engineBaseName = redrobCodeBinaryName({ isWindows: isWindowsTarget });
const sidecarNames = packagedSidecarNames({ targetTriple: resolvedTargetTriple, isWindows: isWindowsTarget });
const enginePath = join(sidecarDir, sidecarNames.alias);
const engineTargetPath = sidecarNames.target ? join(sidecarDir, sidecarNames.target) : null;

const engineCandidatePath = engineTargetPath ?? enginePath;
let existingEngineVersion = null;

// redrob-server paths
const redrobServerDir = resolve(__dirname, "..", "..", "server");

const readHeader = (filePath, length = 256) => {
  const fd = openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    closeSync(fd);
  }
};

const isStubBinary = (filePath) => {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return true;
    if (stat.size < 1024) return true;
    const header = readHeader(filePath);
    if (header.startsWith("#!")) return true;
    if (header.includes("Sidecar missing") || header.includes("Bun is required")) return true;
  } catch {
    return true;
  }
  return false;
};

const readDirectory = (dir) => {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const next = join(dir, entry.name);
    if (entry.isDirectory()) {
      return readDirectory(next);
    }
    if (entry.isFile()) {
      return [next];
    }
    return [];
  });
};

const findEngineBinary = (dir, preferredNames = []) => {
  const candidates = readDirectory(dir);
  const named = (name) =>
    candidates.find((file) => file.endsWith(`/${name}`) || file.endsWith(`\\${name}`)) ?? null;
  for (const name of [...preferredNames, engineBaseName, "redrob.exe", "redrob"]) {
    const match = named(name);
    if (match) return match;
  }
  return null;
};

const readBinaryVersion = (filePath) => {
  try {
    const result = spawnSync(filePath, ["--version"], { encoding: "utf8" });
    if (result.status === 0 && result.stdout) return result.stdout.trim();
  } catch {
    // ignore
  }
  return null;
};

const sha256File = (filePath) => {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
};

const adHocSignDarwin = (filePath) => {
  if (process.platform !== "darwin" || !filePath || !existsSync(filePath)) return;
  const remove = spawnSync("codesign", ["--remove-signature", filePath], {
    encoding: "utf8",
  });
  if (remove.error && remove.error.code === "ENOENT") {
    throw new Error("codesign is required to prepare runnable macOS sidecars");
  }

  const sign = spawnSync("codesign", ["--force", "--sign", "-", filePath], {
    encoding: "utf8",
  });
  if (sign.error) {
    if (sign.error.code === "ENOENT") {
      throw new Error("codesign is required to prepare runnable macOS sidecars");
    }
    throw sign.error;
  }
  if (sign.status !== 0) {
    const stderr = sign.stderr?.trim();
    throw new Error(`Failed to codesign ${filePath}${stderr ? `: ${stderr}` : ""}`);
  }
};

const adHocSignDarwinSidecars = (paths) => {
  if (process.platform !== "darwin") return;
  for (const filePath of [...new Set(paths.filter(Boolean))]) {
    adHocSignDarwin(filePath);
  }
};

// redrob-server is no longer compiled as a sidecar binary — it runs
// in-process inside Electron via a direct import of the server library.
// Server binary copy/sign skipped — runs in-process.

if (!existingEngineVersion && engineCandidatePath) {
  existingEngineVersion =
    existsSync(engineCandidatePath) && !isStubBinary(engineCandidatePath)
      ? readBinaryVersion(engineCandidatePath)
      : null;
}

const normalizedEngineVersion = normalizeReleaseVersion(pinnedRedrobCodeVersion);

if (!normalizedEngineVersion) {
  console.error(`Redrob Code version could not be resolved from ${constantsPath}.`);
  process.exit(1);
}

// redrob-labs/redrob-code is public, so its release assets need no credential and
// are the primary and only remote source. REDROB_CODE_RELEASE_VERSION=latest
// follows GitHub's own stable alias; by default the pinned constants.json version
// is fetched from its own tag so a build stays reproducible.
const releaseAsset = archiveOverride ?? (
  resolvedTargetTriple ? redrobCodeArchiveName(resolvedTargetTriple) : null
);
const releaseRepo = normalizeGithubRepo(process.env.REDROB_CODE_REPO);
const releaseVersion = process.env.REDROB_CODE_RELEASE_VERSION?.trim() || normalizedEngineVersion;

const shouldDownloadEngine =
  !engineCandidatePath ||
  !existsSync(engineCandidatePath) ||
  isStubBinary(engineCandidatePath) ||
  !existingEngineVersion ||
  existingEngineVersion !== normalizedEngineVersion;

if (!shouldDownloadEngine) {
  console.log(`Redrob Code sidecar already present (${existingEngineVersion}).`);
}

if (shouldDownloadEngine) {
  // A locally built engine is the supported path when no release token exists:
  // point REDROB_CODE_BIN at it and the sidecar is copied instead of downloaded.
  const localBin = process.env.REDROB_CODE_BIN?.trim();
  if (localBin && existsSync(localBin)) {
    mkdirSync(sidecarDir, { recursive: true });
    installEngineBinary(localBin);
    console.log(`Redrob Code sidecar copied from REDROB_CODE_BIN (${localBin}).`);
  } else {
    if (!releaseAsset) {
      console.error(
        `No Redrob Code release asset configured for target ${resolvedTargetTriple ?? "unknown"}. Set REDROB_CODE_ASSET to a release asset name to override.`,
      );
      process.exit(1);
    }

    mkdirSync(sidecarDir, { recursive: true });

    const stamp = Date.now();
    const extractDir = join(tmpdir(), `redrob-code-${stamp}`);

    mkdirSync(extractDir, { recursive: true });

    const failures = [];
    const errorMessage = (error) => (error instanceof Error ? error.message : String(error));
    let downloadedArchive = null;

    if (releaseAsset) {
      const archivePath = join(tmpdir(), `redrob-code-${stamp}-${releaseAsset}`);
      try {
        const result = await downloadRedrobCodeArchive({
          repo: releaseRepo,
          version: releaseVersion,
          archiveName: releaseAsset,
          destPath: archivePath,
          writeArchive: (path, bytes) => writeFile(path, bytes),
        });
        console.log(
          `Downloaded ${releaseAsset} (${result.bytes} bytes) from ${result.assetUrl}; sha256 ${result.sha256} matches the release manifest.`,
        );
        downloadedArchive = { name: releaseAsset, path: archivePath };
      } catch (error) {
        failures.push(errorMessage(error));
      }
    }

    if (!downloadedArchive) {
      console.error(
        [`Could not obtain the Redrob Code engine for ${resolvedTargetTriple ?? "unknown"}:`, ...failures].join("\n  "),
      );
      process.exit(1);
    }

    const { name: downloadedName, path: archivePath } = downloadedArchive;

    if (downloadedName.endsWith(".zip")) {
      const unzipResult = process.platform === "win32"
        ? spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `$ErrorActionPreference = 'Stop'; Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
          ],
          { stdio: "inherit" },
        )
        : spawnSync("unzip", ["-q", archivePath, "-d", extractDir], { stdio: "inherit" });
      if (unzipResult.status !== 0) {
        process.exit(unzipResult.status ?? 1);
      }
    } else if (downloadedName.endsWith(".tar.gz")) {
      // GNU tar treats a Windows drive-letter path such as `C:\\...` as
      // remote-host syntax. Both paths live directly under tmpdir(), so pass
      // relative basenames from that directory on every platform.
      const tarResult = spawnSync(
        "tar",
        ["-xzf", basename(archivePath), "-C", basename(extractDir)],
        { cwd: tmpdir(), stdio: "inherit" },
      );
      if (tarResult.status !== 0) {
        process.exit(tarResult.status ?? 1);
      }
    } else {
      console.error(`Unknown Redrob Code archive type: ${downloadedName}`);
      process.exit(1);
    }

    // The release archives ship a flat `redrob` at the archive root. Named
    // explicitly rather than relying on the fallback list, so a layout change
    // fails loudly instead of picking up whatever else looks like an engine.
    const extractedBinary = findEngineBinary(extractDir, [
      redrobCodeBinaryName({ isWindows: isWindowsTarget }),
    ]);
    if (!extractedBinary) {
      console.error("Redrob Code binary not found after extraction.");
      process.exit(1);
    }

    installEngineBinary(extractedBinary);
    console.log(`Redrob Code sidecar updated to ${normalizedEngineVersion}.`);
  }
}

function installEngineBinary(sourcePath) {
  for (const target of [engineTargetPath, enginePath].filter(Boolean)) {
    try {
      if (existsSync(target)) {
        unlinkSync(target);
      }
    } catch {
      // ignore
    }
    copyFileSync(sourcePath, target);
    try {
      chmodSync(target, 0o755);
    } catch {
      // ignore
    }
  }
}

adHocSignDarwinSidecars([
  enginePath,
  engineTargetPath,
  // redrob-server runs in-process — no binary to sign.
]);

const redrobServerVersion = (() => {
  try {
    const raw = readFileSync(resolve(redrobServerDir, "package.json"), "utf8");
    return String(JSON.parse(raw).version ?? "").trim();
  } catch {
    return null;
  }
})();

const versions = {
  "redrob-code": {
    version: normalizedEngineVersion,
    sha256: engineCandidatePath && existsSync(engineCandidatePath) ? sha256File(engineCandidatePath) : null,
  },
  "redrob-server": {
    version: redrobServerVersion,
    sha256: "in-process",
  },
};

const missing = Object.entries(versions)
  .filter(([, info]) => !info.version || !info.sha256)
  .map(([name]) => name);

if (missing.length) {
  console.error(`Sidecar version metadata incomplete for: ${missing.join(", ")}`);
  process.exit(1);
}

const versionsPath = join(sidecarDir, "versions.json");
try {
  mkdirSync(sidecarDir, { recursive: true });
  const content = JSON.stringify(versions, null, 2) + "\n";
  writeFileSync(versionsPath, content, "utf8");
  const metadataNames = packagedSidecarMetadataNames({
    targetTriple: resolvedTargetTriple,
    isWindows: isWindowsTarget,
  });
  if (metadataNames.target) {
    writeFileSync(join(sidecarDir, metadataNames.target), content, "utf8");
  }
} catch (error) {
  console.error(`Failed to write versions.json: ${error}`);
  process.exit(1);
}
