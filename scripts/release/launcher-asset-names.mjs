#!/usr/bin/env node
/**
 * Release asset names Redrob Launcher can install.
 *
 * The launcher installs an asset only when its name is
 *
 *     <stem>-<version>-<os>-<arch>[-portable].<ext>
 *
 * with stem `redrob-cowork`, a version that starts with a digit (no leading
 * `v`), one of the os-arch tokens in LAUNCHER_TOKENS, and an extension it knows
 * how to install (.dmg, .AppImage, .tar.gz, .deb, .rpm, .flatpak, .msi,
 * -portable.zip). electron-builder cannot produce those tokens by itself: its
 * `${os}` is mac/linux/win and its `${arch}` is x64/arm64, and a Windows `zip`
 * target carries no `-portable` marker. So the packager writes
 *
 *     redrob-cowork-<version>-<eb os>-<eb arch>.<ext>
 *
 * (artifactName in apps/desktop/electron-builder.yml) and this script, run
 * right after packaging, renames every asset into the launcher's shape and
 * rewrites the electron-updater manifests (latest*.yml) that point at them by
 * name, so self-update keeps working under the new names. `check` is the gate
 * that refuses a dist directory whose installable assets would be invisible
 * to the launcher.
 *
 *     node scripts/release/launcher-asset-names.mjs rename <dist-dir>
 *     node scripts/release/launcher-asset-names.mjs check  <dist-dir>
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STEM = "redrob-cowork";

/** Tokens the launcher's Platform::tokens() looks for, by final os. */
export const LAUNCHER_TOKENS = [
  "linux-x86_64",
  "linux-aarch64",
  "linux-riscv64",
  "macos-universal",
  "macos-aarch64",
  "macos-x86_64",
  "windows-x64",
  "windows-arm64",
  "windows-x86",
  "freebsd-x86_64",
];

/** Suffixes the launcher installs (PackageKind::suffix), longest first. */
export const INSTALLABLE_SUFFIXES = [
  "-portable.zip",
  ".AppImage",
  ".flatpak",
  ".tar.gz",
  ".msi",
  ".dmg",
  ".deb",
  ".rpm",
];

/** electron-builder `${os}` -> launcher os. Final names are accepted as-is. */
const OS_BY_BUILDER = { mac: "macos", linux: "linux", win: "windows", macos: "macos", windows: "windows" };

/** electron-builder `${arch}` -> launcher arch, per final os. */
const ARCH_BY_OS = {
  windows: { x64: "x64", arm64: "arm64", ia32: "x86", x86: "x86" },
  macos: { x64: "x86_64", x86_64: "x86_64", arm64: "aarch64", aarch64: "aarch64", universal: "universal" },
  linux: {
    x64: "x86_64",
    x86_64: "x86_64",
    arm64: "aarch64",
    aarch64: "aarch64",
    riscv64: "riscv64",
    armv7l: "armv7l",
  },
};

/** Every extension electron-builder emits here, longest first so `.tar.gz` wins over `.gz`. */
const BUILDER_EXTENSIONS = [
  ".dmg.blockmap",
  ".zip.blockmap",
  ".exe.blockmap",
  ".AppImage",
  ".tar.gz",
  ".flatpak",
  ".dmg",
  ".zip",
  ".exe",
  ".msi",
  ".deb",
  ".rpm",
];

const PREFIX = `${STEM}-`;

function splitExtension(name) {
  for (const ext of BUILDER_EXTENSIONS) {
    if (name.endsWith(ext)) return { base: name.slice(0, -ext.length), ext };
  }
  return null;
}

/**
 * The launcher-shaped name for one packager output, the same name when it is
 * already in that shape, or null when the file is not one of this app's
 * assets (updater manifests, unpacked trees, foreign files).
 * Throws on a `redrob-cowork-*` file it cannot interpret: that is a packager
 * output nobody taught this table about, and silently shipping it under an
 * unknown name is how the launcher ends up with nothing to install.
 */
export function launcherAssetName(name) {
  if (!name.startsWith(PREFIX)) return null;
  const split = splitExtension(name);
  if (!split) throw new Error(`Unrecognised asset extension: ${name}`);
  let { base, ext } = split;
  let portable = false;
  if (base.endsWith("-portable")) {
    base = base.slice(0, -"-portable".length);
    portable = true;
  }
  const rest = base.slice(PREFIX.length);
  // rest = <version>-<os>-<arch>; os and arch never contain '-', versions may.
  const parts = rest.split("-");
  if (parts.length < 3) throw new Error(`Asset name has no <version>-<os>-<arch> tail: ${name}`);
  const builderArch = parts.pop();
  const builderOs = parts.pop();
  const version = parts.join("-");
  if (!/^\d/.test(version)) throw new Error(`Asset version must start with a digit: ${name}`);
  const os = OS_BY_BUILDER[builderOs];
  if (!os) throw new Error(`Unknown os token "${builderOs}" in ${name}`);
  const arch = ARCH_BY_OS[os][builderArch];
  if (!arch) throw new Error(`Unknown arch token "${builderArch}" for ${os} in ${name}`);
  // A Windows zip is the unpacked app, which is what the launcher calls portable.
  if (os === "windows" && (ext === ".zip" || ext === ".zip.blockmap")) portable = true;
  return `${PREFIX}${version}-${os}-${arch}${portable ? "-portable" : ""}${ext}`;
}

/**
 * Mirror of the launcher's parse_asset_name: the parsed fields when the
 * launcher would install this asset, null otherwise.
 */
export function parseLauncherAssetName(name) {
  const suffix = INSTALLABLE_SUFFIXES.find((s) => name.endsWith(s));
  if (!suffix) return null;
  const base = name.slice(0, -suffix.length);
  if (!base.startsWith(PREFIX)) return null;
  const parts = base.slice(PREFIX.length).split("-");
  if (parts.length < 3) return null;
  const arch = parts.pop();
  const os = parts.pop();
  const version = parts.join("-");
  if (!/^\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z.+-]*)?$/.test(version)) return null;
  const token = `${os}-${arch}`;
  if (!LAUNCHER_TOKENS.includes(token)) return null;
  return { stem: STEM, version, token, suffix };
}

export function isUpdaterManifest(name) {
  return /^(?:latest|cloud|enterprise).*\.ya?ml$/.test(name);
}

/**
 * Rewrite the `url:` and `path:` values of an electron-updater manifest from
 * old asset names to new ones. Line-based on purpose: electron-builder writes
 * these as plain scalars and nothing else in the file names an asset.
 */
export function rewriteManifest(text, renames) {
  const lines = text.split("\n");
  const out = lines.map((line) => {
    const match = /^(\s*(?:-\s+)?(?:url|path):\s*)(['"]?)(.+?)\2\s*$/.exec(line);
    if (!match) return line;
    const [, head, quote, value] = match;
    const renamed = renames.get(value);
    return renamed ? `${head}${quote}${renamed}${quote}` : line;
  });
  return out.join("\n");
}

/** Names referenced by `url:`/`path:` in a manifest. */
export function manifestReferences(text) {
  const refs = [];
  for (const line of text.split("\n")) {
    const match = /^\s*(?:-\s+)?(?:url|path):\s*(['"]?)(.+?)\1\s*$/.exec(line);
    if (match) refs.push(match[2]);
  }
  return refs;
}

/**
 * Problems with a list of final asset names, as human-readable strings; empty
 * when the launcher can install from them. Checks:
 *  - every `redrob-cowork-*` file is already in launcher shape (rename ran);
 *  - at least one asset is installable by the launcher;
 *  - a Windows zip carries the `-portable` marker.
 */
export function checkAssetNames(names) {
  const problems = [];
  let installable = 0;
  for (const name of names) {
    if (!name.startsWith(PREFIX)) continue;
    let final;
    try {
      final = launcherAssetName(name);
    } catch (error) {
      problems.push(error.message);
      continue;
    }
    if (final !== name) {
      problems.push(`${name} is not in launcher shape (expected ${final})`);
      continue;
    }
    if (parseLauncherAssetName(name)) installable += 1;
  }
  if (installable === 0) {
    problems.push(`no asset the launcher can install among: ${names.join(", ") || "(none)"}`);
  }
  return problems;
}

function listFiles(dir) {
  return readdirSync(dir).filter((entry) => statSync(join(dir, entry)).isFile());
}

/** Rename the assets in `dir` and rewrite its updater manifests. Returns the rename map. */
export function renameDist(dir) {
  const renames = new Map();
  for (const name of listFiles(dir)) {
    const target = launcherAssetName(name);
    if (!target || target === name) continue;
    if (existsSync(join(dir, target))) throw new Error(`Cannot rename ${name}: ${target} already exists`);
    renameSync(join(dir, name), join(dir, target));
    renames.set(name, target);
  }
  const present = new Set(listFiles(dir));
  for (const name of listFiles(dir).filter(isUpdaterManifest)) {
    const path = join(dir, name);
    const rewritten = rewriteManifest(readFileSync(path, "utf8"), renames);
    for (const ref of manifestReferences(rewritten)) {
      if (!present.has(ref)) throw new Error(`${name} references ${ref}, which is not in ${dir}`);
    }
    writeFileSync(path, rewritten, "utf8");
  }
  return renames;
}

export function checkDist(dir) {
  return checkAssetNames(listFiles(dir));
}

function main(argv) {
  const [command, dirArg] = argv;
  if (!["rename", "check"].includes(command) || !dirArg) {
    console.error("Usage: node scripts/release/launcher-asset-names.mjs <rename|check> <dist-dir>");
    return 2;
  }
  const dir = resolve(dirArg);
  if (!existsSync(dir)) {
    console.error(`No such directory: ${dir}`);
    return 1;
  }
  if (command === "rename") {
    const renames = renameDist(dir);
    for (const [from, to] of renames) console.log(`${from} -> ${to}`);
    if (renames.size === 0) console.log("No assets needed renaming.");
  }
  const problems = checkDist(dir);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    return 1;
  }
  const installable = listFiles(dir).filter((name) => parseLauncherAssetName(name));
  console.log(`Launcher-installable assets in ${basename(dir)}: ${installable.join(", ")}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
