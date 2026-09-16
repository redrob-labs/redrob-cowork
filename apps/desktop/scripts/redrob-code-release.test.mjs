import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  downloadRedrobCodeArchive,
  normalizeGithubRepo,
  normalizeReleaseVersion,
  packagedSidecarNames,
  parseSha256Sums,
  redrobCodeArchiveName,
  redrobCodeBinaryName,
  REDROB_CODE_REPO,
  releaseDownloadUrl,
  releaseSha256SumsUrl,
  sidecarFileNames,
} from "./redrob-code-release.mjs";

const ASSET = "redrob-linux-x64-baseline.zip";
const BYTES = new Uint8Array([1, 2, 3]);
/** sha256 of BYTES, so the happy path verifies against a real digest. */
const DIGEST = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
/** A manifest shaped like a real release's: many assets, one line each. */
const SUMS = [`${"b".repeat(64)}  redrob-darwin-arm64.zip`, `${DIGEST}  ${ASSET}`, `${"d".repeat(64)}  SHA256SUMS.txt`].join(
  "\n",
);

describe("Redrob Code archive naming", () => {
  it("maps every desktop target triple to a published archive", () => {
    assert.equal(redrobCodeArchiveName("aarch64-apple-darwin"), "redrob-darwin-arm64.zip");
    assert.equal(redrobCodeArchiveName("x86_64-apple-darwin"), "redrob-darwin-x64-baseline.zip");
    // Every platform ships a .zip: the engine's release workflow publishes no
    // tarballs, so the .tar.gz names this used to expect could never resolve.
    assert.equal(redrobCodeArchiveName("x86_64-unknown-linux-gnu"), "redrob-linux-x64-baseline.zip");
    assert.equal(redrobCodeArchiveName("aarch64-unknown-linux-gnu"), "redrob-linux-arm64.zip");
    assert.equal(redrobCodeArchiveName("x86_64-pc-windows-msvc"), "redrob-windows-x64-baseline.zip");
    assert.equal(redrobCodeArchiveName("aarch64-pc-windows-msvc"), "redrob-windows-arm64.zip");
  });

  it("returns null for an unsupported target instead of guessing a name", () => {
    assert.equal(redrobCodeArchiveName("riscv64-unknown-linux-gnu"), null);
  });

  it("names the extracted binary redrob, with .exe only on Windows targets", () => {
    assert.equal(redrobCodeBinaryName({ targetTriple: "x86_64-unknown-linux-gnu" }), "redrob");
    assert.equal(redrobCodeBinaryName({ targetTriple: "x86_64-pc-windows-msvc" }), "redrob.exe");
    assert.equal(redrobCodeBinaryName({ isWindows: true }), "redrob.exe");
  });

  it("derives packaged sidecar names that begin with redrob", () => {
    assert.deepEqual(packagedSidecarNames({ targetTriple: "aarch64-apple-darwin" }), {
      alias: "redrob",
      target: "redrob-aarch64-apple-darwin",
    });
    assert.deepEqual(packagedSidecarNames({ targetTriple: "x86_64-pc-windows-msvc" }), {
      alias: "redrob.bin",
      target: "redrob-x86_64-pc-windows-msvc.bin",
    });
    assert.deepEqual(packagedSidecarNames({}), { alias: "redrob", target: null });
  });

  /**
   * The bug this pins: the Windows engine is written as `.bin` so the already
   * signed PE is not re-signed, and a resolver that only looked for `.exe`
   * reported a bundled engine as missing. The written name must be a name the
   * app looks under, on every target.
   */
  it("looks for every name the pack writes, so a packaged engine is findable", () => {
    for (const targetTriple of [
      "x86_64-pc-windows-msvc",
      "aarch64-pc-windows-msvc",
      "x86_64-apple-darwin",
      "x86_64-unknown-linux-gnu",
    ]) {
      const platform = targetTriple.includes("windows") ? "win32" : "linux";
      const written = packagedSidecarNames({ targetTriple });
      const looked = sidecarFileNames("redrob", { platform, targetTriple });
      assert.ok(
        looked.includes(written.alias),
        `${targetTriple}: the packaged alias ${written.alias} is never looked for`,
      );
      assert.ok(
        looked.includes(written.target),
        `${targetTriple}: the packaged artifact ${written.target} is never looked for`,
      );
    }
  });

  it("prefers an installed .exe over the packaged .bin resource on Windows", () => {
    assert.deepEqual(sidecarFileNames("redrob", { platform: "win32", targetTriple: "x86_64-pc-windows-msvc" }), [
      "redrob-x86_64-pc-windows-msvc.exe",
      "redrob.exe",
      "redrob-x86_64-pc-windows-msvc.bin",
      "redrob.bin",
    ]);
    assert.deepEqual(sidecarFileNames("redrob", { platform: "linux", targetTriple: null }), ["redrob"]);
  });

  it("defaults to the redrob-code repository and rejects malformed overrides", () => {
    assert.equal(normalizeGithubRepo("https://github.com/redrob-labs/redrob-code.git"), REDROB_CODE_REPO);
    assert.equal(normalizeGithubRepo("acme/fork"), "acme/fork");
    assert.equal(normalizeGithubRepo("not a repo"), REDROB_CODE_REPO);
    assert.equal(normalizeGithubRepo(undefined), REDROB_CODE_REPO);
  });

  it("normalizes the pinned version and refuses floating pins", () => {
    assert.equal(normalizeReleaseVersion("v0.0.1"), "0.0.1");
    assert.equal(normalizeReleaseVersion("0.0.1"), "0.0.1");
    assert.equal(normalizeReleaseVersion("latest"), null);
    assert.equal(normalizeReleaseVersion(""), null);
  });
});

describe("public release download URLs", () => {
  it("addresses a pinned tag, and the floating alias only for `latest`", () => {
    // GitHub spells the two forms differently, and the alias resolves only for an
    // exact asset name -- which is why the engine publishes version-less names.
    assert.equal(
      releaseDownloadUrl(REDROB_CODE_REPO, "v1.18.31-redrob.2", "redrob-linux-x64-baseline.zip"),
      "https://github.com/redrob-labs/redrob-code/releases/download/v1.18.31-redrob.2/redrob-linux-x64-baseline.zip",
    );
    assert.equal(
      releaseDownloadUrl(REDROB_CODE_REPO, "1.18.31-redrob.2", "redrob-linux-x64-baseline.zip"),
      "https://github.com/redrob-labs/redrob-code/releases/download/v1.18.31-redrob.2/redrob-linux-x64-baseline.zip",
    );
    assert.equal(
      releaseDownloadUrl(REDROB_CODE_REPO, "latest", "redrob-linux-x64-baseline.zip"),
      "https://github.com/redrob-labs/redrob-code/releases/latest/download/redrob-linux-x64-baseline.zip",
    );
  });

  it("reads the digest manifest from the same release as the asset", () => {
    assert.equal(
      releaseSha256SumsUrl(REDROB_CODE_REPO, "v1.18.31-redrob.2"),
      "https://github.com/redrob-labs/redrob-code/releases/download/v1.18.31-redrob.2/SHA256SUMS",
    );
  });

  it("carries no Authorization header, because the repository is public", async () => {
    const calls = [];
    await downloadRedrobCodeArchive({
      version: "v0.0.1",
      archiveName: ASSET,
      destPath: "/tmp/redrob-code.zip",
      fetchImpl: (url, init) => {
        calls.push({ url, init });
        if (url.endsWith("/SHA256SUMS")) {
          return Promise.resolve({ ok: true, status: 200, text: async () => SUMS });
        }
        return Promise.resolve({ ok: true, status: 200, arrayBuffer: async () => BYTES.buffer });
      },
      writeArchive: async () => {},
    });
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.init?.headers, undefined);
    }
  });
});

describe("release asset digest verification", () => {
  it("selects the asset's own line out of a manifest covering the whole release", () => {
    // Unlike a per-asset sidecar, SHA256SUMS lists every asset, so the right line
    // has to be chosen rather than assumed to be the only one.
    assert.equal(parseSha256Sums(SUMS, ASSET), DIGEST);
    assert.equal(parseSha256Sums(SUMS, "redrob-darwin-arm64.zip"), `${"b".repeat(64)}`);
  });

  it("refuses a manifest that does not list the asset instead of skipping the check", () => {
    assert.throws(() => parseSha256Sums(SUMS, "redrob-linux-arm64.zip"), /does not list redrob-linux-arm64\.zip/);
    assert.throws(() => parseSha256Sums("", ASSET), /manifest is empty/);
    assert.throws(() => parseSha256Sums("not a digest line", ASSET), /not in sha256sum format/);
  });

  it("writes the archive only after the digest matches", async () => {
    const written = [];
    const result = await downloadRedrobCodeArchive({
      version: "v0.0.1",
      archiveName: ASSET,
      destPath: "/tmp/redrob-code.zip",
      fetchImpl: (url) =>
        url.endsWith("/SHA256SUMS")
          ? Promise.resolve({ ok: true, status: 200, text: async () => SUMS })
          : Promise.resolve({ ok: true, status: 200, arrayBuffer: async () => BYTES.buffer }),
      writeArchive: async (path, bytes) => {
        written.push({ path, bytes: Array.from(bytes) });
      },
    });
    assert.deepEqual(written, [{ path: "/tmp/redrob-code.zip", bytes: [1, 2, 3] }]);
    assert.equal(result.sha256, DIGEST);
    assert.equal(result.version, "0.0.1");
    assert.equal(
      result.assetUrl,
      `https://github.com/redrob-labs/redrob-code/releases/download/v0.0.1/${ASSET}`,
    );
  });

  it("leaves nothing on disk when the digest disagrees", async () => {
    await assert.rejects(
      () => downloadRedrobCodeArchive({
        version: "v0.0.1",
        archiveName: ASSET,
        destPath: "/tmp/unused.zip",
        fetchImpl: (url) =>
          url.endsWith("/SHA256SUMS")
            ? Promise.resolve({ ok: true, status: 200, text: async () => `${"c".repeat(64)}  ${ASSET}` })
            : Promise.resolve({ ok: true, status: 200, arrayBuffer: async () => BYTES.buffer }),
        writeArchive: async () => {
          throw new Error("must not write an archive that failed verification");
        },
      }),
      /failed sha256 verification/,
    );
  });

  it("refuses a floating pin, so a build cannot become unreproducible by accident", async () => {
    let reached = false;
    await assert.rejects(
      () => downloadRedrobCodeArchive({
        version: "latest",
        archiveName: ASSET,
        destPath: "/tmp/unused.zip",
        fetchImpl: () => {
          reached = true;
          throw new Error("must not reach the network for an unpinned version");
        },
        writeArchive: async () => {},
      }),
      /A pinned Redrob Code version is required/,
    );
    assert.equal(reached, false);
  });

  it("surfaces a missing manifest and a missing asset as distinct failures", async () => {
    await assert.rejects(
      () => downloadRedrobCodeArchive({
        version: "v0.0.1",
        archiveName: ASSET,
        destPath: "/tmp/unused.zip",
        fetchImpl: () => Promise.resolve({ ok: false, status: 404 }),
        writeArchive: async () => {},
      }),
      /SHA256SUMS manifest for Redrob Code v0\.0\.1 could not be read .*HTTP 404/,
    );
    await assert.rejects(
      () => downloadRedrobCodeArchive({
        version: "v0.0.1",
        archiveName: ASSET,
        destPath: "/tmp/unused.zip",
        fetchImpl: (url) =>
          url.endsWith("/SHA256SUMS")
            ? Promise.resolve({ ok: true, status: 200, text: async () => SUMS })
            : Promise.resolve({ ok: false, status: 404 }),
        writeArchive: async () => {},
      }),
      /Failed to download redrob-linux-x64-baseline\.zip .*HTTP 404/,
    );
  });
});
