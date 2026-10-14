"use strict";

/**
 * Windows code-signing hook: Azure Artifact Signing over OpenID Connect.
 *
 * electron-builder calls this for every file it would sign (the app
 * executable, the NSIS uninstaller and installer). The hook runs signtool with
 * the Azure.CodeSigning dlib from the Microsoft.ArtifactSigning.Client NuGet
 * package. The dlib authenticates with DefaultAzureCredential, so the credential
 * is whatever `az login` left behind: in CI the `azure/login` step that exchanged
 * the job's OIDC token, on a developer machine a plain `az login`. There is no
 * certificate file, no password and no client secret anywhere in this path.
 *
 * Configuration is three environment variables, all plain identifiers:
 *
 *   ARTIFACT_SIGNING_ENDPOINT       https://<region>.codesigning.azure.net
 *   ARTIFACT_SIGNING_ACCOUNT        the Artifact Signing account name
 *   ARTIFACT_SIGNING_CERT_PROFILE   the certificate profile name
 *
 * With all three unset the hook warns once and leaves the files unsigned, so a
 * local or unpacked build still produces output. The release workflow verifies
 * every shipped installer independently, so an unsigned release cannot slip
 * through on a missing variable. A partial set is an error.
 *
 * Every signature is verified right after it is written: `signtool verify /pa`
 * (the full Authenticode policy, which a Public Trust certificate must pass) and
 * Get-AuthenticodeSignature Status 'Valid'. Anything less fails the build.
 *
 * Vendor binaries we ship but do not build are skipped when they already carry
 * a signature. `shouldSignFile` in electron-builder's winPackager returns true
 * for any `.exe`, and `signExts` can only add or negate EXTENSIONS, so without
 * this each Windows build re-signed three binaries with valid vendor signatures:
 *
 *   resources/elevate.exe                        electron-builder's NSIS helper
 *   .../win32-x64/conpty/OpenConsole.exe         Microsoft ConPTY
 *   .../win32-arm64/conpty/OpenConsole.exe       Microsoft ConPTY
 *
 * Cloud signing bills per signature, so that was 3 wasted signatures per
 * architecture before a line of our own code was signed. Replacing Microsoft's
 * signature on OpenConsole.exe with ours also says less about it than theirs.
 * The packaged app therefore contains binaries from more than one publisher,
 * which is normal for Electron (the bundled DLLs are already Microsoft-signed).
 *
 * Also runnable directly, which the release workflow uses to sign the unpacked
 * app right after `az login`, before packaging:
 *
 *   node build/sign-windows.cjs --app-dir dist-electron/win-unpacked \
 *     [--name "Redrob Cowork"] [--site https://github.com/redrob-labs/redrob-cowork]
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SIGNING_ENV = {
  endpoint: "ARTIFACT_SIGNING_ENDPOINT",
  account: "ARTIFACT_SIGNING_ACCOUNT",
  profile: "ARTIFACT_SIGNING_CERT_PROFILE",
};

/**
 * Only the credentials a CI runner or a developer shell can satisfy. Without
 * this list a missing login falls through to InteractiveBrowserCredential, which
 * opens a browser nobody sees and waits forever. With it, a missing login fails
 * in seconds.
 */
const EXCLUDE_CREDENTIALS = [
  "InteractiveBrowserCredential",
  "ManagedIdentityCredential",
  "SharedTokenCacheCredential",
  "VisualStudioCredential",
  "VisualStudioCodeCredential",
  "AzurePowerShellCredential",
  "AzureDeveloperCliCredential",
  "WorkloadIdentityCredential",
];

const CLIENT_PACKAGE_URL = "https://www.nuget.org/api/v2/package/Microsoft.ArtifactSigning.Client";
const DEFAULT_TIMESTAMP_URL = "http://timestamp.acs.microsoft.com";
const SIGN_ATTEMPTS = 3;

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
 * The Artifact Signing configuration from the environment: null when none of
 * the three variables is set, the three values when all are, an error between.
 */
function signingConfig(env = process.env) {
  const present = Object.entries(SIGNING_ENV).filter(([, name]) => isSet(env[name]));
  if (present.length === 0) return null;
  if (present.length < Object.keys(SIGNING_ENV).length) {
    const missing = Object.values(SIGNING_ENV).filter((name) => !isSet(env[name]));
    throw new Error(`Artifact Signing is half-configured; missing: ${missing.join(", ")}`);
  }
  return {
    endpoint: env[SIGNING_ENV.endpoint].trim().replace(/\/+$/, ""),
    account: env[SIGNING_ENV.account].trim(),
    profile: env[SIGNING_ENV.profile].trim(),
  };
}

function isSet(value) {
  return typeof value === "string" && value.trim() !== "";
}

/** The signtool dlib metadata file (`/dmdf`) for a configuration. */
function metadataFor(config) {
  return {
    Endpoint: config.endpoint,
    CodeSigningAccountName: config.account,
    CertificateProfileName: config.profile,
    ExcludeCredentials: [...EXCLUDE_CREDENTIALS],
  };
}

/**
 * signtool.exe: SIGNTOOL when set, else the newest x64 one in the Windows Kits.
 * `/dlib` needs a Windows 11 SDK signtool, which is why the bundled one that
 * electron-builder downloads is not used.
 */
function findSignTool(env = process.env, kitsRoot) {
  if (isSet(env.SIGNTOOL)) return env.SIGNTOOL;
  const root = kitsRoot || path.join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
  let versions = [];
  try {
    versions = fs.readdirSync(root).filter((entry) => /^10\.\d+\.\d+\.\d+$/.test(entry));
  } catch {
    versions = [];
  }
  versions.sort((a, b) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
    return 0;
  });
  for (const version of versions) {
    const candidate = path.join(root, version, "x64", "signtool.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`signtool.exe not found under ${root}; install the Windows SDK or set SIGNTOOL`);
}

/** Find the x64 Azure.CodeSigning.Dlib.dll inside an extracted client package. */
function findDlib(dir) {
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name === "Azure.CodeSigning.Dlib.dll" && /[\\/]x64[\\/]/.test(full)) {
        return full;
      }
    }
  }
  throw new Error(`Azure.CodeSigning.Dlib.dll (x64) not found under ${dir}`);
}

/**
 * Download and unpack Microsoft.ArtifactSigning.Client once per process and
 * write the metadata file. ARTIFACT_SIGNING_DLIB points at an already-extracted
 * dlib and skips the download.
 */
async function prepareClient(config, { env = process.env, dir, fetchImpl = fetch, run = runCommand } = {}) {
  const workDir = dir || fs.mkdtempSync(path.join(os.tmpdir(), "redrob-cowork-sign-"));
  fs.mkdirSync(workDir, { recursive: true });

  let dlib = isSet(env.ARTIFACT_SIGNING_DLIB) ? env.ARTIFACT_SIGNING_DLIB : null;
  if (dlib == null) {
    const archive = path.join(workDir, "artifact-signing-client.zip");
    const response = await fetchImpl(CLIENT_PACKAGE_URL);
    if (!response.ok) {
      throw new Error(`downloading Microsoft.ArtifactSigning.Client failed: HTTP ${response.status}`);
    }
    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    const clientDir = path.join(workDir, "client");
    fs.mkdirSync(clientDir, { recursive: true });
    // A .nupkg is a zip, saved under a .zip name because Expand-Archive insists
    // on the extension. PowerShell rather than `tar`: inside a Git-bash step the
    // tar on PATH is GNU tar, which does not read zip archives and failed here
    // silently once.
    extractZip(archive, clientDir, run, env);
    dlib = findDlib(clientDir);
  }

  const metadata = path.join(workDir, "metadata.json");
  fs.writeFileSync(metadata, JSON.stringify(metadataFor(config), null, 2) + "\n");
  return { dlib, metadata, dir: workDir };
}

/** The signtool arguments for one file. */
function signToolArgs({ file, dlib, metadata, name, site, timestampUrl = DEFAULT_TIMESTAMP_URL }) {
  const args = ["sign", "/v", "/fd", "SHA256", "/td", "SHA256", "/tr", timestampUrl, "/dlib", dlib, "/dmdf", metadata];
  if (name) args.push("/d", name);
  if (site) args.push("/du", site);
  args.push(file);
  return args;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function runPowerShell(script, run, env = process.env) {
  const args = ["-NoProfile", "-NonInteractive", "-Command", script];
  let result;
  try {
    result = run(isSet(env.POWERSHELL) ? env.POWERSHELL : "pwsh", args);
  } catch (error) {
    if (error.code !== "ENOENT" || isSet(env.POWERSHELL)) throw error;
    result = run("powershell", args);
  }
  if (result.status !== 0) {
    throw new Error(`PowerShell failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result;
}

function powerShellJson(script, run, env = process.env) {
  return JSON.parse(runPowerShell(script, run, env).stdout.trim());
}

function psLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Unpack a zip with Expand-Archive; throws when the extraction fails. */
function extractZip(archive, destination, run = runCommand, env = process.env) {
  runPowerShell(
    `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath ${psLiteral(archive)} -DestinationPath ${psLiteral(destination)} -Force`,
    run,
    env,
  );
}

/**
 * Full verification of one signed file. Prints `<file> signed by <Subject>` and
 * returns the subject; throws on anything but a Valid Public-Trust signature.
 */
function verifySignature(file, { signtool, run = runCommand, env = process.env, log = console.log } = {}) {
  const verify = run(signtool, ["verify", "/pa", "/v", file]);
  if (verify.status !== 0) {
    throw new Error(`signtool verify /pa failed for ${file} (${verify.status}): ${verify.stderr || verify.stdout}`);
  }
  const literal = file.replace(/'/g, "''");
  const signature = powerShellJson(
    `$s = Get-AuthenticodeSignature -LiteralPath '${literal}'; ` +
      "@{ Status = $s.Status.ToString(); StatusMessage = $s.StatusMessage; " +
      "Subject = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { $null } } | ConvertTo-Json -Compress",
    run,
    env,
  );
  if (signature.Status !== "Valid") {
    throw new Error(`${file} signature status ${signature.Status}: ${signature.StatusMessage}`);
  }
  if (!signature.Subject) {
    throw new Error(`${file} has no signer certificate`);
  }
  log(`${file} signed by ${signature.Subject}`);
  return signature.Subject;
}

/**
 * Running totals for one build, printed on exit.
 *
 * The subscription tier is chosen on signatures per year, and that number is
 * `files × hashes × arches × apps × releases` -- every factor of which is easy
 * to get wrong by 2x. So the build reports what it actually did instead of
 * leaving the estimate to arithmetic.
 */
const tally = { signed: [], skipped: [], unsigned: [] };
let exitHookInstalled = false;

function reportOnExit() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on("exit", () => {
    if (tally.signed.length === 0 && tally.skipped.length === 0 && tally.unsigned.length === 0) return;
    console.log(
      `\n  code signing: ${tally.signed.length} signature(s) consumed, ` +
        `${tally.skipped.length} skipped as already-signed vendor binaries, ` +
        `${tally.unsigned.length} left unsigned`,
    );
    for (const file of tally.signed) console.log(`    signed   ${file}`);
    for (const file of tally.skipped) console.log(`    skipped  ${file}`);
    for (const file of tally.unsigned) console.log(`    unsigned ${file}`);
  });
}

function warn(message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${message}`);
  else console.warn(message);
}

/**
 * The signer for one process: configuration, client package and signtool are
 * resolved once and reused for every file. `deps` is for tests.
 */
function createSigner(deps = {}) {
  const env = deps.env || process.env;
  const run = deps.run || runCommand;
  const log = deps.log || console.log;
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let warnedUnconfigured = false;
  let prepared = null;

  async function prepare() {
    if (prepared == null) {
      const config = signingConfig(env);
      if (config == null) {
        prepared = Promise.resolve(null);
      } else {
        prepared = (async () => {
          const signtool = findSignTool(env, deps.kitsRoot);
          const client = await prepareClient(config, { env, dir: deps.dir, fetchImpl: deps.fetchImpl, run });
          log(`Signing with Azure Artifact Signing (${config.account} / ${config.profile}) via ${signtool}`);
          return { ...client, signtool, timestampUrl: isSet(env.WINDOWS_TIMESTAMP_URL) ? env.WINDOWS_TIMESTAMP_URL : DEFAULT_TIMESTAMP_URL };
        })();
      }
    }
    return prepared;
  }

  /** Sign one file. Returns 'signed', 'skipped' or 'unsigned'. */
  async function sign(file, { name, site } = {}) {
    if (isAlreadySignedVendorBinary(file)) {
      tally.skipped.push(file);
      log(`  skipping already-signed vendor binary: ${file}`);
      return "skipped";
    }

    const client = await prepare();
    if (client == null) {
      if (!warnedUnconfigured) {
        warnedUnconfigured = true;
        warn(`Artifact Signing not configured (${Object.values(SIGNING_ENV).join(", ")} unset): leaving Windows binaries unsigned`);
      }
      tally.unsigned.push(file);
      return "unsigned";
    }

    const args = signToolArgs({ file, dlib: client.dlib, metadata: client.metadata, name, site, timestampUrl: client.timestampUrl });
    // One signature is one billable operation, and the service is remote: retry
    // a transport failure, but do not sign the same file twice on success.
    for (let attempt = 1; ; attempt++) {
      const result = run(client.signtool, args);
      if (result.status === 0) break;
      if (attempt >= SIGN_ATTEMPTS) {
        throw new Error(`signtool sign failed for ${file} after ${attempt} attempts (${result.status}): ${result.stderr || result.stdout}`);
      }
      warn(`signtool sign failed for ${file} (attempt ${attempt}/${SIGN_ATTEMPTS}): ${(result.stderr || result.stdout).trim()}`);
      await sleep(10_000 * attempt);
    }
    verifySignature(file, { signtool: client.signtool, run, env, log });
    tally.signed.push(file);
    return "signed";
  }

  return { sign, prepare };
}

let defaultSigner = null;
function signer() {
  if (defaultSigner == null) defaultSigner = createSigner();
  return defaultSigner;
}

/**
 * The files electron-builder's winPackager.signApp would sign in an unpacked
 * app: every `.exe` at the top level and every `.exe` under
 * resources/app.asar.unpacked. DLLs are not signed (electron-builder's
 * `signDlls` default), matching what the packager does.
 */
function collectSignableFiles(appDir) {
  const files = [];
  for (const entry of fs.readdirSync(appDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) files.push(path.join(appDir, entry.name));
  }
  const unpacked = path.join(appDir, "resources", "app.asar.unpacked");
  if (fs.existsSync(unpacked)) {
    const stack = [unpacked];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) files.push(full);
      }
    }
  }
  return files.sort();
}

/** The electron-builder `sign` hook. */
module.exports = async function sign(configuration) {
  reportOnExit();
  await signer().sign(configuration.path, { name: configuration.name, site: configuration.site });
};

function parseArgs(argv) {
  const options = { appDir: null, name: null, site: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--app-dir") options.appDir = argv[++i];
    else if (arg === "--name") options.name = argv[++i];
    else if (arg === "--site") options.site = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.appDir) throw new Error("usage: sign-windows.cjs --app-dir <unpacked app dir> [--name <product>] [--site <url>]");
  return options;
}

async function main(argv) {
  const options = parseArgs(argv);
  const appDir = path.resolve(options.appDir);
  if (!fs.existsSync(appDir)) throw new Error(`no such directory: ${appDir}`);
  reportOnExit();
  const files = collectSignableFiles(appDir);
  if (files.length === 0) throw new Error(`no executables to sign under ${appDir}`);
  for (const file of files) {
    await signer().sign(file, { name: options.name, site: options.site });
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports.tally = tally;
module.exports.isAlreadySignedVendorBinary = isAlreadySignedVendorBinary;
module.exports.certificateTableSize = certificateTableSize;
module.exports.VENDOR_BINARIES = VENDOR_BINARIES;
module.exports.SIGNING_ENV = SIGNING_ENV;
module.exports.EXCLUDE_CREDENTIALS = EXCLUDE_CREDENTIALS;
module.exports.CLIENT_PACKAGE_URL = CLIENT_PACKAGE_URL;
module.exports.DEFAULT_TIMESTAMP_URL = DEFAULT_TIMESTAMP_URL;
module.exports.signingConfig = signingConfig;
module.exports.metadataFor = metadataFor;
module.exports.findSignTool = findSignTool;
module.exports.findDlib = findDlib;
module.exports.extractZip = extractZip;
module.exports.prepareClient = prepareClient;
module.exports.signToolArgs = signToolArgs;
module.exports.verifySignature = verifySignature;
module.exports.createSigner = createSigner;
module.exports.collectSignableFiles = collectSignableFiles;
module.exports.parseArgs = parseArgs;
