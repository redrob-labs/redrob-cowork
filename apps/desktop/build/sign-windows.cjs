"use strict";

/**
 * Windows code-signing hook.
 *
 * electron-builder signs EVERY `.exe` it packages -- `shouldSignFile` in
 * winPackager returns true for any path ending in `.exe`, and `signExts` can only
 * add or negate EXTENSIONS, never exclude an individual file. So each Windows
 * build re-signed three binaries we did not build and that already carry a valid
 * vendor signature:
 *
 *   resources/elevate.exe                        electron-builder's NSIS helper
 *   .../win32-x64/conpty/OpenConsole.exe         Microsoft ConPTY
 *   .../win32-arm64/conpty/OpenConsole.exe       Microsoft ConPTY
 *
 * Measured on the shipped 0.0.9 x64 installer: four binaries carried this
 * project's signature, identical 16080-byte certificate tables, and three of them
 * were those vendor files. Cloud code-signing services bill per signature, so
 * that is 3 wasted signatures per architecture, 6 per release, before a single
 * line of our own code is signed.
 *
 * Replacing Microsoft's signature on OpenConsole.exe with ours also gains
 * nothing: it is already trusted, and our signature says less about it than
 * Microsoft's does.
 *
 * The tradeoff, stated so it is a choice and not an accident: the packaged app
 * then contains binaries signed by more than one publisher. That is normal for
 * Electron apps -- the bundled DLLs are already Microsoft-signed, because
 * `signDlls` defaults to false -- but a policy that demands a single publisher
 * across every file in a package would need this disabled.
 *
 * Anything NOT on the vendor list, and any vendor file that arrives unsigned, is
 * signed normally by delegating to electron-builder's own signer, so there is no
 * second copy of the signtool argument logic to drift.
 */

const fs = require("fs");
const path = require("path");

/**
 * Vendor binaries we ship but do not build. Matched on basename plus a required
 * path fragment, so an executable of ours that happens to share a name is still
 * signed.
 */
const VENDOR_BINARIES = [
  { name: "elevate.exe", within: "resources" },
  { name: "OpenConsole.exe", within: "conpty" },
];

const CERT_TABLE_DIRECTORY_INDEX = 4;

/**
 * Size of the PE Certificate Table, i.e. whether the file is already signed.
 * Returns 0 for an unsigned PE and null when the file is not a PE at all.
 */
function certificateTableSize(file) {
  let handle;
  try {
    handle = fs.openSync(file, "r");
    const dos = Buffer.alloc(0x40);
    if (fs.readSync(handle, dos, 0, 0x40, 0) < 0x40) return null;
    if (dos.readUInt16LE(0) !== 0x5a4d) return null; // "MZ"

    const peOffset = dos.readUInt32LE(0x3c);
    const coff = Buffer.alloc(24);
    if (fs.readSync(handle, coff, 0, 24, peOffset) < 24) return null;
    if (coff.readUInt32LE(0) !== 0x00004550) return null; // "PE\0\0"

    const optionalHeaderSize = coff.readUInt16LE(20);
    if (optionalHeaderSize === 0) return 0;
    const optional = Buffer.alloc(optionalHeaderSize);
    const read = fs.readSync(handle, optional, 0, optionalHeaderSize, peOffset + 24);
    if (read < 2) return null;

    // Data directories begin at 96 in PE32 and 112 in PE32+.
    const magic = optional.readUInt16LE(0);
    const directoriesAt = magic === 0x20b ? 112 : 96;
    const entry = directoriesAt + CERT_TABLE_DIRECTORY_INDEX * 8;
    if (read < entry + 8) return 0;
    return optional.readUInt32LE(entry + 4);
  } catch {
    // An unreadable file is not something to decide about here; let the signer
    // deal with it.
    return null;
  } finally {
    if (handle !== undefined) {
      try {
        fs.closeSync(handle);
      } catch {
        /* nothing to do */
      }
    }
  }
}

/** Whether this path is a vendor binary that already carries a signature. */
function isAlreadySignedVendorBinary(file) {
  const base = path.basename(file);
  const normalized = file.split(path.sep).join("/");
  const match = VENDOR_BINARIES.find(
    (candidate) => candidate.name === base && normalized.includes(`/${candidate.within}/`),
  );
  if (!match) return false;
  const size = certificateTableSize(file);
  return typeof size === "number" && size > 0;
}

/**
 * Running totals for one build, printed on exit.
 *
 * The subscription tier is chosen on signatures per year, and that number is
 * `files × hashes × arches × apps × releases` -- every factor of which is easy
 * to get wrong by 2x. So the build reports what it actually did instead of
 * leaving the estimate to arithmetic.
 */
const tally = { signed: [], skipped: [] };
let exitHookInstalled = false;

function reportOnExit() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on("exit", () => {
    if (tally.signed.length === 0 && tally.skipped.length === 0) return;
    console.log(
      `\n  code signing: ${tally.signed.length} signature(s) consumed, ` +
        `${tally.skipped.length} skipped as already-signed vendor binaries`,
    );
    for (const file of tally.signed) console.log(`    signed  ${file}`);
    for (const file of tally.skipped) console.log(`    skipped ${file}`);
  });
}

module.exports = async function sign(configuration, packager) {
  reportOnExit();

  if (isAlreadySignedVendorBinary(configuration.path)) {
    tally.skipped.push(configuration.path);
    console.log(`  skipping already-signed vendor binary: ${configuration.path}`);
    return;
  }

  if (packager == null) {
    throw new Error("Windows sign hook was invoked without a packager to delegate to");
  }

  // One invocation is one billable signature, so count here rather than per file
  // -- the caller runs this hook once per entry in `signingHashAlgorithms`.
  tally.signed.push(configuration.path);

  // Delegate to electron-builder's own signer. `signFile` substitutes this hook
  // FOR `doSign`, so calling `doSign` here is the intended escape hatch and does
  // not re-enter this function.
  const manager = await packager.signingManager.value;
  await manager.doSign(configuration, packager);
};

module.exports.tally = tally;

module.exports.isAlreadySignedVendorBinary = isAlreadySignedVendorBinary;
module.exports.certificateTableSize = certificateTableSize;
module.exports.VENDOR_BINARIES = VENDOR_BINARIES;
