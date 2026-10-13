import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  checkAssetNames,
  launcherAssetName,
  parseLauncherAssetName,
  renameDist,
  rewriteManifest,
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
