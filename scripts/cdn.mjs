/**
 * Publish the desktop distributables to https://cdn.redrob.ai/work/.
 *
 * The GitHub release is the update channel the app pulls from, but a file on a
 * CDN is what a download page on the marketing site, or an enterprise that
 * side-loads a build, can link to without a release listing in between. The
 * object keys are a contract and so they are computed here rather than typed
 * into a workflow. For every target electron-builder produced, two keys go up:
 *
 *     work/{version}/redrob-linux-x64-{version}.AppImage   the build, by version
 *     work/latest/redrob-linux-x64.AppImage                the link that never moves
 *     work/{version}/redrob-win-x64-{version}.exe          signed Windows NSIS
 *     work/latest/redrob-win-x64.exe
 *
 * each with a `.sha256` sidecar beside it naming the file it describes, so
 * `sha256sum -c` works in the directory a downloader landed in. The stable name
 * drops the version on purpose: a page that links `latest/` should not have to
 * be edited on every release, and a file whose name says `0.3.1` while sitting
 * under `latest/` invites the wrong one being kept.
 *
 * The staging directory is laid out exactly like the bucket, so the upload is a
 * walk of what `pack` wrote and nothing computes a key twice.
 *
 * Nothing is uploaded until a bucket exists. The bucket name and the
 * credentials are the switch: without them this prints which variable is
 * missing and exits 0, because a CDN nobody has provisioned must not fail the
 * desktop's CI. There is deliberately no fallback to GitHub Releases; the public
 * download is this bucket or nothing, since a 404 from a host we guessed at is
 * worse than an honest absence.
 *
 * Linux artefacts are unsigned: a plain ubuntu-latest runner has no Linux
 * signing identity, so nothing here or on the download page may imply otherwise.
 * Windows NSIS is signed on windows-latest with the organization Authenticode
 * certificate (`WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`).
 *
 * The uploader signs its own requests with SigV4 over `fetch` rather than
 * pulling an AWS SDK into a repository that ships no server code. One PUT per
 * object is the entire S3 surface this needs, and it is all the credentials can
 * do: the policy behind them grants `s3:PutObject` only, with no ACL, no
 * listing, and no read.
 */

import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** The prefix this product owns under the shared bucket. */
export const CDN_PREFIX = "work";

/** Hardcoded: the bucket is in Seoul and does not move per workflow. */
export const CDN_REGION = "ap-northeast-2";

/** What CloudFront serves the bucket as, for the log lines humans act on. */
export const CDN_PUBLIC_HOST = "https://cdn.redrob.ai";

/**
 * The Linux targets electron-builder is configured to emit, in the order a
 * download page tends to list them. Each is one extension of the artifactName
 * template `redrob-${os}-${arch}-${version}.${ext}`, resolved for the only
 * platform a plain runner can produce: linux/x64. When a target is added to
 * `electron-builder.base.yml`, add it here and its keys follow.
 *
 * `buildArch` exists because electron-builder resolves `${arch}` per target
 * family: an AppImage is named with the kernel's `x86_64`, a tar.gz with Node's
 * `x64`. The published key stays `x64` for both, so a download page has one name
 * per platform instead of two spellings of the same machine.
 */
export const LINUX_TARGETS = [
  { os: "linux", arch: "x64", buildArch: "x86_64", ext: "AppImage" },
  { os: "linux", arch: "x64", ext: "tar.gz" },
];

/**
 * The Windows NSIS installer electron-builder emits on windows-latest. `${os}`
 * in the artifactName template is `win`, not `windows`.
 */
export const WINDOWS_TARGETS = [{
  os: "win",
  arch: "x64",
  ext: "exe",
  // Fresh, product-named key: the old redrob-win-x64.exe alias was published
  // without Cache-Control and CloudFront still serves its pre-engine bytes.
  stableName: "redrob-work-x64-setup.exe",
}];

/** Which family this run packed. Linux is the default so a job that never
 * built NSIS cannot invent a Windows key. */
export function packTargets(env = process.env) {
  if (env["REDROB_WORK_CDN_TARGETS"]?.trim() === "windows") return WINDOWS_TARGETS;
  return LINUX_TARGETS;
}

/** The versioned key name published for one target. */
export function artifactName(target, version) {
  return `redrob-${target.os}-${target.arch}-${version}.${target.ext}`;
}

/** The file name electron-builder actually wrote into `dist-electron/`. */
export function builtArtifactName(target, version) {
  return `redrob-${target.os}-${target.buildArch ?? target.arch}-${version}.${target.ext}`;
}

/**
 * The stable name under `latest/`, with no version in it to go stale. Same as
 * the versioned name with the `-${version}` segment removed, so a page can
 * hardcode it.
 */
export function latestName(target) {
  return target.stableName ?? `redrob-${target.os}-${target.arch}.${target.ext}`;
}

/**
 * Every staged object, its source artifact and its destination folder.
 *
 * All versioned objects come before any `latest/` alias, which is the order
 * they must exist in the bucket: a `latest/` link should never resolve before
 * the versioned file it mirrors is already up. `latest/` is mirrored by default
 * and turned off for a preview that should not become the download a page hands
 * out.
 */
export function cdnArtifacts(version, options = {}) {
  const targets = options.targets ?? packTargets();
  const versioned = [];
  const latest = [];
  for (const target of targets) {
    const source = builtArtifactName(target, version);
    versioned.push({ folder: version, source, name: artifactName(target, version) });
    if (options.latest !== false) {
      latest.push({ folder: "latest", source, name: latestName(target) });
    }
  }
  return [...versioned, ...latest];
}

/** Every object key, in the order a downloader needs them to exist. */
export function cdnObjectKeys(version, options = {}) {
  const prefix = options.prefix ?? `${CDN_PREFIX}/`;
  return cdnArtifacts(version, options).flatMap(({ folder, name }) => [
    `${prefix}${folder}/${name}`,
    `${prefix}${folder}/${name}.sha256`,
  ]);
}

/**
 * Whether this run may move `latest/`.
 *
 * `REDROB_WORK_CDN_LATEST=0` is how a preview says it is not the download a page
 * should hand out. It is read here rather than inside `cdnTarget` alone because
 * `pack` decides what is staged, and an object that is staged is an object that
 * gets uploaded.
 */
export function latestRequested(env = process.env) {
  return env["REDROB_WORK_CDN_LATEST"]?.trim() !== "0";
}

/**
 * Where the distributables go, or why they are going nowhere.
 *
 * Credentials fall back to the ambient `AWS_*` names so a runner with a role,
 * or a person with a profile exported, does not need a second copy of them. The
 * bucket does not: an upload target is explicit, so a workflow that has AWS
 * credentials in scope for another reason cannot start writing release binaries
 * into whatever `AWS_BUCKET` happens to say.
 */
export function cdnTarget(env = process.env) {
  const bucket = env["REDROB_WORK_CDN_BUCKET"]?.trim();
  if (!bucket) {
    return {
      configured: false,
      reason: "REDROB_WORK_CDN_BUCKET is not set",
    };
  }

  const accessKeyId =
    env["REDROB_WORK_CDN_ACCESS_KEY_ID"]?.trim() ||
    env["AWS_ACCESS_KEY_ID"]?.trim();
  const secretAccessKey =
    env["REDROB_WORK_CDN_SECRET_ACCESS_KEY"]?.trim() ||
    env["AWS_SECRET_ACCESS_KEY"]?.trim();
  if (!accessKeyId || !secretAccessKey) {
    return {
      configured: false,
      reason: `REDROB_WORK_CDN_BUCKET is ${bucket} but REDROB_WORK_CDN_ACCESS_KEY_ID and REDROB_WORK_CDN_SECRET_ACCESS_KEY are not both set`,
    };
  }

  const prefix = env["REDROB_WORK_CDN_PREFIX"]
    ?.trim()
    .replace(/^\/+|\/+$/g, "");
  return {
    configured: true,
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken:
      env["REDROB_WORK_CDN_SESSION_TOKEN"]?.trim() ||
      env["AWS_SESSION_TOKEN"]?.trim(),
    region: env["REDROB_WORK_CDN_REGION"]?.trim() || CDN_REGION,
    endpoint: env["REDROB_WORK_CDN_ENDPOINT"]?.trim(),
    prefix: prefix ? `${prefix}/` : `${CDN_PREFIX}/`,
    latest: latestRequested(env),
  };
}

/**
 * The version the distributables are named after: the one the app will show.
 *
 * Read from `apps/desktop/package.json` because that is the file electron-builder
 * derives `${version}` in the artifactName from, and a CDN key that disagrees
 * with the file on disk is a broken download. The release workflow stamps this
 * from the git tag before building; the committed placeholder is `0.0.0-dev`.
 */
export async function packagedVersion(root = process.cwd()) {
  const manifest = path.join(root, "apps", "desktop", "package.json");
  let contents;
  try {
    contents = await readFile(manifest, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error(`${manifest} does not exist, so there is no version to publish.`);
  }
  const { version } = JSON.parse(contents);
  if (!version) throw new Error(`${manifest} has no version in it.`);
  return version;
}

/**
 * Stage each distributable electron-builder produced into `<out>/` under the
 * folder names the bucket uses, writing a checksum sidecar for each copy.
 *
 * The artefacts are built into `apps/desktop/dist-electron/`; this copies them
 * so an upload reads from a directory whose every file it put there. An artefact
 * that was expected but is missing, or is empty, stops the run: a CDN key with
 * nothing behind it is worse than no key at all.
 */
export async function pack(input) {
  const version = input.version;
  const staged = [];

  for (const { folder, source, name } of cdnArtifacts(version, {
    latest: input.latest,
    targets: input.targets,
  })) {
    const from = path.join(input.dist, source);
    let contents;
    try {
      contents = await readFile(from);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      throw new Error(
        `${from} does not exist, so ${source} was never built. Build that distributable before uploading.`,
      );
    }
    if (contents.length === 0) {
      throw new Error(`${from} is empty, and an empty file is not a distributable.`);
    }

    const sha256 = createHash("sha256").update(contents).digest("hex");
    const directory = path.join(input.out, folder);
    await mkdir(directory, { recursive: true });

    const target = path.join(directory, name);
    await writeFile(target, contents);
    // Two spaces and the bare file name: the format `sha256sum` writes, so
    // `sha256sum -c` reads it back in place and a script can cut field one.
    await writeFile(`${target}.sha256`, `${sha256}  ${name}\n`, "utf8");

    staged.push({ folder, name, path: target, sha256, bytes: contents.length });
  }

  return staged;
}

const AMZ_ALGORITHM = "AWS4-HMAC-SHA256";

function hmac(key, value) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * A signed PUT for one object, as a URL and a header bag `fetch` can send.
 *
 * Virtual-hosted style against the real S3 endpoint, path style when an endpoint
 * is given, which is what the tests point at a loopback server. Only the headers
 * that have to be signed are: the host, the content type, the payload hash, the
 * date, and a session token when there is one.
 */
export function signedPut(input) {
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(input.body);

  const base = input.endpoint
    ? `${input.endpoint.replace(/\/+$/, "")}/${input.bucket}`
    : `https://${input.bucket}.s3.${input.region}.amazonaws.com`;
  const url = new URL(`${base}/${input.key}`);

  const headers = {
    host: url.host,
    "content-type": input.contentType,
    ...(input.cacheControl ? { "cache-control": input.cacheControl } : {}),
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(input.sessionToken
      ? { "x-amz-security-token": input.sessionToken }
      : {}),
  };

  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join("");
  const canonicalRequest = [
    "PUT",
    url.pathname
      .split("/")
      .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
      .join("/"),
    "",
    canonicalHeaders,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    AMZ_ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = [
    `AWS4${input.secretAccessKey}`,
    dateStamp,
    input.region,
    "s3",
    "aws4_request",
  ].reduce((key, value) => hmac(key, value));
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  return {
    url: url.toString(),
    headers: {
      ...headers,
      authorization: `${AMZ_ALGORITHM} Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`,
    },
  };
}

function contentTypeFor(name) {
  return name.endsWith(".sha256")
    ? "text/plain; charset=utf-8"
    : "application/octet-stream";
}

/**
 * How long the CDN in front of the bucket may keep a key.
 *
 * A versioned key is written once, so it can be kept forever. `latest/` is
 * rewritten by every release and must be allowed to move: without a header the
 * distribution applies its own default, which held a superseded installer for
 * hours after a new one was published and made a fixed build look unfixed. Five
 * minutes is short enough that a release is visible and long enough that the
 * bucket is not the download path for every reader.
 */
export function cacheControlFor(folder) {
  return folder === "latest"
    ? "public, max-age=300"
    : "public, max-age=31536000, immutable";
}

/**
 * Put everything under `input.dir`, each artefact before the sidecar describing
 * it, so a reader who catches the window sees a missing checksum rather than one
 * that does not match. The directory is walked rather than recomputed so the
 * bytes uploaded are exactly the bytes `pack` staged.
 *
 * No ACL is sent: the bucket is fronted by CloudFront with object ownership
 * enforced, where an ACL is an error, and these credentials could not set one.
 */
export async function upload(input) {
  const target = cdnTarget(input.env);
  if (!target.configured) return target;

  const keys = [];
  for (const { folder, name } of await walk(input.dir)) {
    const local = path.join(input.dir, folder, name);
    const body = await readFile(local);
    if (body.length === 0) {
      throw new Error(`${local} is empty, and an empty file is not a distributable.`);
    }

    const key = `${target.prefix}${folder}/${name}`;
    const request = signedPut({
      bucket: target.bucket,
      region: target.region,
      accessKeyId: target.accessKeyId,
      secretAccessKey: target.secretAccessKey,
      sessionToken: target.sessionToken,
      endpoint: target.endpoint,
      key,
      body,
      contentType: contentTypeFor(name),
      cacheControl: cacheControlFor(folder),
    });

    const response = await (input.fetch ?? fetch)(request.url, {
      method: "PUT",
      headers: request.headers,
      body,
    });
    if (!response.ok) {
      throw new Error(
        `PUT ${target.bucket}/${key} failed with ${response.status}: ${await response.text()}`,
      );
    }
    keys.push(key);
  }

  return { configured: true, bucket: target.bucket, keys };
}

/**
 * The staged objects under `dir`, artefact before its sidecar within each
 * folder, versioned folders before `latest/`. The order is the upload order: a
 * checksum never lands before the file it describes.
 */
export async function walk(dir) {
  let folders;
  try {
    folders = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${dir} was not staged. Run pack before uploading.`);
    }
    throw error;
  }

  const names = folders
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    // `latest/` last so its alias only appears once the versioned copy exists.
    .sort((a, b) => (a === "latest" ? 1 : b === "latest" ? -1 : a.localeCompare(b)));

  const objects = [];
  for (const folder of names) {
    const files = (await readdir(path.join(dir, folder))).sort((a, b) => {
      // A sidecar sorts right after the artefact it names, never before it.
      const aBase = a.replace(/\.sha256$/, "");
      const bBase = b.replace(/\.sha256$/, "");
      if (aBase !== bBase) return aBase.localeCompare(bBase);
      return a.length - b.length;
    });
    for (const name of files) objects.push({ folder, name });
  }
  return objects;
}

if (import.meta.filename === process.argv[1]) {
  const root = process.cwd();
  const version =
    process.env["REDROB_WORK_CDN_VERSION"]?.trim() || (await packagedVersion(root));
  const dist = path.join(root, "apps", "desktop", "dist-electron");
  const out = path.join(root, "apps", "desktop", "dist-electron", "cdn");

  // Stage into a fresh directory so a walk of it is exactly this release.
  await rm(out, { recursive: true, force: true });
  const latest = latestRequested(process.env);
  const targets = packTargets(process.env);
  for (const item of await pack({ dist, out, version, latest, targets })) {
    console.log(
      `packed ${path.relative(root, item.path)} ${item.bytes} bytes ${item.sha256}`,
    );
  }

  const result = await upload({ dir: out, env: process.env });
  if (!result.configured) {
    console.log(`skipped the CDN upload: ${result.reason}`);
    console.log(
      `the distributables and their checksums are in ${path.relative(root, out)} and nothing else was published in their place`,
    );
    process.exit(0);
  }

  for (const key of result.keys) console.log(`uploaded ${result.bucket}/${key}`);
  for (const target of targets) {
    console.log(
      `${CDN_PUBLIC_HOST}/${CDN_PREFIX}/${version}/${artifactName(target, version)}`,
    );
    if (latest) {
      console.log(`${CDN_PUBLIC_HOST}/${CDN_PREFIX}/latest/${latestName(target)}`);
    }
  }
}
