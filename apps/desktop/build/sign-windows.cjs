"use strict";

/**
 * Windows code-signing hook for electron-builder (`win.sign`).
 *
 * Nothing is signed here. The ONE copy of the redrob-labs Windows signing
 * recipe -- Azure Artifact Signing over OpenID Connect, then the full
 * Authenticode verification (Status Valid, signer McKinley Rice, Inc.) -- lives in
 * redrob-labs/.github at `actions/sign-windows/sign.ps1`. The release workflow
 * checks that repository out at `.redrob-shared` and this hook hands every file
 * electron-builder wants signed (the NSIS uninstaller and installer; on a full
 * build also the app executable) to that script, so there is no fork of the
 * recipe in this repository.
 *
 * Environment:
 *
 *   ARTIFACT_SIGNING_ENDPOINT
 *   ARTIFACT_SIGNING_ACCOUNT        plain identifiers, read by sign.ps1. With
 *   ARTIFACT_SIGNING_CERT_PROFILE   all three unset the hook warns once and
 *                                   leaves the files unsigned, so a local build
 *                                   still produces output; a partial set is an
 *                                   error. The credential is the `az login`
 *                                   done by `azure/login` right before packaging.
 *   REDROB_SHARED_DIR               where redrob-labs/.github is checked out;
 *                                   default `<repository root>/.redrob-shared`.
 *   POWERSHELL                      the PowerShell to run; default `pwsh`,
 *                                   falling back to `powershell`.
 *
 * The release workflow verifies every shipped installer independently of this
 * hook, so an unsigned release cannot slip through on a missing variable.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SIGNING_ENV = ["ARTIFACT_SIGNING_ENDPOINT", "ARTIFACT_SIGNING_ACCOUNT", "ARTIFACT_SIGNING_CERT_PROFILE"];
const SHARED_DIR_ENV = "REDROB_SHARED_DIR";
const SHARED_DIR_DEFAULT = ".redrob-shared";
const SIGN_SCRIPT = ["actions", "sign-windows", "sign.ps1"];
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function isSet(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Whether Artifact Signing is configured: false when none of the three
 * variables is set, true when all are, an error in between.
 */
function signingConfigured(env = process.env) {
  const present = SIGNING_ENV.filter((name) => isSet(env[name]));
  if (present.length === 0) return false;
  if (present.length < SIGNING_ENV.length) {
    const missing = SIGNING_ENV.filter((name) => !isSet(env[name]));
    throw new Error(`Artifact Signing is half-configured; missing: ${missing.join(", ")}`);
  }
  return true;
}

/** The shared signing script, from the redrob-labs/.github checkout. */
function sharedSignScript(env = process.env, repoRoot = REPO_ROOT) {
  const dir = isSet(env[SHARED_DIR_ENV]) ? env[SHARED_DIR_ENV] : path.join(repoRoot, SHARED_DIR_DEFAULT);
  const script = path.join(dir, ...SIGN_SCRIPT);
  if (!fs.existsSync(script)) {
    throw new Error(
      `shared signing recipe not found at ${script}; check out redrob-labs/.github at ` +
        `${SHARED_DIR_DEFAULT} (or point ${SHARED_DIR_ENV} at the checkout)`,
    );
  }
  return script;
}

/** The PowerShell invocation that signs and verifies `files` through the shared script. */
function signCommand(files, { script, name, site, env = process.env } = {}) {
  const childEnv = { ...env };
  if (isSet(name)) childEnv.SIGN_DESCRIPTION = name;
  if (isSet(site)) childEnv.SIGN_URL = site;
  return {
    command: isSet(env.POWERSHELL) ? env.POWERSHELL : "pwsh",
    args: ["-NoProfile", "-NonInteractive", "-File", script, ...files],
    env: childEnv,
  };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  return { status: result.status };
}

function warn(message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::${message}`);
  else console.warn(message);
}

let warnedUnconfigured = false;

/**
 * Sign `files` with the shared recipe. Returns "signed" or "unsigned" (the
 * latter only when Artifact Signing is not configured at all). `deps` is for
 * tests.
 */
function sign(files, { name, site } = {}, deps = {}) {
  const env = deps.env || process.env;
  const run = deps.run || runCommand;
  const log = deps.log || console.log;
  const list = Array.isArray(files) ? files : [files];
  if (list.length === 0) throw new Error("no files to sign");

  if (!signingConfigured(env)) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      warn(`Artifact Signing not configured (${SIGNING_ENV.join(", ")} unset): leaving Windows binaries unsigned`);
    }
    return "unsigned";
  }

  const script = sharedSignScript(env, deps.repoRoot);
  const { command, args, env: childEnv } = signCommand(list, { script, name, site, env });
  log(`Signing through ${script}: ${list.join(", ")}`);
  let result;
  try {
    result = run(command, args, { env: childEnv });
  } catch (error) {
    if (error.code !== "ENOENT" || command !== "pwsh") throw error;
    result = run("powershell", args, { env: childEnv });
  }
  if (result.status !== 0) {
    throw new Error(`${path.basename(script)} failed for ${list.join(", ")} (exit ${result.status})`);
  }
  return "signed";
}

/** The electron-builder `sign` hook. */
module.exports = async function hook(configuration) {
  sign([configuration.path], { name: configuration.name, site: configuration.site });
};

module.exports.SIGNING_ENV = SIGNING_ENV;
module.exports.SHARED_DIR_ENV = SHARED_DIR_ENV;
module.exports.SHARED_DIR_DEFAULT = SHARED_DIR_DEFAULT;
module.exports.SIGN_SCRIPT = SIGN_SCRIPT;
module.exports.signingConfigured = signingConfigured;
module.exports.sharedSignScript = sharedSignScript;
module.exports.signCommand = signCommand;
module.exports.sign = sign;
