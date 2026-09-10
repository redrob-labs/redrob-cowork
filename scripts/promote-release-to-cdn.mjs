#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CDN_PREFIX,
  CDN_PUBLIC_HOST,
  LINUX_TARGETS,
  WINDOWS_TARGETS,
  pack,
  upload,
} from "./cdn.mjs";

const STABLE_VERSION = /^\d+\.\d+\.\d+$/;
const MANIFEST = /^latest(?:-linux(?:-arm64)?|-mac)?\.yml$/;

export function normalizeReleaseVersion(value) {
  const version = String(value ?? "").trim().replace(/^v/, "");
  if (!STABLE_VERSION.test(version)) {
    throw new Error(`Release version must use x.y.z, received ${value || "(empty)"}.`);
  }
  return version;
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isReleaseAsset(name, version) {
  if (MANIFEST.test(name)) return true;
  return new RegExp(
    `^redrob-(?:linux|mac|win)-.+-${escaped(version)}\\.(?:AppImage|tar\\.gz|dmg|zip|exe)(?:\\.blockmap)?$`,
  ).test(name);
}

export function requiredReleaseAssets(version) {
  return [
    "latest-linux-arm64.yml",
    "latest-linux.yml",
    "latest-mac.yml",
    "latest.yml",
    `redrob-linux-arm64-${version}.AppImage`,
    `redrob-linux-arm64-${version}.tar.gz`,
    `redrob-linux-x86_64-${version}.AppImage`,
    `redrob-linux-x64-${version}.tar.gz`,
    `redrob-mac-arm64-${version}.dmg`,
    `redrob-mac-arm64-${version}.zip`,
    `redrob-mac-x64-${version}.dmg`,
    `redrob-mac-x64-${version}.zip`,
    `redrob-win-arm64-${version}.exe`,
    `redrob-win-x64-${version}.exe`,
  ];
}

function stableAliases(version) {
  return [
    [`redrob-linux-arm64-${version}.AppImage`, "redrob-linux-arm64.AppImage"],
    [`redrob-linux-arm64-${version}.tar.gz`, "redrob-linux-arm64.tar.gz"],
    [`redrob-mac-arm64-${version}.dmg`, "redrob-work-mac-arm64.dmg"],
    [`redrob-mac-x64-${version}.dmg`, "redrob-work-mac-x64.dmg"],
    [`redrob-win-arm64-${version}.exe`, "redrob-work-arm64-setup.exe"],
  ];
}

async function stageBytes(out, folder, name, bytes) {
  const directory = path.join(out, folder);
  await mkdir(directory, { recursive: true });
  const destination = path.join(directory, name);
  await writeFile(destination, bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  await writeFile(`${destination}.sha256`, `${digest}  ${name}\n`, "utf8");
  return destination;
}

export async function stageReleaseAssets({ dist, out, version, latest = true }) {
  const normalized = normalizeReleaseVersion(version);
  await rm(out, { recursive: true, force: true });

  const names = (await readdir(dist, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isReleaseAsset(entry.name, normalized))
    .map((entry) => entry.name)
    .sort();
  const missing = requiredReleaseAssets(normalized).filter((name) => !names.includes(name));
  if (missing.length) {
    throw new Error(`Release v${normalized} is missing required assets: ${missing.join(", ")}`);
  }

  // Keep the marketing aliases already contracted by Console.
  await pack({ dist, out, version: normalized, latest, targets: LINUX_TARGETS });
  await pack({ dist, out, version: normalized, latest, targets: WINDOWS_TARGETS });

  // Preserve every release filename so electron-updater manifests can resolve
  // their referenced zip, blockmap, AppImage and installer from the CDN.
  for (const name of names) {
    const bytes = await readFile(path.join(dist, name));
    await stageBytes(out, normalized, name, bytes);
    if (latest) await stageBytes(out, "latest", name, bytes);
  }

  // Add stable aliases for platforms the old build-oriented CDN workflow did
  // not publish. The versioned originals above remain the update authority.
  if (latest) {
    for (const [source, name] of stableAliases(normalized)) {
      const bytes = await readFile(path.join(dist, source));
      await stageBytes(out, "latest", name, bytes);
    }
  }

  const versionDocument = Buffer.from(`${JSON.stringify({ version: normalized, tag: `v${normalized}` })}\n`);
  await stageBytes(out, normalized, "version.json", versionDocument);
  if (latest) await stageBytes(out, "latest", "version.json", versionDocument);

  return { version: normalized, assets: names };
}

async function main() {
  const root = process.cwd();
  const version = normalizeReleaseVersion(process.env.REDROB_WORK_CDN_VERSION);
  const dist = path.join(root, "apps", "desktop", "dist-electron");
  const out = path.join(dist, "cdn");
  const staged = await stageReleaseAssets({ dist, out, version });
  console.log(`staged ${staged.assets.length} release assets for v${version} without rebuilding`);

  const result = await upload({ dir: out, env: process.env });
  if (!result.configured) throw new Error(`CDN upload is not configured: ${result.reason}`);
  for (const key of result.keys) console.log(`uploaded ${result.bucket}/${key}`);
  console.log(`${CDN_PUBLIC_HOST}/${CDN_PREFIX}/${version}/version.json`);
  console.log(`${CDN_PUBLIC_HOST}/${CDN_PREFIX}/latest/version.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
