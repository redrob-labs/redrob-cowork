/**
 * The CDN half of the desktop build.
 *
 * Two things can go wrong here silently and both are covered: an object key that
 * a download page does not expect, and an upload that happens when it should
 * have been skipped. The signatures are checked against known answers produced
 * by botocore's own SigV4 signer for the same request, so a rewrite of the
 * signing code cannot quietly start being rejected by S3, and the upload itself
 * runs against a loopback HTTP server rather than a mocked client, so the
 * request line, the headers and the bytes are the real ones.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CDN_PREFIX,
  CDN_PUBLIC_HOST,
  CDN_REGION,
  LINUX_TARGETS,
  artifactName,
  builtArtifactName,
  cdnObjectKeys,
  cdnTarget,
  latestName,
  latestRequested,
  pack,
  signedPut,
  upload,
} from "../scripts/cdn.mjs";

const version = "0.3.1";

/** Distinct, non-empty bytes per target so a mixed-up copy is caught. */
function artifactBytes(target) {
  return Buffer.from(`not a real ${target.ext}, but real bytes for ${target.arch}\n`);
}

/** A dist-electron directory holding one file per configured Linux target. */
async function builtDist(targets = LINUX_TARGETS) {
  const root = await mkdtemp(path.join(tmpdir(), "redrob-work-cdn-"));
  const dist = path.join(root, "dist-electron");
  await mkdir(dist, { recursive: true });
  for (const target of targets) {
    await writeFile(path.join(dist, builtArtifactName(target, version)), artifactBytes(target));
  }
  return { root, dist, out: path.join(dist, "cdn") };
}

/** A bucket that keeps every PUT it is given, in the order it got them. */
function bucketServer() {
  const puts = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      puts.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks),
      });
      response.writeHead(200, { etag: '"stored"' });
      response.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        puts,
        endpoint: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function configuredEnv(endpoint, extra = {}) {
  return {
    REDROB_WORK_CDN_BUCKET: "redrob-cdn-883001953618-ap-northeast-2-an",
    REDROB_WORK_CDN_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
    REDROB_WORK_CDN_SECRET_ACCESS_KEY:
      "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    REDROB_WORK_CDN_ENDPOINT: endpoint,
    ...extra,
  };
}

test("the public download URLs are the ones a page can hardcode", () => {
  assert.equal(CDN_PUBLIC_HOST, "https://cdn.redrob.ai");
  assert.equal(CDN_PREFIX, "work");
  assert.equal(CDN_REGION, "ap-northeast-2");
  // Only linux/x64 targets: a plain runner cannot cross-compile mac or windows.
  for (const target of LINUX_TARGETS) {
    assert.equal(target.os, "linux");
    assert.equal(target.arch, "x64");
  }
  assert.equal(artifactName({ os: "linux", arch: "x64", ext: "AppImage" }, "1.2.3"), "redrob-linux-x64-1.2.3.AppImage");
  // No version in the stable name: `latest/` is a link that is not edited on
  // every release, and a file called 1.2.3 under it is the wrong one kept.
  assert.equal(latestName({ os: "linux", arch: "x64", ext: "AppImage" }), "redrob-linux-x64.AppImage");
  assert.deepEqual(cdnObjectKeys("1.2.3"), [
    "work/1.2.3/redrob-linux-x64-1.2.3.AppImage",
    "work/1.2.3/redrob-linux-x64-1.2.3.AppImage.sha256",
    "work/1.2.3/redrob-linux-x64-1.2.3.tar.gz",
    "work/1.2.3/redrob-linux-x64-1.2.3.tar.gz.sha256",
    "work/latest/redrob-linux-x64.AppImage",
    "work/latest/redrob-linux-x64.AppImage.sha256",
    "work/latest/redrob-linux-x64.tar.gz",
    "work/latest/redrob-linux-x64.tar.gz.sha256",
  ]);
});

test("a preview can be published without moving latest", () => {
  assert.deepEqual(cdnObjectKeys("1.2.3-rc.1", { latest: false }), [
    "work/1.2.3-rc.1/redrob-linux-x64-1.2.3-rc.1.AppImage",
    "work/1.2.3-rc.1/redrob-linux-x64-1.2.3-rc.1.AppImage.sha256",
    "work/1.2.3-rc.1/redrob-linux-x64-1.2.3-rc.1.tar.gz",
    "work/1.2.3-rc.1/redrob-linux-x64-1.2.3-rc.1.tar.gz.sha256",
  ]);
});

test("no bucket means no upload and a reason that names the variable", () => {
  const target = cdnTarget({});
  assert.equal(target.configured, false);
  assert.match(target.reason, /REDROB_WORK_CDN_BUCKET is not set/);
});

test("a bucket without credentials still means no upload", () => {
  const target = cdnTarget({ REDROB_WORK_CDN_BUCKET: "redrob-cdn" });
  assert.equal(target.configured, false);
  assert.match(target.reason, /redrob-cdn/);
  assert.match(target.reason, /REDROB_WORK_CDN_ACCESS_KEY_ID/);
  assert.match(target.reason, /REDROB_WORK_CDN_SECRET_ACCESS_KEY/);
});

test("half a credential pair is not a credential", () => {
  const target = cdnTarget({
    REDROB_WORK_CDN_BUCKET: "redrob-cdn",
    REDROB_WORK_CDN_ACCESS_KEY_ID: "AKIA",
  });
  assert.equal(target.configured, false);
  assert.match(target.reason, /REDROB_WORK_CDN_SECRET_ACCESS_KEY/);
});

test("the region and prefix are the shared bucket's, not the runner's", () => {
  const target = cdnTarget(configuredEnv(undefined));
  assert.equal(target.configured, true);
  assert.equal(target.region, "ap-northeast-2");
  assert.equal(target.prefix, "work/");
  assert.equal(target.latest, true);
});

test("ambient AWS credentials are accepted but an ambient bucket is not", () => {
  const withAmbient = cdnTarget({
    REDROB_WORK_CDN_BUCKET: "redrob-cdn",
    AWS_ACCESS_KEY_ID: "AKIA",
    AWS_SECRET_ACCESS_KEY: "secret",
  });
  assert.equal(withAmbient.configured, true);
  assert.equal(
    cdnTarget({ AWS_ACCESS_KEY_ID: "AKIA", AWS_SECRET_ACCESS_KEY: "secret" })
      .configured,
    false,
  );
});

test("packing writes each artefact twice with sha256sum-readable sidecars", async () => {
  const { dist, out } = await builtDist();
  const staged = await pack({ dist, out, version });

  assert.deepEqual(
    staged.map((item) => path.relative(out, item.path)),
    [
      path.join(version, "redrob-linux-x64-0.3.1.AppImage"),
      path.join(version, "redrob-linux-x64-0.3.1.tar.gz"),
      path.join("latest", "redrob-linux-x64.AppImage"),
      path.join("latest", "redrob-linux-x64.tar.gz"),
    ],
  );

  for (const item of staged) {
    const contents = await readFile(item.path);
    assert.equal(item.sha256, createHash("sha256").update(contents).digest("hex"));
    // The sidecar names the file beside it, not the file it was copied from, so
    // `sha256sum -c` works in the directory a downloader lands in.
    assert.equal(
      await readFile(`${item.path}.sha256`, "utf8"),
      `${item.sha256}  ${item.name}\n`,
    );
  }
});

test("packing refuses to invent an artefact that was never built", async () => {
  const { out } = await builtDist();
  const empty = await mkdtemp(path.join(tmpdir(), "redrob-work-empty-"));
  await assert.rejects(
    pack({ dist: empty, out, version }),
    /does not exist, so .* was never built/,
  );
});

test("packing refuses an empty artefact", async () => {
  const { root, dist, out } = await builtDist();
  await writeFile(path.join(dist, builtArtifactName(LINUX_TARGETS[0], version)), "");
  await assert.rejects(
    pack({ dist, out, version }),
    /is empty, and an empty file is not a distributable/,
  );
  assert.ok(root);
});

// electron-builder names an AppImage with the kernel's arch and a tar.gz with
// Node's, so reading the AppImage back as `-x64-` finds nothing and the upload
// fails after a full build. The published key stays `x64` either way.
test("the AppImage is read under the x86_64 name electron-builder writes", async () => {
  assert.equal(
    builtArtifactName(LINUX_TARGETS[0], "1.2.3"),
    "redrob-linux-x86_64-1.2.3.AppImage",
  );
  assert.equal(artifactName(LINUX_TARGETS[0], "1.2.3"), "redrob-linux-x64-1.2.3.AppImage");
  assert.equal(builtArtifactName(LINUX_TARGETS[1], "1.2.3"), "redrob-linux-x64-1.2.3.tar.gz");

  const { dist, out } = await builtDist();
  const staged = await pack({ dist, out, version });
  const appImage = staged.filter((item) => item.name.endsWith(".AppImage"));
  assert.deepEqual(
    appImage.map((item) => path.relative(out, item.path)),
    [
      path.join(version, "redrob-linux-x64-0.3.1.AppImage"),
      path.join("latest", "redrob-linux-x64.AppImage"),
    ],
  );
  const source = await readFile(path.join(dist, `redrob-linux-x86_64-${version}.AppImage`));
  for (const item of appImage) {
    assert.deepEqual(await readFile(item.path), source);
  }
});

// The preview flag has to reach `pack`, not just `upload`: whatever is staged is
// what gets walked and uploaded, so a preview that stages `latest/` publishes
// itself as the download a page hands out.
test("a preview stages nothing under latest", async () => {
  assert.equal(latestRequested({}), true);
  assert.equal(latestRequested({ REDROB_WORK_CDN_LATEST: "1" }), true);
  assert.equal(latestRequested({ REDROB_WORK_CDN_LATEST: "0" }), false);
  assert.equal(cdnTarget(configuredEnv(undefined, { REDROB_WORK_CDN_LATEST: "0" })).latest, false);

  const { dist, out } = await builtDist();
  const staged = await pack({
    dist,
    out,
    version,
    latest: latestRequested({ REDROB_WORK_CDN_LATEST: "0" }),
  });
  assert.deepEqual(
    staged.map((item) => path.relative(out, item.path)),
    [
      path.join(version, "redrob-linux-x64-0.3.1.AppImage"),
      path.join(version, "redrob-linux-x64-0.3.1.tar.gz"),
    ],
  );
  assert.deepEqual(await readdir(out), [version]);
});

/**
 * Known answers from botocore's `S3SigV4Auth` for the same request, timestamp
 * and credentials. The credentials are AWS's own documentation example pair and
 * grant nothing; the vectors are shared byte-for-byte with the browser repo's
 * cross-check, so both products' signers are held to one independent oracle.
 */
test("signatures match an independent SigV4 implementation", () => {
  const body = Buffer.from("redrob browser cdn sigv4 cross check\n");
  const credentials = {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    body,
    contentType: "application/zip",
    now: new Date("2026-08-31T05:59:47.000Z"),
  };
  const vectors = [
    {
      bucket: "redrob-cdn-883001953618-ap-northeast-2-an",
      region: "ap-northeast-2",
      key: "browser/0.1.0/redrob-browser-0.1.0.zip",
      url: "https://redrob-cdn-883001953618-ap-northeast-2-an.s3.ap-northeast-2.amazonaws.com/browser/0.1.0/redrob-browser-0.1.0.zip",
      signature:
        "2b546844677423875d3fadc29d7a77ea80d4af3f9905e0f371587075d7337ae1",
    },
    {
      bucket: "redrob-cdn-883001953618-ap-northeast-2-an",
      region: "ap-northeast-2",
      key: "browser/latest/redrob-browser.zip",
      url: "https://redrob-cdn-883001953618-ap-northeast-2-an.s3.ap-northeast-2.amazonaws.com/browser/latest/redrob-browser.zip",
      signature:
        "7b314eccf9511c232d5e6278230b057f2ee6d057f273d8b4d25d3654e486a32f",
    },
    {
      // Path style, which is what the loopback bucket in these tests receives.
      bucket: "example-bucket",
      region: "us-east-1",
      endpoint: "http://127.0.0.1:9999",
      key: "browser/latest/redrob-browser.zip.sha256",
      url: "http://127.0.0.1:9999/example-bucket/browser/latest/redrob-browser.zip.sha256",
      signature:
        "9e9338a9a6e565282a78ac40e4997d3330582819fe26dd32993db1f9d0868c3a",
    },
  ];

  for (const vector of vectors) {
    const request = signedPut({ ...credentials, ...vector });
    assert.equal(request.url, vector.url);
    assert.equal(request.headers["x-amz-date"], "20260831T055947Z");
    assert.equal(
      request.headers.authorization,
      `AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20260831/${vector.region}/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=${vector.signature}`,
    );
  }
});

test("uploading puts every staged object and nothing else", async () => {
  const { dist, out } = await builtDist();
  await pack({ dist, out, version });
  const bucket = await bucketServer();

  try {
    const result = await upload({
      dir: out,
      env: configuredEnv(bucket.endpoint),
    });

    assert.equal(result.configured, true);
    assert.deepEqual(result.keys, cdnObjectKeys(version));
    assert.deepEqual(
      bucket.puts.map((put) => put.url),
      cdnObjectKeys(version).map(
        (key) => `/redrob-cdn-883001953618-ap-northeast-2-an/${key}`,
      ),
    );

    for (const put of bucket.puts) {
      assert.equal(put.method, "PUT");
      assert.match(put.headers.authorization, /^AWS4-HMAC-SHA256 Credential=/);
      assert.equal(
        put.headers["x-amz-content-sha256"],
        createHash("sha256").update(put.body).digest("hex"),
      );
      // A bucket with ownership enforced rejects an ACL, and the credentials
      // only carry s3:PutObject, so nothing here may ask for public-read.
      assert.equal("x-amz-acl" in put.headers, false);
    }

    // First put is the versioned AppImage; its sidecar follows immediately and
    // names the file beside it.
    const [appimage, appimageSidecar] = bucket.puts;
    assert.deepEqual(appimage.body, artifactBytes(LINUX_TARGETS[0]));
    assert.equal(appimage.headers["content-type"], "application/octet-stream");
    assert.equal(appimageSidecar.headers["content-type"], "text/plain; charset=utf-8");
    assert.match(
      appimageSidecar.body.toString("utf8"),
      new RegExp(`^[0-9a-f]{64} {2}redrob-linux-x64-${version.replace(/\./g, "\\.")}\\.AppImage\n$`),
    );
  } finally {
    await bucket.close();
  }
});

test("a preview upload leaves latest where it was", async () => {
  const { dist, out } = await builtDist();
  await pack({ dist, out, version, latest: false });
  const bucket = await bucketServer();

  try {
    const result = await upload({
      dir: out,
      env: configuredEnv(bucket.endpoint, { REDROB_WORK_CDN_LATEST: "0" }),
    });
    assert.deepEqual(result.keys, cdnObjectKeys(version, { latest: false }));
    assert.equal(bucket.puts.length, 4);
    assert.ok(bucket.puts.every((put) => !put.url.includes("/latest/")));
  } finally {
    await bucket.close();
  }
});

test("an unset bucket skips the upload instead of failing the build", async () => {
  const { dist, out } = await builtDist();
  await pack({ dist, out, version });
  const result = await upload({ dir: out, env: {} });
  assert.equal(result.configured, false);
  assert.equal(result.keys, undefined);
  assert.match(result.reason, /REDROB_WORK_CDN_BUCKET is not set/);
});

test("a bucket that refuses the PUT fails loudly", async () => {
  const { dist, out } = await builtDist();
  await pack({ dist, out, version });
  const server = createServer((request, response) => {
    response.writeHead(403, { "content-type": "application/xml" });
    response.end("<Error><Code>AccessDenied</Code></Error>");
  });
  await new Promise((listening) => server.listen(0, "127.0.0.1", listening));

  try {
    await assert.rejects(
      upload({
        dir: out,
        env: configuredEnv(`http://127.0.0.1:${server.address().port}`),
      }),
      /failed with 403: <Error><Code>AccessDenied<\/Code><\/Error>/,
    );
  } finally {
    await new Promise((closed) => server.close(closed));
  }
});
