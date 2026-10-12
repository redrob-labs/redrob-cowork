// The raw sample runs (outputs/) and their grades (grades/) are not in git: about 1,100 JSON files and
// 10 MB that every rerun replaces. They live in a GitHub release asset that data.json pins by SHA-256.
// run.mjs, grade.mjs and build.mjs call ensureData() first, so outputs/ and grades/ always hold the
// pinned set (or a newer local run of it), never nothing. That matters for run.mjs: its spend cap
// counts the outputs already written, and an empty folder would read as $0 spent.
//
//   node scripts/model-guide/samples/data.mjs                    # fetch and check the pinned set
//   node scripts/model-guide/samples/data.mjs --pack --tag <tag> # tar outputs/ + grades/, pin it
//
// After --pack, upload the tarball to the release named in data.json and commit data.json
// (the samples workflow does both).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PIN_FILE = path.join(here, "data.json");
// Which pin outputs/ and grades/ were last filled from or packed into.
const STAMP_FILE = path.join(here, ".data-sha256");

/** @typedef {{ repo: string; tag: string; asset: string; sha256: string; outputs: number; grades: number }} DataPin */

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** @returns {Promise<DataPin>} */
async function readPin() {
  return JSON.parse(await readFile(PIN_FILE, "utf8"));
}

const assetUrl = (pin) => `https://github.com/${pin.repo}/releases/download/${pin.tag}/${pin.asset}`;

/** Fills outputs/ and grades/ from the pinned release asset, unless they already came from it. */
export async function ensureData() {
  const pin = await readPin();
  if (existsSync(STAMP_FILE) && (await readFile(STAMP_FILE, "utf8")).trim() === pin.sha256) return pin;

  const response = await fetch(assetUrl(pin));
  if (!response.ok) throw new Error(`GET ${assetUrl(pin)}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== pin.sha256) throw new Error(`${pin.asset} hashes to ${actual}; data.json pins ${pin.sha256}`);

  const tarball = path.join(here, pin.asset);
  await writeFile(tarball, bytes);
  for (const dir of ["outputs", "grades"]) await rm(path.join(here, dir), { recursive: true, force: true });
  execFileSync("tar", ["-xzf", tarball, "-C", here]);
  await rm(tarball);
  await writeFile(STAMP_FILE, `${pin.sha256}\n`);
  return pin;
}

const countJson = (dir) =>
  execFileSync("find", [path.join(here, dir), "-name", "*.json", "-not", "-path", "*/_failed/*"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean).length;

/** Packs outputs/ and grades/ into `<tag>.tar.gz` beside this file and pins it in data.json. */
export async function packData({ tag }) {
  const asset = `${tag}.tar.gz`;
  const tarball = path.join(here, asset);
  // COPYFILE_DISABLE keeps macOS's ._ resource files out of the archive.
  execFileSync("tar", ["-czf", tarball, "-C", here, "outputs", "grades"], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  const pin = { ...(await readPin()), tag, asset, sha256: sha256(await readFile(tarball)), outputs: countJson("outputs"), grades: countJson("grades") };
  await writeFile(PIN_FILE, `${JSON.stringify(pin, null, 2)}\n`);
  await writeFile(STAMP_FILE, `${pin.sha256}\n`);
  return { pin, tarball };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tagIndex = process.argv.indexOf("--tag");
  if (process.argv.includes("--pack")) {
    if (tagIndex < 0) throw new Error("--pack needs --tag <release tag>, e.g. --tag model-guide-samples-2026-11-02");
    const { pin, tarball } = await packData({ tag: process.argv[tagIndex + 1] });
    console.log(JSON.stringify({ ...pin, tarball }));
  } else {
    console.log(JSON.stringify(await ensureData()));
  }
}
