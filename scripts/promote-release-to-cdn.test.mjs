import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isReleaseAsset,
  normalizeReleaseVersion,
  requiredReleaseAssets,
  stageReleaseAssets,
} from "./promote-release-to-cdn.mjs";

const VERSION = "0.0.1";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "redrob-work-promote-"));
  const dist = path.join(root, "apps", "desktop", "dist-electron");
  const out = path.join(dist, "cdn");
  await mkdir(dist, { recursive: true });
  const names = new Set(requiredReleaseAssets(VERSION));
  for (const name of [
    `redrob-linux-arm64-${VERSION}.AppImage`,
    `redrob-linux-arm64-${VERSION}.tar.gz`,
    `redrob-mac-arm64-${VERSION}.zip`,
    `redrob-mac-arm64-${VERSION}.zip.blockmap`,
    `redrob-win-arm64-${VERSION}.exe`,
  ]) names.add(name);
  for (const name of names) await writeFile(path.join(dist, name), Buffer.from(`bytes:${name}`));
  return { dist, out };
}

test("normalizes only stable release versions", () => {
  assert.equal(normalizeReleaseVersion("v0.0.1"), VERSION);
  assert.throws(() => normalizeReleaseVersion("0.0.1-alpha.1"), /x\.y\.z/);
});

test("accepts release assets and rejects unrelated files", () => {
  assert.equal(isReleaseAsset("latest-mac.yml", VERSION), true);
  assert.equal(isReleaseAsset(`redrob-mac-arm64-${VERSION}.zip.blockmap`, VERSION), true);
  assert.equal(isReleaseAsset("package.json", VERSION), false);
});

test("stages updater assets, marketing aliases, checksums and version metadata", async () => {
  const { dist, out } = await fixture();
  const result = await stageReleaseAssets({ dist, out, version: VERSION });
  assert.ok(result.assets.includes("latest-mac.yml"));
  for (const relative of [
    `${VERSION}/latest-mac.yml`,
    `latest/latest-mac.yml`,
    `latest/redrob-linux-x64.AppImage`,
    `latest/redrob-work-x64-setup.exe`,
    `latest/redrob-work-mac-arm64.dmg`,
    `latest/version.json`,
  ]) {
    assert.ok((await readFile(path.join(out, relative))).length > 0, `${relative} was not staged`);
    assert.match(await readFile(path.join(out, `${relative}.sha256`), "utf8"), /^[a-f0-9]{64}  /);
  }
  assert.deepEqual(JSON.parse(await readFile(path.join(out, "latest", "version.json"), "utf8")), {
    version: VERSION,
    tag: `v${VERSION}`,
  });
});

test("fails before upload when a required release asset is missing", async () => {
  const { dist, out } = await fixture();
  await writeFile(path.join(dist, "latest.yml"), "");
  const missing = path.join(dist, `redrob-win-x64-${VERSION}.exe`);
  await import("node:fs/promises").then(({ rm }) => rm(missing));
  await assert.rejects(stageReleaseAssets({ dist, out, version: VERSION }), /missing required assets/);
});
