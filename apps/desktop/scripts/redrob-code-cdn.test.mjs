import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  downloadRedrobCodeCdnArchive,
  normalizeCdnBaseUrl,
  parseSha256Sidecar,
  redrobCodeCdnArchiveName,
  redrobCodeCdnArchiveUrl,
  redrobCodeCdnBinaryName,
  redrobCodeCdnSha256Url,
  redrobCodeCdnVersionPrefix,
  REDROB_CODE_CDN_BASE_URL,
  sha256Hex,
} from "./redrob-code-cdn.mjs";

const ARCHIVE = "redrob-code-linux-x64.tar.gz";
const BODY = new TextEncoder().encode("engine-bytes");
const DIGEST = createHash("sha256").update(BODY).digest("hex");

const okResponse = (payload) => ({
  ok: true,
  status: 200,
  text: async () => String(payload),
  arrayBuffer: async () => (payload instanceof Uint8Array ? payload : new TextEncoder().encode(String(payload))).buffer,
});

const failResponse = (status) => ({
  ok: false,
  status,
  text: async () => "",
  arrayBuffer: async () => new ArrayBuffer(0),
});

/** fetch double serving a sidecar and an archive, recording every URL asked for. */
function cdnFetch({ sidecar = `${DIGEST}  ${ARCHIVE}`, archive = BODY, status = {} } = {}) {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.endsWith(".sha256")) {
      return status.sidecar ? failResponse(status.sidecar) : okResponse(sidecar);
    }
    return status.archive ? failResponse(status.archive) : okResponse(archive);
  };
  return { fetchImpl, urls };
}

describe("Code CDN archive naming", () => {
  it("maps the targets the CDN publishes and refuses to guess the ones it does not", () => {
    assert.equal(redrobCodeCdnArchiveName("x86_64-unknown-linux-gnu"), "redrob-code-linux-x64.tar.gz");
    assert.equal(redrobCodeCdnArchiveName("aarch64-unknown-linux-gnu"), "redrob-code-linux-arm64.tar.gz");
    assert.equal(redrobCodeCdnArchiveName("x86_64-apple-darwin"), "redrob-code-darwin-x64.tar.gz");
    assert.equal(redrobCodeCdnArchiveName("aarch64-apple-darwin"), "redrob-code-darwin-arm64.tar.gz");
    assert.equal(redrobCodeCdnArchiveName("x86_64-pc-windows-msvc"), null);
    assert.equal(redrobCodeCdnArchiveName("riscv64-unknown-linux-gnu"), null);
  });

  it("names the binary inside the archive redrob-code", () => {
    assert.equal(redrobCodeCdnBinaryName({ targetTriple: "x86_64-unknown-linux-gnu" }), "redrob-code");
    assert.equal(redrobCodeCdnBinaryName({ isWindows: true }), "redrob-code.exe");
  });
});

describe("Code CDN urls", () => {
  it("publishes a pinned version under its own prefix and latest under the alias", () => {
    assert.equal(redrobCodeCdnVersionPrefix("v0.0.3"), "0.0.3");
    assert.equal(redrobCodeCdnVersionPrefix("0.0.3"), "0.0.3");
    assert.equal(redrobCodeCdnVersionPrefix("latest"), "latest");
    assert.equal(redrobCodeCdnVersionPrefix(""), "latest");
    assert.equal(redrobCodeCdnVersionPrefix(null), "latest");
  });

  it("builds the archive and sidecar urls under cdn.redrob.ai/code", () => {
    const url = redrobCodeCdnArchiveUrl({ version: "v0.0.3", archiveName: ARCHIVE });
    assert.equal(url, `${REDROB_CODE_CDN_BASE_URL}/0.0.3/${ARCHIVE}`);
    assert.equal(redrobCodeCdnSha256Url(url), `${url}.sha256`);
    assert.equal(
      redrobCodeCdnArchiveUrl({ baseUrl: "https://mirror.example/code/", version: null, archiveName: ARCHIVE }),
      `https://mirror.example/code/latest/${ARCHIVE}`,
    );
  });

  it("falls back to the canonical https base for anything that is not an https url", () => {
    assert.equal(normalizeCdnBaseUrl(undefined), REDROB_CODE_CDN_BASE_URL);
    assert.equal(normalizeCdnBaseUrl("http://insecure.example/code"), REDROB_CODE_CDN_BASE_URL);
    assert.equal(normalizeCdnBaseUrl("not a url"), REDROB_CODE_CDN_BASE_URL);
    assert.equal(normalizeCdnBaseUrl("https://mirror.example/code//"), "https://mirror.example/code");
  });
});

describe("sha256 sidecar parsing", () => {
  it("reads a sha256sum line, accepting the binary marker and a ./ prefix", () => {
    assert.equal(parseSha256Sidecar(`${DIGEST}  ${ARCHIVE}\n`, ARCHIVE), DIGEST);
    assert.equal(parseSha256Sidecar(`${DIGEST} *${ARCHIVE}`, ARCHIVE), DIGEST);
    assert.equal(parseSha256Sidecar(`${DIGEST}  ./${ARCHIVE}`, ARCHIVE), DIGEST);
    assert.equal(parseSha256Sidecar(`${DIGEST.toUpperCase()}  ${ARCHIVE}`, ARCHIVE), DIGEST);
  });

  it("refuses a sidecar that is empty, malformed, or names another file", () => {
    assert.throws(() => parseSha256Sidecar("", ARCHIVE), /empty/);
    assert.throws(() => parseSha256Sidecar("not-a-digest  file", ARCHIVE), /sha256sum format/);
    assert.throws(() => parseSha256Sidecar(`${DIGEST}  redrob-code-linux-arm64.tar.gz`, ARCHIVE), /describes redrob-code-linux-arm64\.tar\.gz/);
  });
});

describe("downloading the engine from the Code CDN", () => {
  it("verifies the digest before writing the archive", async () => {
    const { fetchImpl, urls } = cdnFetch();
    const writes = [];
    const result = await downloadRedrobCodeCdnArchive({
      version: "v0.0.3",
      archiveName: ARCHIVE,
      destPath: "/tmp/engine.tar.gz",
      fetchImpl,
      writeArchive: (path, bytes) => {
        writes.push({ path, bytes });
      },
    });

    assert.deepEqual(urls, [
      `${REDROB_CODE_CDN_BASE_URL}/0.0.3/${ARCHIVE}.sha256`,
      `${REDROB_CODE_CDN_BASE_URL}/0.0.3/${ARCHIVE}`,
    ]);
    assert.equal(result.sha256, DIGEST);
    assert.equal(result.bytes, BODY.byteLength);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].path, "/tmp/engine.tar.gz");
    assert.equal(sha256Hex(writes[0].bytes), DIGEST);
  });

  it("refuses a hash mismatch and writes nothing", async () => {
    const { fetchImpl } = cdnFetch({ archive: new TextEncoder().encode("tampered-bytes") });
    let wrote = false;
    await assert.rejects(
      downloadRedrobCodeCdnArchive({
        version: "0.0.3",
        archiveName: ARCHIVE,
        destPath: "/tmp/engine.tar.gz",
        fetchImpl,
        writeArchive: () => {
          wrote = true;
        },
      }),
      /failed sha256 verification: expected [0-9a-f]{64}, got [0-9a-f]{64}/,
    );
    assert.equal(wrote, false);
  });

  it("refuses a sidecar that names a different archive without downloading it", async () => {
    const { fetchImpl, urls } = cdnFetch({ sidecar: `${DIGEST}  redrob-code-darwin-arm64.tar.gz` });
    await assert.rejects(
      downloadRedrobCodeCdnArchive({
        version: "0.0.3",
        archiveName: ARCHIVE,
        destPath: "/tmp/engine.tar.gz",
        fetchImpl,
        writeArchive: () => {
          throw new Error("must not write");
        },
      }),
      /describes redrob-code-darwin-arm64\.tar\.gz/,
    );
    assert.deepEqual(urls, [`${REDROB_CODE_CDN_BASE_URL}/0.0.3/${ARCHIVE}.sha256`]);
  });

  it("reports the http status when the sidecar or the archive is missing", async () => {
    await assert.rejects(
      downloadRedrobCodeCdnArchive({
        version: "9.9.9",
        archiveName: ARCHIVE,
        destPath: "/tmp/engine.tar.gz",
        fetchImpl: cdnFetch({ status: { sidecar: 403 } }).fetchImpl,
        writeArchive: () => {
          throw new Error("must not write");
        },
      }),
      /sha256 sidecar for redrob-code-linux-x64\.tar\.gz could not be read from .*\/9\.9\.9\/.*\(HTTP 403\)/,
    );

    await assert.rejects(
      downloadRedrobCodeCdnArchive({
        version: "latest",
        archiveName: ARCHIVE,
        destPath: "/tmp/engine.tar.gz",
        fetchImpl: cdnFetch({ status: { archive: 404 } }).fetchImpl,
        writeArchive: () => {
          throw new Error("must not write");
        },
      }),
      /Failed to download redrob-code-linux-x64\.tar\.gz from .*\/latest\/.*\(HTTP 404\)/,
    );
  });

  it("requires an archive name rather than fetching a directory url", async () => {
    await assert.rejects(
      downloadRedrobCodeCdnArchive({
        version: "0.0.3",
        archiveName: null,
        destPath: "/tmp/engine.tar.gz",
        fetchImpl: () => {
          throw new Error("must not fetch");
        },
        writeArchive: () => {
          throw new Error("must not write");
        },
      }),
      /CDN archive name is required/,
    );
  });
});
