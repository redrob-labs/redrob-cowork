import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  downloadRedrobCodeArchive,
  GITHUB_TOKEN_ENV_NAMES,
  missingGithubTokenMessage,
  normalizeGithubRepo,
  normalizeReleaseVersion,
  packagedSidecarNames,
  redrobCodeArchiveName,
  redrobCodeBinaryName,
  REDROB_CODE_REPO,
  releaseAssetApiUrl,
  releaseTagApiUrl,
  selectGithubToken,
  selectReleaseAssetId,
} from "./redrob-code-release.mjs";

const RELEASE = {
  tag_name: "v0.0.1",
  assets: [
    { id: 11, name: "redrob-darwin-arm64.zip" },
    { id: 22, name: "redrob-linux-x64-baseline.tar.gz" },
  ],
};

describe("Redrob Code archive naming", () => {
  it("maps every desktop target triple to a published archive", () => {
    assert.equal(redrobCodeArchiveName("aarch64-apple-darwin"), "redrob-darwin-arm64.zip");
    assert.equal(redrobCodeArchiveName("x86_64-apple-darwin"), "redrob-darwin-x64-baseline.zip");
    assert.equal(redrobCodeArchiveName("x86_64-unknown-linux-gnu"), "redrob-linux-x64-baseline.tar.gz");
    assert.equal(redrobCodeArchiveName("aarch64-unknown-linux-gnu"), "redrob-linux-arm64.tar.gz");
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
      alias: "redrob.exe",
      target: "redrob-x86_64-pc-windows-msvc.exe",
    });
    assert.deepEqual(packagedSidecarNames({}), { alias: "redrob", target: null });
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

describe("private release token selection", () => {
  it("prefers REDROB_GITHUB_TOKEN, then GH_TOKEN, then GITHUB_TOKEN", () => {
    assert.deepEqual(GITHUB_TOKEN_ENV_NAMES, ["REDROB_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"]);
    assert.deepEqual(
      selectGithubToken({ REDROB_GITHUB_TOKEN: "a", GH_TOKEN: "b", GITHUB_TOKEN: "c" }),
      { token: "a", source: "REDROB_GITHUB_TOKEN" },
    );
    assert.deepEqual(selectGithubToken({ GH_TOKEN: "b", GITHUB_TOKEN: "c" }), {
      token: "b",
      source: "GH_TOKEN",
    });
    assert.deepEqual(selectGithubToken({ GITHUB_TOKEN: "c" }), { token: "c", source: "GITHUB_TOKEN" });
  });

  it("ignores blank tokens and reports none configured", () => {
    assert.equal(selectGithubToken({ REDROB_GITHUB_TOKEN: "   ", GH_TOKEN: "" }), null);
    assert.equal(selectGithubToken({}), null);
  });
});

describe("private release asset resolution", () => {
  it("addresses the release by tag and the asset by id", () => {
    assert.equal(
      releaseTagApiUrl(REDROB_CODE_REPO, "0.0.1"),
      "https://api.github.com/repos/redrob-labs/redrob-code/releases/tags/v0.0.1",
    );
    assert.equal(
      releaseAssetApiUrl(REDROB_CODE_REPO, 22),
      "https://api.github.com/repos/redrob-labs/redrob-code/releases/assets/22",
    );
    assert.equal(selectReleaseAssetId(RELEASE, "redrob-linux-x64-baseline.tar.gz"), 22);
    assert.equal(selectReleaseAssetId(RELEASE, "redrob-linux-arm64.tar.gz"), null);
    assert.equal(selectReleaseAssetId({}, "redrob-linux-arm64.tar.gz"), null);
  });

  it("fails with an actionable message when no token is available", async () => {
    let attempted = false;
    await assert.rejects(
      () => downloadRedrobCodeArchive({
        version: "v0.0.1",
        archiveName: "redrob-linux-x64-baseline.tar.gz",
        destPath: "/tmp/unused.tar.gz",
        env: {},
        fetchImpl: () => {
          attempted = true;
          throw new Error("must not reach the network without a token");
        },
        writeArchive: async () => {},
      }),
      (error) => {
        assert.equal(error.message, missingGithubTokenMessage());
        assert.match(error.message, /private repository/);
        assert.match(error.message, /REDROB_GITHUB_TOKEN, GH_TOKEN, GITHUB_TOKEN/);
        assert.match(error.message, /REDROB_CODE_BIN/);
        return true;
      },
    );
    assert.equal(attempted, false);
  });

  it("downloads by asset id with an octet-stream Accept and a bearer token", async () => {
    const calls = [];
    const written = [];
    const result = await downloadRedrobCodeArchive({
      version: "v0.0.1",
      archiveName: "redrob-linux-x64-baseline.tar.gz",
      destPath: "/tmp/redrob-code.tar.gz",
      env: { GH_TOKEN: "token-from-gh" },
      fetchImpl: (url, init) => {
        calls.push({ url, headers: init.headers });
        if (url.endsWith("/releases/tags/v0.0.1")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => RELEASE });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        });
      },
      writeArchive: async (path, bytes) => {
        written.push({ path, bytes: Array.from(bytes) });
      },
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://api.github.com/repos/redrob-labs/redrob-code/releases/tags/v0.0.1");
    assert.equal(calls[0].headers.Accept, "application/vnd.github+json");
    assert.equal(calls[0].headers.Authorization, "Bearer token-from-gh");
    assert.equal(calls[1].url, "https://api.github.com/repos/redrob-labs/redrob-code/releases/assets/22");
    assert.equal(calls[1].headers.Accept, "application/octet-stream");
    assert.equal(calls[1].headers.Authorization, "Bearer token-from-gh");
    assert.deepEqual(written, [{ path: "/tmp/redrob-code.tar.gz", bytes: [1, 2, 3] }]);
    assert.deepEqual(result, {
      assetId: 22,
      assetUrl: "https://api.github.com/repos/redrob-labs/redrob-code/releases/assets/22",
      bytes: 3,
      tokenSource: "GH_TOKEN",
      version: "0.0.1",
    });
  });

  it("reports the missing asset rather than downloading a wrong archive", async () => {
    await assert.rejects(
      () => downloadRedrobCodeArchive({
        version: "0.0.1",
        archiveName: "redrob-linux-arm64.tar.gz",
        destPath: "/tmp/unused.tar.gz",
        env: { REDROB_GITHUB_TOKEN: "token" },
        fetchImpl: () => Promise.resolve({ ok: true, status: 200, json: async () => RELEASE }),
        writeArchive: async () => {
          throw new Error("must not write an archive that was never downloaded");
        },
      }),
      /redrob-linux-arm64\.tar\.gz is not attached to Redrob Code release v0\.0\.1/,
    );
  });

  it("surfaces the private-release 404 with the token source", async () => {
    await assert.rejects(
      () => downloadRedrobCodeArchive({
        version: "0.0.1",
        archiveName: "redrob-linux-x64-baseline.tar.gz",
        destPath: "/tmp/unused.tar.gz",
        env: { GITHUB_TOKEN: "token" },
        fetchImpl: () => Promise.resolve({ ok: false, status: 404 }),
        writeArchive: async () => {},
      }),
      /HTTP 404 using GITHUB_TOKEN/,
    );
  });
});
