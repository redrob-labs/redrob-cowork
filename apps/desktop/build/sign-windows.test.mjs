import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const hook = require("../build/sign-windows.cjs");

const CONFIGURED_ENV = {
  ARTIFACT_SIGNING_ENDPOINT: "https://krc.codesigning.azure.net",
  ARTIFACT_SIGNING_ACCOUNT: "redrob-signing",
  ARTIFACT_SIGNING_CERT_PROFILE: "redrob-public-trust",
};

/** A fake redrob-labs/.github checkout holding the shared script. */
function sharedCheckout() {
  const root = mkdtempSync(join(tmpdir(), "redrob-shared-"));
  const dir = join(root, ...hook.SIGN_SCRIPT.slice(0, -1));
  mkdirSync(dir, { recursive: true });
  const script = join(dir, hook.SIGN_SCRIPT.at(-1));
  writeFileSync(script, "# fake sign.ps1\n");
  return { root, script };
}

function fakeRunner(status = 0) {
  const calls = [];
  return {
    calls,
    run(command, args, options) {
      calls.push({ command, args, env: options.env });
      return { status };
    },
  };
}

test("the environment contract: three plain identifiers, all or nothing", () => {
  assert.equal(hook.signingConfigured({}), false);
  assert.equal(hook.signingConfigured({ ARTIFACT_SIGNING_ENDPOINT: "  " }), false);
  assert.throws(
    () => hook.signingConfigured({ ARTIFACT_SIGNING_ENDPOINT: "https://x.codesigning.azure.net" }),
    /half-configured; missing: ARTIFACT_SIGNING_ACCOUNT, ARTIFACT_SIGNING_CERT_PROFILE/,
  );
  assert.equal(hook.signingConfigured(CONFIGURED_ENV), true);
});

test("the recipe is the shared one: no dlib, signtool, NuGet client or certificate here", () => {
  const source = readFileSync(new URL("../build/sign-windows.cjs", import.meta.url), "utf8");
  for (const forbidden of [
    "WIN_CSC_LINK",
    "WIN_CSC_KEY_PASSWORD",
    "CSC_KEY_PASSWORD",
    "AZURE_CLIENT_SECRET",
    ".pfx",
    "/dlib",
    "/dmdf",
    "nuget.org",
    "Expand-Archive",
    "Get-AuthenticodeSignature",
    "signtool",
  ]) {
    assert.ok(!source.includes(forbidden), `sign-windows.cjs must not carry ${forbidden}: the recipe lives in redrob-labs/.github`);
  }
  assert.deepEqual(hook.SIGN_SCRIPT, ["actions", "sign-windows", "sign.ps1"]);
});

test("the shared script is found under .redrob-shared, or where REDROB_SHARED_DIR points", () => {
  const { root, script } = sharedCheckout();
  assert.equal(hook.sharedSignScript({ REDROB_SHARED_DIR: root }), script);

  const repo = mkdtempSync(join(tmpdir(), "redrob-repo-"));
  mkdirSync(join(repo, ".redrob-shared", "actions", "sign-windows"), { recursive: true });
  writeFileSync(join(repo, ".redrob-shared", "actions", "sign-windows", "sign.ps1"), "");
  assert.equal(hook.sharedSignScript({}, repo), join(repo, ".redrob-shared", "actions", "sign-windows", "sign.ps1"));

  const empty = mkdtempSync(join(tmpdir(), "redrob-empty-"));
  assert.throws(() => hook.sharedSignScript({}, empty), /check out redrob-labs\/\.github at \.redrob-shared/);
});

test("the command runs sign.ps1 non-interactively on the files, with the signature description and URL", () => {
  const { command, args, env } = hook.signCommand(["dist\\a.exe", "dist\\b.exe"], {
    script: "C:\\w\\.redrob-shared\\actions\\sign-windows\\sign.ps1",
    name: "Redrob Cowork",
    site: "https://github.com/redrob-labs/redrob-cowork",
    env: { ...CONFIGURED_ENV },
  });
  assert.equal(command, "pwsh");
  assert.deepEqual(args, [
    "-NoProfile",
    "-NonInteractive",
    "-File",
    "C:\\w\\.redrob-shared\\actions\\sign-windows\\sign.ps1",
    "dist\\a.exe",
    "dist\\b.exe",
  ]);
  assert.equal(env.SIGN_DESCRIPTION, "Redrob Cowork");
  assert.equal(env.SIGN_URL, "https://github.com/redrob-labs/redrob-cowork");
  assert.equal(env.ARTIFACT_SIGNING_ACCOUNT, "redrob-signing");

  const custom = hook.signCommand(["x.exe"], { script: "s.ps1", env: { POWERSHELL: "C:\\pwsh7\\pwsh.exe" } });
  assert.equal(custom.command, "C:\\pwsh7\\pwsh.exe");
  assert.ok(!("SIGN_DESCRIPTION" in custom.env), "no description means sign.ps1 derives one from GITHUB_REPOSITORY");
});

test("configured: the file is handed to the shared script exactly once and a failure fails the build", () => {
  const { root } = sharedCheckout();
  const env = { ...CONFIGURED_ENV, REDROB_SHARED_DIR: root };
  const runner = fakeRunner(0);
  const logs = [];
  assert.equal(hook.sign(["dist\\Redrob Cowork Setup.exe"], { name: "Redrob Cowork" }, { env, run: runner.run, log: (m) => logs.push(m) }), "signed");
  assert.equal(runner.calls.length, 1);
  assert.equal(runner.calls[0].args.at(-1), "dist\\Redrob Cowork Setup.exe");
  assert.match(logs[0], /Signing through .*sign\.ps1/);

  const failing = fakeRunner(1);
  assert.throws(
    () => hook.sign(["dist\\x.exe"], {}, { env, run: failing.run, log() {} }),
    /sign\.ps1 failed for dist\\x\.exe \(exit 1\)/,
  );
});

test("unconfigured: nothing runs and the files stay unsigned; half-configured is an error", () => {
  const runner = fakeRunner(0);
  assert.equal(hook.sign(["dist\\x.exe"], {}, { env: {}, run: runner.run, log() {} }), "unsigned");
  assert.equal(runner.calls.length, 0);

  assert.throws(
    () => hook.sign(["dist\\x.exe"], {}, { env: { ARTIFACT_SIGNING_ACCOUNT: "a" }, run: runner.run, log() {} }),
    /half-configured/,
  );
  assert.equal(runner.calls.length, 0);
});

test("configured without the shared checkout is an error naming the checkout, not an unsigned build", () => {
  const runner = fakeRunner(0);
  const empty = mkdtempSync(join(tmpdir(), "redrob-empty-"));
  assert.throws(
    () => hook.sign(["dist\\x.exe"], {}, { env: { ...CONFIGURED_ENV }, run: runner.run, log() {}, repoRoot: empty }),
    /shared signing recipe not found/,
  );
  assert.equal(runner.calls.length, 0);
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

test("the release workflow checks the shared recipe out and keeps the signing order: build, login, sign", () => {
  const workflow = readFileSync(new URL("../../../.github/workflows/release-macos-aarch64.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes("repository: redrob-labs/.github"), "the Windows job must check out redrob-labs/.github");
  assert.ok(workflow.includes("path: .redrob-shared"));
  assert.ok(workflow.includes("uses: redrob-labs/.github/actions/sign-windows@main"), "the unpacked app is signed by the shared action");
  const unpacked = workflow.indexOf("- name: Package Electron (Windows, unpacked)");
  const login = workflow.indexOf("uses: azure/login@v3");
  const signUnpacked = workflow.indexOf("uses: redrob-labs/.github/actions/sign-windows@main");
  const prepackaged = workflow.indexOf("- name: Package Electron (Windows, installer + zip, signed)");
  assert.ok(unpacked > 0 && login > unpacked, "azure/login comes after the build");
  assert.ok(signUnpacked > login && prepackaged > signUnpacked, "sign the unpacked app, then package the installer");
  for (const forbidden of ["WIN_CSC_LINK", "CSC_LINK: ${{ secrets.WIN", "AZURE_CLIENT_SECRET", "allow_untrusted_windows", "sign-windows.cjs --app-dir"]) {
    assert.ok(!workflow.includes(forbidden), `release workflow must not carry ${forbidden}`);
  }
});
