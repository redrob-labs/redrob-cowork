import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const hook = require("../build/sign-windows.cjs");

/**
 * The hook signs through Azure Artifact Signing (signtool + the Azure.CodeSigning
 * dlib, authenticated by the `az login` that precedes it) and verifies every
 * signature it writes. These tests pin the parts that can silently rot: the
 * environment contract, the dlib metadata (its ExcludeCredentials list is what
 * keeps a missing login from hanging on a browser prompt), the signtool
 * arguments, the verification bar, the PE parse that decides "already signed",
 * and the vendor list it is applied to.
 */

const CONFIGURED_ENV = {
  ARTIFACT_SIGNING_ENDPOINT: "https://krc.codesigning.azure.net/",
  ARTIFACT_SIGNING_ACCOUNT: "redrob-signing",
  ARTIFACT_SIGNING_CERT_PROFILE: "redrob-public-trust",
};

/** Minimal PE with a Certificate Table entry of the given size. */
function writePe(path, { plus = false, certSize = 0, truncateOptional = false } = {}) {
  const peOffset = 0x80;
  const optionalSize = truncateOptional ? 2 : 0xf0;
  const buffer = Buffer.alloc(peOffset + 24 + optionalSize + 16);

  buffer.writeUInt16LE(0x5a4d, 0); // MZ
  buffer.writeUInt32LE(peOffset, 0x3c);
  buffer.writeUInt32LE(0x00004550, peOffset); // PE\0\0
  buffer.writeUInt16LE(optionalSize, peOffset + 20);

  const optionalAt = peOffset + 24;
  buffer.writeUInt16LE(plus ? 0x20b : 0x10b, optionalAt);
  if (!truncateOptional) {
    const directoriesAt = optionalAt + (plus ? 112 : 96);
    const entry = directoriesAt + 4 * 8;
    buffer.writeUInt32LE(0x1000, entry); // address
    buffer.writeUInt32LE(certSize, entry + 4);
  }
  writeFileSync(path, buffer);
}

function vendorPath(root, kind) {
  if (kind === "elevate") {
    const dir = join(root, "resources");
    mkdirSync(dir, { recursive: true });
    return join(dir, "elevate.exe");
  }
  const dir = join(root, "prebuilds", "win32-x64", "conpty");
  mkdirSync(dir, { recursive: true });
  return join(dir, "OpenConsole.exe");
}

function scratch() {
  return mkdtempSync(join(tmpdir(), "sign-hook-"));
}

/**
 * A fake process runner standing in for signtool, tar and PowerShell. It
 * records every invocation and answers each command the way the real one does
 * on success, so a test asserts on the exact argv the hook produced.
 */
function fakeRunner({ status = "Valid", subject = 'CN="McKinley Rice, Inc.", O="McKinley Rice, Inc.", C=KR', failSignTimes = 0 } = {}) {
  const calls = [];
  let signFailures = 0;
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === "sign" && signFailures < failSignTimes) {
      signFailures += 1;
      return { status: 1, stdout: "", stderr: "SignTool Error: transient" };
    }
    if (command === "pwsh" || command === "powershell") {
      return { status: 0, stdout: JSON.stringify({ Status: status, StatusMessage: "ok", Subject: subject }), stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  run.calls = calls;
  run.signs = () => calls.filter((call) => call[1] === "sign");
  run.verifies = () => calls.filter((call) => call[1] === "verify");
  return run;
}

function signerFor(run, env = CONFIGURED_ENV, extra = {}) {
  const dir = scratch();
  const dlib = join(dir, "x64", "Azure.CodeSigning.Dlib.dll");
  mkdirSync(join(dir, "x64"), { recursive: true });
  writeFileSync(dlib, "not really a dll");
  const logs = [];
  const signer = hook.createSigner({
    env: { ...env, ARTIFACT_SIGNING_DLIB: dlib, SIGNTOOL: "C:\\kits\\signtool.exe" },
    run,
    dir,
    log: (line) => logs.push(line),
    sleep: async () => {},
    ...extra,
  });
  return { signer, logs, dlib, dir };
}

test("reads the certificate table size from PE32 and PE32+", () => {
  const root = scratch();
  const pe32 = join(root, "a.exe");
  const pe32plus = join(root, "b.exe");
  writePe(pe32, { certSize: 16080 });
  writePe(pe32plus, { plus: true, certSize: 7888 });
  assert.equal(hook.certificateTableSize(pe32), 16080);
  assert.equal(hook.certificateTableSize(pe32plus), 7888);
});

test("an unsigned PE reports zero, and a non-PE reports null", () => {
  const root = scratch();
  const unsigned = join(root, "c.exe");
  writePe(unsigned, { certSize: 0 });
  assert.equal(hook.certificateTableSize(unsigned), 0);

  const notPe = join(root, "d.exe");
  writeFileSync(notPe, "just text, definitely not a PE");
  assert.equal(hook.certificateTableSize(notPe), null);
});

test("a truncated optional header is treated as unsigned, not as a crash", () => {
  const root = scratch();
  const odd = join(root, "e.exe");
  writePe(odd, { truncateOptional: true });
  assert.equal(hook.certificateTableSize(odd), 0);
});

test("skips a signed vendor binary", () => {
  const root = scratch();
  for (const kind of ["elevate", "openconsole"]) {
    const file = vendorPath(root, kind);
    writePe(file, { certSize: 9000 });
    assert.equal(hook.isAlreadySignedVendorBinary(file), true, kind);
  }
});

test("signs a vendor binary that arrives UNSIGNED", () => {
  // A vendor that stops signing its own helper must not slip through unsigned.
  const root = scratch();
  const file = vendorPath(root, "elevate");
  writePe(file, { certSize: 0 });
  assert.equal(hook.isAlreadySignedVendorBinary(file), false);
});

test("never skips our own executable, signed or not", () => {
  const root = scratch();
  const ours = join(root, "Redrob Cowork.exe");
  writePe(ours, { certSize: 16080 });
  assert.equal(hook.isAlreadySignedVendorBinary(ours), false);

  const installer = join(root, "redrob-win-x64-9.9.9.exe");
  writePe(installer, { certSize: 16080 });
  assert.equal(hook.isAlreadySignedVendorBinary(installer), false);
});

test("a same-named file outside the vendor directory is still signed", () => {
  // Matching on basename alone would let one of our own binaries be skipped.
  const root = scratch();
  const dir = join(root, "app");
  mkdirSync(dir, { recursive: true });
  const decoy = join(dir, "elevate.exe");
  writePe(decoy, { certSize: 16080 });
  assert.equal(hook.isAlreadySignedVendorBinary(decoy), false);
});

test("the environment contract: three plain identifiers, all or nothing", () => {
  assert.deepEqual(Object.values(hook.SIGNING_ENV), [
    "ARTIFACT_SIGNING_ENDPOINT",
    "ARTIFACT_SIGNING_ACCOUNT",
    "ARTIFACT_SIGNING_CERT_PROFILE",
  ]);
  assert.equal(hook.signingConfig({}), null);
  assert.equal(hook.signingConfig({ ARTIFACT_SIGNING_ENDPOINT: "  " }), null);
  assert.throws(
    () => hook.signingConfig({ ARTIFACT_SIGNING_ENDPOINT: "https://x.codesigning.azure.net" }),
    /half-configured; missing: ARTIFACT_SIGNING_ACCOUNT, ARTIFACT_SIGNING_CERT_PROFILE/,
  );
  assert.deepEqual(hook.signingConfig(CONFIGURED_ENV), {
    endpoint: "https://krc.codesigning.azure.net",
    account: "redrob-signing",
    profile: "redrob-public-trust",
  });
});

test("no certificate file, password or client secret is read anywhere", () => {
  const source = readFileSync(new URL("../build/sign-windows.cjs", import.meta.url), "utf8");
  for (const forbidden of ["WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD", "CSC_KEY_PASSWORD", "AZURE_CLIENT_SECRET", ".pfx", "/f ", '"/p"']) {
    assert.ok(!source.includes(forbidden), `sign-windows.cjs must not reference ${forbidden}`);
  }
});

test("the dlib metadata excludes every credential a runner cannot satisfy", () => {
  const metadata = hook.metadataFor(hook.signingConfig(CONFIGURED_ENV));
  assert.deepEqual(metadata, {
    Endpoint: "https://krc.codesigning.azure.net",
    CodeSigningAccountName: "redrob-signing",
    CertificateProfileName: "redrob-public-trust",
    ExcludeCredentials: [
      "InteractiveBrowserCredential",
      "ManagedIdentityCredential",
      "SharedTokenCacheCredential",
      "VisualStudioCredential",
      "VisualStudioCodeCredential",
      "AzurePowerShellCredential",
      "AzureDeveloperCliCredential",
      "WorkloadIdentityCredential",
    ],
  });
  // Nothing the metadata names is a secret: the credential is the az login.
  assert.ok(!("ClientSecret" in metadata));
});

/**
 * The Microsoft.ArtifactSigning.Client package as it extracts: the dlib sits at
 * bin\x64 beside an x86 build and the package metadata.
 */
function layOutClientPackage(root) {
  for (const arch of ["x86", "x64"]) {
    mkdirSync(join(root, "bin", arch), { recursive: true });
    writeFileSync(join(root, "bin", arch, "Azure.CodeSigning.Dlib.dll"), arch);
    writeFileSync(join(root, "bin", arch, "Azure.CodeSigning.Client.dll"), arch);
  }
  writeFileSync(join(root, "Microsoft.ArtifactSigning.Client.nuspec"), "<package/>");
  writeFileSync(join(root, "[Content_Types].xml"), "<Types/>");
}

test("finds the x64 dlib in an extracted client package, not the x86 one", () => {
  const root = scratch();
  layOutClientPackage(root);
  const dlib = hook.findDlib(root);
  assert.equal(dlib, join(root, "bin", "x64", "Azure.CodeSigning.Dlib.dll"));
  assert.equal(readFileSync(dlib, "utf8"), "x64");

  const empty = scratch();
  mkdirSync(join(empty, "bin", "x86"), { recursive: true });
  writeFileSync(join(empty, "bin", "x86", "Azure.CodeSigning.Dlib.dll"), "x86");
  assert.throws(() => hook.findDlib(empty), /Azure\.CodeSigning\.Dlib\.dll \(x64\) not found/);
});

test("a failed extraction is an error, not an empty directory searched in vain", () => {
  const dir = scratch();
  const run = (command, args) => {
    assert.equal(command, "pwsh");
    assert.match(args.at(-1), /Expand-Archive/);
    return { status: 1, stdout: "", stderr: "Expand-Archive: not a zip" };
  };
  assert.throws(() => hook.extractZip(join(dir, "a.zip"), join(dir, "out"), run, {}), /PowerShell failed \(1\): Expand-Archive: not a zip/);
});

test("the client comes from the Microsoft.ArtifactSigning.Client NuGet package", async () => {
  assert.equal(hook.CLIENT_PACKAGE_URL, "https://www.nuget.org/api/v2/package/Microsoft.ArtifactSigning.Client");

  const dir = scratch();
  const run = fakeRunner();
  // The fake Expand-Archive lays the package out the way the real one does.
  const extracting = (command, args) => {
    if (command === "pwsh" && /Expand-Archive/.test(args.at(-1))) layOutClientPackage(join(dir, "client"));
    return run(command, args);
  };
  let fetched = null;
  const fetchImpl = async (url) => {
    fetched = url;
    return { ok: true, arrayBuffer: async () => new Uint8Array([0x50, 0x4b]).buffer };
  };
  const client = await hook.prepareClient(hook.signingConfig(CONFIGURED_ENV), { env: {}, dir, fetchImpl, run: extracting });
  assert.equal(fetched, hook.CLIENT_PACKAGE_URL);
  // Saved under a .zip name (Expand-Archive refuses .nupkg) and unpacked with
  // PowerShell, not tar: in a Git-bash step the tar on PATH is GNU tar, which
  // cannot read a zip, and the first dry run died on exactly that.
  assert.equal(run.calls[0][0], "pwsh");
  assert.match(run.calls[0].at(-1), /Expand-Archive -LiteralPath '.*artifact-signing-client\.zip' -DestinationPath '.*client' -Force/);
  assert.equal(client.dlib, join(dir, "client", "bin", "x64", "Azure.CodeSigning.Dlib.dll"));
  assert.deepEqual(JSON.parse(readFileSync(client.metadata, "utf8")).ExcludeCredentials, hook.EXCLUDE_CREDENTIALS);
});

test("a dlib handed in by ARTIFACT_SIGNING_DLIB skips the download", async () => {
  const dir = scratch();
  const dlib = join(dir, "x64", "Azure.CodeSigning.Dlib.dll");
  mkdirSync(join(dir, "x64"), { recursive: true });
  writeFileSync(dlib, "dll");
  const client = await hook.prepareClient(hook.signingConfig(CONFIGURED_ENV), {
    env: { ARTIFACT_SIGNING_DLIB: dlib },
    dir,
    fetchImpl: async () => {
      throw new Error("must not download");
    },
    run: () => {
      throw new Error("must not extract");
    },
  });
  assert.equal(client.dlib, dlib);
});

test("signtool arguments: sha256 digest and timestamp, the dlib, and no certificate flags", () => {
  const args = hook.signToolArgs({
    file: "C:\\out\\Redrob Cowork.exe",
    dlib: "C:\\client\\x64\\Azure.CodeSigning.Dlib.dll",
    metadata: "C:\\client\\metadata.json",
    name: "Redrob Cowork",
    site: "https://github.com/redrob-labs/redrob-cowork",
  });
  assert.deepEqual(args, [
    "sign", "/v", "/fd", "SHA256", "/td", "SHA256",
    "/tr", "http://timestamp.acs.microsoft.com",
    "/dlib", "C:\\client\\x64\\Azure.CodeSigning.Dlib.dll",
    "/dmdf", "C:\\client\\metadata.json",
    "/d", "Redrob Cowork",
    "/du", "https://github.com/redrob-labs/redrob-cowork",
    "C:\\out\\Redrob Cowork.exe",
  ]);
  for (const flag of ["/f", "/p", "/sha1", "/a", "/as"]) {
    assert.ok(!args.includes(flag), `${flag} must not be passed`);
  }
});

test("finds the newest Windows Kits signtool unless SIGNTOOL is set", () => {
  const kits = scratch();
  for (const version of ["10.0.19041.0", "10.0.26100.0", "10.0.22621.0"]) {
    mkdirSync(join(kits, version, "x64"), { recursive: true });
    writeFileSync(join(kits, version, "x64", "signtool.exe"), "");
  }
  assert.equal(hook.findSignTool({}, kits), join(kits, "10.0.26100.0", "x64", "signtool.exe"));
  assert.equal(hook.findSignTool({ SIGNTOOL: "D:\\tools\\signtool.exe" }, kits), "D:\\tools\\signtool.exe");
  assert.throws(() => hook.findSignTool({}, join(kits, "missing")), /signtool\.exe not found/);
});

test("verification runs signtool verify /pa and demands Status Valid, then prints the signer", () => {
  const run = fakeRunner();
  const logs = [];
  const subject = hook.verifySignature("C:\\out\\redrob-cowork-1.2.3-win-x64.exe", {
    signtool: "signtool.exe",
    run,
    env: {},
    log: (line) => logs.push(line),
  });
  assert.deepEqual(run.calls[0], ["signtool.exe", "verify", "/pa", "/v", "C:\\out\\redrob-cowork-1.2.3-win-x64.exe"]);
  assert.equal(run.calls[1][0], "pwsh");
  assert.match(run.calls[1].at(-1), /Get-AuthenticodeSignature -LiteralPath 'C:\\out\\redrob-cowork-1.2.3-win-x64.exe'/);
  assert.equal(subject, 'CN="McKinley Rice, Inc.", O="McKinley Rice, Inc.", C=KR');
  assert.deepEqual(logs, ['C:\\out\\redrob-cowork-1.2.3-win-x64.exe signed by CN="McKinley Rice, Inc.", O="McKinley Rice, Inc.", C=KR']);
});

test("verification refuses anything but Valid -- no untrusted-root allowance", () => {
  for (const status of ["NotTrusted", "UnknownError", "NotSigned", "HashMismatch"]) {
    const run = fakeRunner({ status });
    assert.throws(
      () => hook.verifySignature("C:\\out\\a.exe", { signtool: "signtool.exe", run, env: {}, log: () => {} }),
      new RegExp(`signature status ${status}`),
      status,
    );
  }
  const failing = (command, args) => (args[0] === "verify" ? { status: 1, stdout: "", stderr: "SignTool Error: chain" } : fakeRunner()(command, args));
  assert.throws(
    () => hook.verifySignature("C:\\out\\a.exe", { signtool: "signtool.exe", run: failing, env: {}, log: () => {} }),
    /signtool verify \/pa failed/,
  );
});

test("the signer signs our executable with the dlib and verifies it", async () => {
  const root = scratch();
  const ours = join(root, "Redrob Cowork.exe");
  writePe(ours, { certSize: 0 });
  const run = fakeRunner();
  const { signer, logs, dlib } = signerFor(run);

  assert.equal(await signer.sign(ours, { name: "Redrob Cowork", site: "https://example.invalid" }), "signed");
  const [sign] = run.signs();
  assert.equal(sign[0], "C:\\kits\\signtool.exe");
  assert.ok(sign.includes("/dlib") && sign.includes(dlib));
  assert.equal(sign.at(-1), ours);
  assert.equal(run.verifies().length, 1);
  assert.ok(logs.some((line) => line === `${ours} signed by CN="McKinley Rice, Inc.", O="McKinley Rice, Inc.", C=KR`));
});

test("a transient signtool failure is retried; a persistent one fails the build", async () => {
  const root = scratch();
  const ours = join(root, "Redrob Cowork.exe");
  writePe(ours, { certSize: 0 });

  const flaky = fakeRunner({ failSignTimes: 1 });
  const { signer } = signerFor(flaky);
  assert.equal(await signer.sign(ours), "signed");
  assert.equal(flaky.signs().length, 2);

  const broken = fakeRunner({ failSignTimes: 99 });
  const { signer: failing } = signerFor(broken);
  await assert.rejects(failing.sign(ours), /signtool sign failed .* after 3 attempts/);
});

test("a skipped vendor binary never reaches signtool", async () => {
  const root = scratch();
  const file = vendorPath(root, "elevate");
  writePe(file, { certSize: 9000 });
  const run = fakeRunner();
  const { signer } = signerFor(run);
  assert.equal(await signer.sign(file), "skipped");
  assert.deepEqual(run.calls, []);
});

test("with Artifact Signing unconfigured the files stay unsigned and signtool is never run", async () => {
  const root = scratch();
  const ours = join(root, "Redrob Cowork.exe");
  writePe(ours, { certSize: 0 });
  const run = fakeRunner();
  const { signer } = signerFor(run, {});
  assert.equal(await signer.sign(ours), "unsigned");
  assert.deepEqual(run.calls, []);
});

test("a half-configured environment is an error, not an unsigned build", async () => {
  const root = scratch();
  const ours = join(root, "Redrob Cowork.exe");
  writePe(ours, { certSize: 0 });
  const { signer } = signerFor(fakeRunner(), { ARTIFACT_SIGNING_ACCOUNT: "x" });
  await assert.rejects(signer.sign(ours), /half-configured/);
});

test("the unpacked-app walk picks what winPackager.signApp would sign", () => {
  const app = scratch();
  writePe(join(app, "Redrob Cowork.exe"));
  writeFileSync(join(app, "ffmpeg.dll"), "");
  mkdirSync(join(app, "resources", "app.asar.unpacked", "node_modules", "x", "prebuilds", "win32-x64", "conpty"), { recursive: true });
  writePe(join(app, "resources", "app.asar.unpacked", "node_modules", "x", "prebuilds", "win32-x64", "conpty", "OpenConsole.exe"), { certSize: 100 });
  writePe(join(app, "resources", "app.asar.unpacked", "node_modules", "x", "helper.exe"));
  mkdirSync(join(app, "resources", "sidecars"), { recursive: true });
  writeFileSync(join(app, "resources", "sidecars", "redrob.bin"), "");
  writeFileSync(join(app, "resources", "elevate.exe"), "");

  assert.deepEqual(hook.collectSignableFiles(app), [
    join(app, "Redrob Cowork.exe"),
    join(app, "resources", "app.asar.unpacked", "node_modules", "x", "helper.exe"),
    join(app, "resources", "app.asar.unpacked", "node_modules", "x", "prebuilds", "win32-x64", "conpty", "OpenConsole.exe"),
  ]);
});

test("the CLI needs --app-dir", () => {
  assert.deepEqual(hook.parseArgs(["--app-dir", "dist/win-unpacked", "--name", "Redrob Cowork"]), {
    appDir: "dist/win-unpacked",
    name: "Redrob Cowork",
    site: null,
  });
  assert.throws(() => hook.parseArgs([]), /--app-dir/);
  assert.throws(() => hook.parseArgs(["--bogus"]), /unknown argument/);
});

test("the build config asks for sha256 only, names the hook, and pins the publisher", () => {
  // electron-builder runs one signing pass per entry in signingHashAlgorithms,
  // so leaving the ["sha1","sha256"] default doubles every billed signature.
  const config = readFileSync(new URL("../electron-builder.base.yml", import.meta.url), "utf8");
  const win = config.slice(config.indexOf("\nwin:"));
  const block = win.slice(0, win.indexOf("\nnsis:"));
  assert.match(block, /signingHashAlgorithms:\s*\n\s*-\s*sha256/);
  assert.doesNotMatch(block, /-\s*sha1/, "sha1's trusted root expired in 2021");
  assert.match(block, /sign:\s*build\/sign-windows\.cjs/);
  // electron-updater only installs an update whose signer matches this name;
  // with no certificate file to read it from, it has to be stated.
  assert.match(block, /publisherName:\s*'CN="McKinley Rice, Inc\."'/);
  assert.doesNotMatch(block, /certificateFile|certificateSubjectName|certificateSha1/);
});

test("the hook counts what it signs, skips and leaves unsigned", async () => {
  const root = scratch();
  hook.tally.signed.length = 0;
  hook.tally.skipped.length = 0;
  hook.tally.unsigned.length = 0;

  const vendor = vendorPath(root, "elevate");
  writePe(vendor, { certSize: 9000 });
  const ours = join(root, "Redrob Cowork.exe");
  writePe(ours, { certSize: 0 });

  const { signer } = signerFor(fakeRunner());
  await signer.sign(vendor);
  await signer.sign(ours);

  assert.deepEqual(hook.tally.signed, [ours]);
  assert.deepEqual(hook.tally.skipped, [vendor]);
  assert.deepEqual(hook.tally.unsigned, []);
});
