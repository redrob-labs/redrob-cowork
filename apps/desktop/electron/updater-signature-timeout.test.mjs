// Regression: "업데이트를 다운로드할 수 없습니다 / Command failed: set "PSModulePath=" &
// chcp 65001 >NUL & powershell.exe ... Get-AuthenticodeSignature ..." on Windows,
// updating to v0.0.5.
//
// electron-updater verifies the downloaded installer's Authenticode signature by
// shelling out to `Get-AuthenticodeSignature`, with a hard-coded 20s `execFile`
// timeout. That call hashes the WHOLE installer, and ours is ~188 MB (the bundled
// engine binary alone is 145 MB), so on a real machine -- with Defender reading
// the same bytes -- it overruns 20s. Node then kills the child and reports
// `Command failed: <command>` with an empty stderr, which is exactly the shape
// the user saw. A blocked or missing PowerShell cannot produce this error:
// `handleError` probes `ConvertTo-Json test` first and SKIPS verification when
// that fails, so only a started-then-killed command reaches the reject.
//
// The 20s value is not configurable, so `patches/electron-updater@6.8.3.patch`
// raises it. Dropping the check instead (`win.verifyUpdateCodeSignature: false`)
// would have removed the publisher-identity binding, so the patch is narrower.
//
// This test pins the patch: it reads the INSTALLED package, so it fails if the
// patch stops applying (a version bump that no longer matches, or a lost
// patchedDependencies entry) rather than letting updates break again silently.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);

function verifierSource() {
  const entry = require.resolve("electron-updater");
  return readFileSync(join(dirname(entry), "windowsExecutableCodeSignatureVerifier.js"), "utf8");
}

describe("updater signature verification timeout", () => {
  it("allows enough time to hash a large installer", () => {
    const source = verifierSource();
    const match = source.match(/Get-AuthenticodeSignature[\s\S]*?ConvertTo-Json -Compress[\s\S]{0,12}?,\s*(\d+)\s*\*\s*1000\)/);
    assert.ok(match, "Could not find the Get-AuthenticodeSignature execFile timeout.");
    const seconds = Number(match[1]);
    assert.ok(
      seconds >= 120,
      `Authenticode verification timeout is ${seconds}s. Our installer is ~188 MB, and hashing it on `
        + "a real Windows machine overruns the upstream 20s default, which surfaces to the user as "
        + '"Command failed" with no stderr. Keep patches/electron-updater@6.8.3.patch applied.',
    );
  });

  it("keeps signature verification enabled rather than disabling it", () => {
    const config = readFileSync(new URL("../electron-builder.base.yml", import.meta.url), "utf8");
    assert.doesNotMatch(
      config,
      /verifyUpdateCodeSignature:\s*false/,
      "Signature verification binds the update to our publisher certificate; the timeout patch is "
        + "the fix, not turning the check off.",
    );
  });
});
