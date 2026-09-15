import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const hook = require("../build/sign-windows.cjs");

/**
 * electron-builder signs every `.exe` it packages and offers no way to exclude an
 * individual file, so each Windows build re-signed three vendor binaries that
 * already carried a valid signature. Cloud signing bills per signature, which
 * made that measurable money rather than a curiosity.
 *
 * These assertions pin the two halves that can silently rot: the PE parse that
 * decides "is this already signed", and the vendor list it is applied to.
 */

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

test("reads the certificate table size from PE32 and PE32+", () => {
  const root = mkdtempSync(join(tmpdir(), "sign-hook-"));
  const pe32 = join(root, "a.exe");
  const pe32plus = join(root, "b.exe");
  writePe(pe32, { certSize: 16080 });
  writePe(pe32plus, { plus: true, certSize: 7888 });
  assert.equal(hook.certificateTableSize(pe32), 16080);
  assert.equal(hook.certificateTableSize(pe32plus), 7888);
});

test("an unsigned PE reports zero, and a non-PE reports null", () => {
  const root = mkdtempSync(join(tmpdir(), "sign-hook-"));
  const unsigned = join(root, "c.exe");
  writePe(unsigned, { certSize: 0 });
  assert.equal(hook.certificateTableSize(unsigned), 0);

  const notPe = join(root, "d.exe");
  writeFileSync(notPe, "just text, definitely not a PE");
  assert.equal(hook.certificateTableSize(notPe), null);
});

test("a truncated optional header is treated as unsigned, not as a crash", () => {
  const root = mkdtempSync(join(tmpdir(), "sign-hook-"));
  const odd = join(root, "e.exe");
  writePe(odd, { truncateOptional: true });
  assert.equal(hook.certificateTableSize(odd), 0);
});

test("skips a signed vendor binary", () => {
  const root = mkdtempSync(join(tmpdir(), "sign-hook-"));
  for (const kind of ["elevate", "openconsole"]) {
    const file = vendorPath(root, kind);
    writePe(file, { certSize: 9000 });
    assert.equal(hook.isAlreadySignedVendorBinary(file), true, kind);
  }
});

test("signs a vendor binary that arrives UNSIGNED", () => {
  // A vendor that stops signing its own helper must not slip through unsigned.
  const root = mkdtempSync(join(tmpdir(), "sign-hook-"));
  const file = vendorPath(root, "elevate");
  writePe(file, { certSize: 0 });
  assert.equal(hook.isAlreadySignedVendorBinary(file), false);
});

test("never skips our own executable, signed or not", () => {
  const root = mkdtempSync(join(tmpdir(), "sign-hook-"));
  const ours = join(root, "Redrob Cowork.exe");
  writePe(ours, { certSize: 16080 });
  assert.equal(hook.isAlreadySignedVendorBinary(ours), false);

  const installer = join(root, "redrob-win-x64-9.9.9.exe");
  writePe(installer, { certSize: 16080 });
  assert.equal(hook.isAlreadySignedVendorBinary(installer), false);
});

test("a same-named file outside the vendor directory is still signed", () => {
  // Matching on basename alone would let one of our own binaries be skipped.
  const root = mkdtempSync(join(tmpdir(), "sign-hook-"));
  const dir = join(root, "app");
  mkdirSync(dir, { recursive: true });
  const decoy = join(dir, "elevate.exe");
  writePe(decoy, { certSize: 16080 });
  assert.equal(hook.isAlreadySignedVendorBinary(decoy), false);
});

test("delegates to electron-builder's own signer for everything else", async () => {
  const root = mkdtempSync(join(tmpdir(), "sign-hook-"));
  const ours = join(root, "Redrob Cowork.exe");
  writePe(ours, { certSize: 0 });

  let delegated = 0;
  const packager = {
    signingManager: {
      value: Promise.resolve({
        doSign: async (configuration) => {
          assert.equal(configuration.path, ours);
          delegated += 1;
        },
      }),
    },
  };
  await hook({ path: ours }, packager);
  assert.equal(delegated, 1, "must call doSign rather than re-implementing signtool");
});

test("skipping does not touch the signer at all", async () => {
  const root = mkdtempSync(join(tmpdir(), "sign-hook-"));
  const file = vendorPath(root, "elevate");
  writePe(file, { certSize: 9000 });

  const packager = {
    signingManager: {
      get value() {
        throw new Error("the signer must not be resolved for a skipped file");
      },
    },
  };
  await hook({ path: file }, packager);
});

test("the build config asks for sha256 only, not the dual-sign default", () => {
  // electron-builder runs one signing pass per entry in signingHashAlgorithms,
  // so leaving the ["sha1","sha256"] default doubles every billed signature.
  const config = readFileSync(new URL("../electron-builder.base.yml", import.meta.url), "utf8");
  const win = config.slice(config.indexOf("\nwin:"));
  const block = win.slice(0, win.indexOf("\nnsis:"));
  assert.match(block, /signingHashAlgorithms:\s*\n\s*-\s*sha256/);
  assert.doesNotMatch(block, /-\s*sha1/, "sha1's trusted root expired in 2021");
  assert.match(block, /sign:\s*build\/sign-windows\.cjs/);
});

test("the hook counts what it signs and what it skips", async () => {
  const root = mkdtempSync(join(tmpdir(), "sign-hook-"));
  hook.tally.signed.length = 0;
  hook.tally.skipped.length = 0;

  const vendor = vendorPath(root, "elevate");
  writePe(vendor, { certSize: 9000 });
  const ours = join(root, "Redrob Cowork.exe");
  writePe(ours, { certSize: 0 });

  const packager = {
    signingManager: { value: Promise.resolve({ doSign: async () => {} }) },
  };
  await hook({ path: vendor }, packager);
  await hook({ path: ours }, packager);

  assert.deepEqual(hook.tally.signed, [ours]);
  assert.deepEqual(hook.tally.skipped, [vendor]);
});
