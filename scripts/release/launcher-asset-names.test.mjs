import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  LAUNCHER_MANIFEST_CONTENT,
  LAUNCHER_MANIFEST_NAME,
  checkAssetNames,
  checkDist,
  checkLauncherManifestContent,
  launcherAssetName,
  parseLauncherAssetName,
  renameDist,
  rewriteManifest,
  writeLauncherManifest,
} from "./launcher-asset-names.mjs";

/** What electron-builder writes with artifactName redrob-cowork-${version}-${os}-${arch}.${ext}. */
const BUILDER_OUTPUT = {
  "redrob-cowork-0.3.1-mac-arm64.dmg": "redrob-cowork-0.3.1-macos-aarch64.dmg",
  "redrob-cowork-0.3.1-mac-arm64.dmg.blockmap": "redrob-cowork-0.3.1-macos-aarch64.dmg.blockmap",
  "redrob-cowork-0.3.1-mac-arm64.zip": "redrob-cowork-0.3.1-macos-aarch64.zip",
  "redrob-cowork-0.3.1-mac-arm64.zip.blockmap": "redrob-cowork-0.3.1-macos-aarch64.zip.blockmap",
  "redrob-cowork-0.3.1-mac-x64.dmg": "redrob-cowork-0.3.1-macos-x86_64.dmg",
  "redrob-cowork-0.3.1-mac-x64.zip": "redrob-cowork-0.3.1-macos-x86_64.zip",
  // electron-builder already writes x86_64 for an AppImage, and x64 for the tarball beside it.
  "redrob-cowork-0.3.1-linux-x86_64.AppImage": "redrob-cowork-0.3.1-linux-x86_64.AppImage",
  "redrob-cowork-0.3.1-linux-x64.tar.gz": "redrob-cowork-0.3.1-linux-x86_64.tar.gz",
  "redrob-cowork-0.3.1-linux-arm64.AppImage": "redrob-cowork-0.3.1-linux-aarch64.AppImage",
  "redrob-cowork-0.3.1-linux-arm64.tar.gz": "redrob-cowork-0.3.1-linux-aarch64.tar.gz",
  "redrob-cowork-0.3.1-win-x64.exe": "redrob-cowork-0.3.1-windows-x64.exe",
  "redrob-cowork-0.3.1-win-x64.exe.blockmap": "redrob-cowork-0.3.1-windows-x64.exe.blockmap",
  "redrob-cowork-0.3.1-win-x64.zip": "redrob-cowork-0.3.1-windows-x64-portable.zip",
  "redrob-cowork-0.3.1-win-arm64.exe": "redrob-cowork-0.3.1-windows-arm64.exe",
  "redrob-cowork-0.3.1-win-arm64.zip": "redrob-cowork-0.3.1-windows-arm64-portable.zip",
};

test("maps every packager output to the launcher's <stem>-<version>-<os>-<arch>[-portable].<ext>", () => {
  for (const [from, to] of Object.entries(BUILDER_OUTPUT)) {
    assert.equal(launcherAssetName(from), to, from);
  }
});

test("is idempotent on names already in launcher shape", () => {
  for (const name of Object.values(BUILDER_OUTPUT)) {
    assert.equal(launcherAssetName(name), name);
  }
});

test("keeps a prerelease version with dashes intact", () => {
  assert.equal(
    launcherAssetName("redrob-cowork-0.4.0-rc.1-mac-arm64.dmg"),
    "redrob-cowork-0.4.0-rc.1-macos-aarch64.dmg",
  );
  assert.equal(
    launcherAssetName("redrob-cowork-0.18.14-alpha.12-win-x64.zip"),
    "redrob-cowork-0.18.14-alpha.12-windows-x64-portable.zip",
  );
});

test("ignores files that are not this app's assets and refuses ones it cannot interpret", () => {
  assert.equal(launcherAssetName("latest-mac.yml"), null);
  assert.equal(launcherAssetName("builder-debug.yml"), null);
  assert.equal(launcherAssetName("redrob-linux-x64-0.3.0.tar.gz"), null); // the pre-launcher stem
  assert.throws(() => launcherAssetName("redrob-cowork-0.3.1-mac-arm64.pkg"), /extension/);
  assert.throws(() => launcherAssetName("redrob-cowork-0.3.1-plan9-arm64.dmg"), /os token/);
  assert.throws(() => launcherAssetName("redrob-cowork-0.3.1-linux-mips.tar.gz"), /arch token/);
  assert.throws(() => launcherAssetName("redrob-cowork-v0.3.1-linux-x64.tar.gz"), /digit/);
});

test("the launcher's parser accepts every installable final name and nothing else", () => {
  const installable = {
    "redrob-cowork-0.3.1-macos-aarch64.dmg": "macos-aarch64",
    "redrob-cowork-0.3.1-macos-x86_64.dmg": "macos-x86_64",
    "redrob-cowork-0.3.1-linux-x86_64.AppImage": "linux-x86_64",
    "redrob-cowork-0.3.1-linux-x86_64.tar.gz": "linux-x86_64",
    "redrob-cowork-0.3.1-linux-aarch64.AppImage": "linux-aarch64",
    "redrob-cowork-0.3.1-linux-aarch64.tar.gz": "linux-aarch64",
    "redrob-cowork-0.3.1-windows-x64-portable.zip": "windows-x64",
    "redrob-cowork-0.3.1-windows-arm64-portable.zip": "windows-arm64",
  };
  for (const [name, token] of Object.entries(installable)) {
    const parsed = parseLauncherAssetName(name);
    assert.ok(parsed, name);
    assert.equal(parsed.token, token);
    assert.equal(parsed.version, "0.3.1");
  }
  // Not installable by the launcher, and must not pretend to be.
  for (const name of [
    "redrob-cowork-0.3.1-windows-x64.exe",
    "redrob-cowork-0.3.1-macos-aarch64.zip",
    "redrob-cowork-0.3.1-macos-aarch64.dmg.blockmap",
    "redrob-cowork-0.3.1-mac-arm64.dmg",
    "redrob-cowork-0.3.1-linux-x64.tar.gz",
    "redrob-cowork-0.3.1-linux-arm64.AppImage",
    "redrob-cowork-0.3.1-windows-x64.zip",
    "redrob-cowork-windows-x64-portable.zip",
    "redrob-mac-arm64-0.3.0.dmg",
  ]) {
    assert.equal(parseLauncherAssetName(name), null, name);
  }
});

test("checkAssetNames passes a renamed dist and fails an unrenamed or empty one", () => {
  assert.deepEqual(checkAssetNames([...Object.values(BUILDER_OUTPUT), "latest-mac.yml", "latest.yml"]), []);

  const unrenamed = checkAssetNames(["redrob-cowork-0.3.1-mac-arm64.dmg", "latest-mac.yml"]);
  assert.equal(unrenamed.length, 2);
  assert.match(unrenamed[0], /not in launcher shape/);
  assert.match(unrenamed[1], /no asset the launcher can install/);

  const zipWithoutMarker = checkAssetNames(["redrob-cowork-0.3.1-windows-x64.zip"]);
  assert.match(zipWithoutMarker[0], /expected redrob-cowork-0.3.1-windows-x64-portable.zip/);

  const exeOnly = checkAssetNames(["redrob-cowork-0.3.1-windows-x64.exe", "latest.yml"]);
  assert.match(exeOnly[0], /no asset the launcher can install/);
});

const MAC_MANIFEST = `version: 0.3.1
files:
  - url: redrob-cowork-0.3.1-mac-arm64.zip
    sha512: abc
    size: 1
  - url: redrob-cowork-0.3.1-mac-arm64.dmg
    sha512: def
    size: 2
path: redrob-cowork-0.3.1-mac-arm64.zip
sha512: abc
releaseDate: '2026-10-13T00:00:00.000Z'
`;

test("rewriteManifest renames only url and path values", () => {
  const renames = new Map([
    ["redrob-cowork-0.3.1-mac-arm64.zip", "redrob-cowork-0.3.1-macos-aarch64.zip"],
    ["redrob-cowork-0.3.1-mac-arm64.dmg", "redrob-cowork-0.3.1-macos-aarch64.dmg"],
  ]);
  const rewritten = rewriteManifest(MAC_MANIFEST, renames);
  assert.equal(
    rewritten,
    `version: 0.3.1
files:
  - url: redrob-cowork-0.3.1-macos-aarch64.zip
    sha512: abc
    size: 1
  - url: redrob-cowork-0.3.1-macos-aarch64.dmg
    sha512: def
    size: 2
path: redrob-cowork-0.3.1-macos-aarch64.zip
sha512: abc
releaseDate: '2026-10-13T00:00:00.000Z'
`,
  );
});

test("renameDist renames the files on disk and keeps the updater manifest pointing at them", () => {
  const dir = mkdtempSync(join(tmpdir(), "launcher-asset-names-"));
  for (const name of [
    "redrob-cowork-0.3.1-mac-arm64.zip",
    "redrob-cowork-0.3.1-mac-arm64.zip.blockmap",
    "redrob-cowork-0.3.1-mac-arm64.dmg",
    "redrob-cowork-0.3.1-mac-arm64.dmg.blockmap",
    "builder-debug.yml",
  ]) {
    writeFileSync(join(dir, name), name);
  }
  writeFileSync(join(dir, "latest-mac.yml"), MAC_MANIFEST);

  const renames = renameDist(dir);
  assert.equal(renames.size, 4);
  assert.deepEqual(readdirSync(dir).sort(), [
    "builder-debug.yml",
    "latest-mac.yml",
    "redrob-cowork-0.3.1-macos-aarch64.dmg",
    "redrob-cowork-0.3.1-macos-aarch64.dmg.blockmap",
    "redrob-cowork-0.3.1-macos-aarch64.zip",
    "redrob-cowork-0.3.1-macos-aarch64.zip.blockmap",
  ]);
  // The bytes moved with the name.
  assert.equal(readFileSync(join(dir, "redrob-cowork-0.3.1-macos-aarch64.dmg"), "utf8"), "redrob-cowork-0.3.1-mac-arm64.dmg");
  const manifest = readFileSync(join(dir, "latest-mac.yml"), "utf8");
  assert.ok(!manifest.includes("mac-arm64"), manifest);
  assert.ok(manifest.includes("path: redrob-cowork-0.3.1-macos-aarch64.zip"));
  assert.ok(manifest.includes("- url: redrob-cowork-0.3.1-macos-aarch64.dmg"));

  // A second run is a no-op.
  assert.equal(renameDist(dir).size, 0);
});

test("renameDist refuses a manifest that points at a file the dist does not hold", () => {
  const dir = mkdtempSync(join(tmpdir(), "launcher-asset-names-"));
  writeFileSync(join(dir, "redrob-cowork-0.3.1-mac-arm64.dmg"), "x");
  writeFileSync(join(dir, "latest-mac.yml"), MAC_MANIFEST);
  assert.throws(() => renameDist(dir), /references redrob-cowork-0.3.1-mac-arm64.zip, which is not in/);
});

// --- redrob-launcher.json -------------------------------------------------

/** A dist in launcher shape, without the manifest. */
function distWithoutManifest() {
  const dir = mkdtempSync(join(tmpdir(), "launcher-asset-names-"));
  for (const name of Object.values(BUILDER_OUTPUT)) writeFileSync(join(dir, name), name);
  writeFileSync(join(dir, "latest.yml"), "version: 0.3.1\n");
  return dir;
}

test("the launcher manifest is exactly the schema-1 contract, newline-terminated", () => {
  assert.equal(LAUNCHER_MANIFEST_NAME, "redrob-launcher.json");
  assert.equal(LAUNCHER_MANIFEST_CONTENT, '{ "schema": 1, "sharedAccount": true }\n');
  assert.deepEqual(JSON.parse(LAUNCHER_MANIFEST_CONTENT), { schema: 1, sharedAccount: true });
  assert.deepEqual(checkLauncherManifestContent(LAUNCHER_MANIFEST_CONTENT), []);
});

test("checkLauncherManifestContent refuses anything the launcher would not read as shared-account", () => {
  assert.match(checkLauncherManifestContent("{")[0], /not valid JSON/);
  assert.match(checkLauncherManifestContent("[]\n")[0], /must be a JSON object/);
  assert.match(checkLauncherManifestContent('{ "schema": 2, "sharedAccount": true }\n')[0], /schema must be 1, got 2/);
  assert.match(checkLauncherManifestContent('{ "schema": 1, "sharedAccount": false }\n')[0], /sharedAccount must be true, got false/);
  assert.match(checkLauncherManifestContent('{ "schema": 1 }\n')[0], /sharedAccount must be true, got undefined/);
  assert.match(checkLauncherManifestContent('{ "schema": 1, "sharedAccount": true }')[0], /end with a newline/);
});

test("checkDist fails a dist without redrob-launcher.json and passes once it is written", () => {
  const dir = distWithoutManifest();
  const problems = checkDist(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /redrob-launcher.json is missing from/);

  const path = writeLauncherManifest(dir);
  assert.equal(path, join(dir, "redrob-launcher.json"));
  assert.equal(readFileSync(path, "utf8"), LAUNCHER_MANIFEST_CONTENT);
  assert.deepEqual(checkDist(dir), []);

  // The manifest is not one of the app's installers, so the name checks leave it alone.
  assert.equal(launcherAssetName("redrob-launcher.json"), null);
  assert.equal(parseLauncherAssetName("redrob-launcher.json"), null);

  // A corrupted file is caught, and rewriting repairs it.
  writeFileSync(path, '{ "schema": 1, "sharedAccount": false }\n');
  assert.match(checkDist(dir)[0], /sharedAccount must be true/);
  writeLauncherManifest(dir);
  assert.deepEqual(checkDist(dir), []);
});

test("rehearsal: `rename` writes the manifest and `check` refuses a dist that lost it", () => {
  const script = fileURLToPath(new URL("./launcher-asset-names.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "launcher-asset-names-"));
  for (const name of Object.keys(BUILDER_OUTPUT)) writeFileSync(join(dir, name), name);
  writeFileSync(join(dir, "latest-mac.yml"), MAC_MANIFEST);

  const rename = spawnSync(process.execPath, [script, "rename", dir], { encoding: "utf8" });
  assert.equal(rename.status, 0, rename.stderr);
  assert.match(rename.stdout, /wrote redrob-launcher.json/);
  assert.match(rename.stdout, /Launcher manifest in .*: redrob-launcher.json \(\{ "schema": 1, "sharedAccount": true \}\)/);
  assert.ok(readdirSync(dir).includes("redrob-launcher.json"));
  assert.equal(readFileSync(join(dir, "redrob-launcher.json"), "utf8"), LAUNCHER_MANIFEST_CONTENT);

  const check = spawnSync(process.execPath, [script, "check", dir], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);

  rmSync(join(dir, "redrob-launcher.json"));
  const failing = spawnSync(process.execPath, [script, "check", dir], { encoding: "utf8" });
  assert.equal(failing.status, 1);
  assert.match(failing.stderr, /::error::redrob-launcher.json is missing from/);

  const manifest = spawnSync(process.execPath, [script, "manifest", dir], { encoding: "utf8" });
  assert.equal(manifest.status, 0, manifest.stderr);
  assert.ok(readdirSync(dir).includes("redrob-launcher.json"));
});

test("the release workflow writes the manifest before every asset upload, under the upload glob", () => {
  const workflow = readFileSync(
    fileURLToPath(new URL("../../.github/workflows/release-macos-aarch64.yml", import.meta.url)),
    "utf8",
  );
  const manifestStep = workflow.indexOf("launcher-asset-names.mjs manifest apps/desktop/dist-electron");
  const upload = workflow.indexOf("- name: Upload Electron release assets");
  assert.ok(manifestStep > 0, "no manifest step in the release workflow");
  assert.ok(upload > manifestStep, "the manifest must be written before the upload step");
  // Every platform job uploads `redrob-*` from dist-electron, which is how the manifest travels.
  assert.ok(workflow.includes("assets=(apps/desktop/dist-electron/${{ matrix.asset_prefix }}-*)"));
  assert.ok(/asset_prefix: redrob\n/.test(workflow));
  assert.ok(LAUNCHER_MANIFEST_NAME.startsWith("redrob-"));
});

test("sharedAccount: true is backed by an engine pin at or past v0.5.1", () => {
  // The shared account file is read by the bundled Redrob Code engine from v0.5.1; a pin below that
  // would make the manifest promise a sign-in the installed app cannot use.
  const constants = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../constants.json", import.meta.url)), "utf8"),
  );
  const parsed = /^v(\d+)\.(\d+)\.(\d+)$/.exec(constants.redrobCodeVersion);
  assert.ok(parsed, `pin ${constants.redrobCodeVersion} is not a plain release tag`);
  const [major, minor, patch] = parsed.slice(1).map(Number);
  const floor = [0, 5, 1];
  const atOrAbove =
    major > floor[0] || (major === floor[0] && (minor > floor[1] || (minor === floor[1] && patch >= floor[2])));
  assert.ok(atOrAbove, `engine pin ${constants.redrobCodeVersion} is below v0.5.1; sharedAccount cannot be true`);
});
