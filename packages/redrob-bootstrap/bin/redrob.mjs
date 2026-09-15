#!/usr/bin/env node
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { createHash, generateKeyPairSync } from "node:crypto"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const VERSION = "0.1.0"
// The installed command name. Keep it explicit so setup guides can distinguish
// bootstrap actions from other Redrob Cowork commands a user may already have.
const COMMAND_NAME = "redrob-bootstrap"
const DEFAULT_REDROB_MARKETPLACE_NAME = "Redrob Cowork Marketplace"
const executableBasename = () => (process.platform === "win32" ? `${COMMAND_NAME}.cmd` : COMMAND_NAME)
const here = dirname(fileURLToPath(import.meta.url))
const selfPath = fileURLToPath(import.meta.url)

function parseArgs(argv) {
  const positionals = []
  const flags = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith("--")) {
      positionals.push(arg)
      continue
    }

    const raw = arg.slice(2)
    const eq = raw.indexOf("=")
    if (eq >= 0) {
      flags.set(raw.slice(0, eq), raw.slice(eq + 1))
      continue
    }

    const next = argv[index + 1]
    if (next && !next.startsWith("--")) {
      flags.set(raw, next)
      index += 1
    } else {
      flags.set(raw, true)
    }
  }
  return { positionals, flags }
}

function getFlag(flags, name, fallback = undefined) {
  const value = flags.get(name)
  return value === undefined || value === true ? fallback : String(value)
}

function hasFlag(flags, name) {
  return flags.get(name) === true || flags.get(name) === "true"
}

function jsonOut(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2))
  } else if (value.message) {
    console.log(value.message)
  } else {
    console.log(JSON.stringify(value, null, 2))
  }
}

function printHelp() {
  console.log([
    "redrob-bootstrap",
    "",
    "Usage:",
    "  redrob-bootstrap install [--bin-dir <path>] [--install-dir <path>] [--source <path>] [--json]",
    "  redrob-bootstrap install app --manifest <url-or-file> [--app-dir <path>] [--json]",
    "  redrob-bootstrap doctor [--bin-dir <path>] [--install-dir <path>] [--desktop-bootstrap] [--json]",
    "",
    "Commands:",
    "  install          Install the redrob-bootstrap CLI into a user bin dir",
    "  install app      Download and install the desktop app from a manifest",
    "  doctor           Check the CLI and desktop app installation",
    "",
    "Options:",
    "  --json           Print machine-readable JSON",
    "  --version        Print version",
    "  --help           Show help",
  ].join("\n"))
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

function defaultInstallDir() {
  return process.env.REDROB_INSTALL_DIR || join(process.env.HOME || process.cwd(), ".redrob", "bootstrap")
}

function defaultBinDir() {
  return process.env.REDROB_BIN_DIR || join(process.env.HOME || process.cwd(), ".local", "bin")
}

function defaultAppDir() {
  return process.env.REDROB_APP_DIR || (process.platform === "darwin"
    ? join(process.env.HOME || process.cwd(), "Applications")
    : process.platform === "win32"
      ? join(process.env.LOCALAPPDATA || join(process.env.HOME || process.cwd(), "AppData", "Local"), "Redrob Cowork")
      : join(process.env.HOME || process.cwd(), ".local", "share", "redrob"))
}

function configHomeDir() {
  if (process.env.XDG_CONFIG_HOME) return process.env.XDG_CONFIG_HOME
  if (process.platform === "win32") {
    // Match the Electron shell (apps/desktop/electron/workspace-store.mjs):
    // LOCALAPPDATA, then the conventional Local dir — never ~/.config on Windows.
    if (process.env.LOCALAPPDATA) return process.env.LOCALAPPDATA
    return join(process.env.USERPROFILE || process.env.HOME || process.cwd(), "AppData", "Local")
  }
  return join(process.env.HOME || process.cwd(), ".config")
}

function defaultDesktopBootstrapPath() {
  return process.env.REDROB_DESKTOP_BOOTSTRAP_PATH || join(configHomeDir(), "redrob", "desktop-bootstrap.json")
}

function defaultSkillsDir() {
  return process.env.REDROB_SKILLS_DIR || join(configHomeDir(), "opencode", "skills")
}


// The desktop app's `desktop-bootstrap.json` `baseUrl` field is the WEB origin
// it opens in the user's browser for sign-in (e.g. for "Sign in" and claim
// links) - it is a different host than the API origin used for CLI/API calls
// (`--base-url`, `apiBaseUrl`). Reusing the API host here breaks sign-in: the
// browser opens `https://api.redrob.io/?mode=sign-in...` and shows raw
// API JSON instead of the sign-in page. Derive the correct web host instead
// of assuming it equals the API host.


function runInstall(args) {
  if (args.positionals[1] === "app") {
    return runInstallApp(args)
  }

  const installDir = resolve(getFlag(args.flags, "install-dir", defaultInstallDir()))
  const binDir = resolve(getFlag(args.flags, "bin-dir", defaultBinDir()))
  const source = resolve(getFlag(args.flags, "source", selfPath))
  const json = hasFlag(args.flags, "json")

  if (!existsSync(source)) {
    throw new Error(`source_not_found: ${source}`)
  }

  mkdirSync(installDir, { recursive: true })
  mkdirSync(binDir, { recursive: true })

  const installedCli = join(installDir, "redrob.mjs")
  copyFileSync(source, installedCli)
  chmodSync(installedCli, 0o755)

  const executable = join(binDir, executableBasename())
  if (process.platform === "win32") {
    writeFileSync(executable, `@echo off\r\nnode "${installedCli}" %*\r\n`)
  } else {
    writeFileSync(executable, `#!/usr/bin/env sh\nexec node "${installedCli}" "$@"\n`)
  }
  chmodSync(executable, 0o755)

  const manifest = {
    version: VERSION,
    installedAt: new Date().toISOString(),
    installDir,
    binDir,
    executable,
    cli: installedCli,
  }
  writeFileSync(join(installDir, "install.json"), JSON.stringify(manifest, null, 2))

  jsonOut({ ok: true, message: `Redrob Cowork CLI installed at ${executable}`, install: manifest }, json)
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex")
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value)
}

function filePathFromUrl(value) {
  if (value.startsWith("file://")) {
    return fileURLToPath(value)
  }
  return resolve(value)
}

async function readJsonLocation(location) {
  if (isHttpUrl(location)) {
    const response = await fetch(location)
    if (!response.ok) throw new Error(`manifest_fetch_failed: ${response.status}`)
    return response.json()
  }
  return JSON.parse(readFileSync(filePathFromUrl(location), "utf8"))
}

async function downloadArtifact(url, destination) {
  if (isHttpUrl(url)) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`artifact_download_failed: ${response.status}`)
    writeFileSync(destination, Buffer.from(await response.arrayBuffer()))
    return
  }
  copyFileSync(filePathFromUrl(url), destination)
}

function selectArtifact(manifest) {
  const platform = process.platform
  const arch = process.arch
  const candidates = [
    manifest.artifacts?.[platform]?.[arch],
    manifest.artifacts?.[`${platform}-${arch}`],
    manifest.artifacts?.[platform],
    Array.isArray(manifest.artifacts) ? manifest.artifacts.find((artifact) => artifact.platform === platform && (!artifact.arch || artifact.arch === arch)) : null,
  ].filter(Boolean)
  const artifact = candidates[0]
  if (!artifact?.url) throw new Error(`no_artifact_for_platform: ${platform}-${arch}`)
  return { ...artifact, platform, arch }
}

function inferArtifactType(url) {
  const lower = url.toLowerCase()
  if (lower.endsWith(".dmg")) return "dmg"
  if (lower.endsWith(".zip")) return "zip"
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz"
  if (lower.endsWith(".appimage")) return "appimage"
  if (lower.endsWith(".exe")) return "exe"
  if (lower.endsWith(".msi")) return "msi"
  return null
}

function defaultInstalledName(type, manifest, artifact) {
  if (artifact.appName || manifest.appName) return artifact.appName || manifest.appName
  if (type === "dmg") return "Redrob Cowork.app"
  if (type === "appimage") return "Redrob Cowork.AppImage"
  if (type === "exe") return "Redrob Cowork.exe"
  if (type === "msi") return "Redrob Cowork.msi"
  if (process.platform === "darwin") return "Redrob Cowork.app"
  if (process.platform === "win32") return "Redrob Cowork.exe"
  return "redrob"
}

function findInstallCandidate(root, expectedName) {
  const direct = join(root, expectedName)
  if (existsSync(direct)) return direct

  const queue = [root]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.name === expectedName) return path
      if (entry.isDirectory()) queue.push(path)
    }
  }
  throw new Error(`app_not_found_in_archive: ${expectedName}`)
}

// Copy an installed artifact into place. macOS .app bundles contain internal
// framework symlinks (e.g. Versions/Current, the framework binary/Resources
// links) that a naive recursive copy can break — leaving dangling links into a
// now-unmounted DMG, which makes Gatekeeper report the app as "damaged". Use
// `ditto` on macOS, which is the Apple-supported way to copy bundles while
// preserving relative symlinks and the code signature.
function copyArtifact(source, target) {
  if (process.platform === "darwin") {
    try {
      execFileSync("ditto", [source, target], { stdio: "pipe" })
    } catch {
      // Fall back to cp -R (also preserves bundle symlinks) before giving up.
      execFileSync("cp", ["-R", source, target], { stdio: "pipe" })
    }
    // Remove the quarantine flag so Gatekeeper does not block the freshly
    // installed (already-notarized) app on first launch. Best-effort.
    try {
      execFileSync("xattr", ["-dr", "com.apple.quarantine", target], { stdio: "pipe" })
    } catch {}
    return
  }
  cpSync(source, target, { recursive: true })
}

function installFromDirectory(input) {
  const source = findInstallCandidate(input.sourceDir, input.appName)
  mkdirSync(input.appDir, { recursive: true })
  const target = join(input.appDir, input.appName)
  rmSync(target, { recursive: true, force: true })
  copyArtifact(source, target)
  if (input.executable) chmodSync(target, 0o755)
  return target
}

function installDmg(input) {
  if (process.platform !== "darwin") {
    throw new Error("dmg_install_requires_macos")
  }

  const mountPoint = join(input.workDir, "mount")
  mkdirSync(mountPoint, { recursive: true })
  let mounted = false
  try {
    execFileSync("hdiutil", ["attach", input.artifactPath, "-nobrowse", "-readonly", "-mountpoint", mountPoint], { stdio: "pipe" })
    mounted = true
    const appName = input.appName || "Redrob Cowork.app"
    const sourceApp = join(mountPoint, appName)
    if (!existsSync(sourceApp)) {
      throw new Error(`app_not_found_in_dmg: ${appName}`)
    }
    mkdirSync(input.appDir, { recursive: true })
    const targetApp = join(input.appDir, appName)
    rmSync(targetApp, { recursive: true, force: true })
    copyArtifact(sourceApp, targetApp)
    return targetApp
  } finally {
    if (mounted) {
      try {
        execFileSync("hdiutil", ["detach", mountPoint, "-quiet"], { stdio: "pipe" })
      } catch {
        execFileSync("hdiutil", ["detach", mountPoint, "-force", "-quiet"], { stdio: "pipe" })
      }
    }
  }
}

function installZip(input) {
  const extractDir = join(input.workDir, "zip")
  mkdirSync(extractDir, { recursive: true })
  if (process.platform === "win32") {
    execFileSync("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath ${JSON.stringify(input.artifactPath)} -DestinationPath ${JSON.stringify(extractDir)} -Force`], { stdio: "pipe" })
  } else if (process.platform === "darwin") {
    execFileSync("ditto", ["-x", "-k", input.artifactPath, extractDir], { stdio: "pipe" })
  } else {
    execFileSync("unzip", ["-q", input.artifactPath, "-d", extractDir], { stdio: "pipe" })
  }
  return installFromDirectory({ ...input, sourceDir: extractDir })
}

function installTarGz(input) {
  const extractDir = join(input.workDir, "tar")
  mkdirSync(extractDir, { recursive: true })
  execFileSync("tar", ["-xzf", input.artifactPath, "-C", extractDir], { stdio: "pipe" })
  return installFromDirectory({ ...input, sourceDir: extractDir })
}

function installSingleFile(input) {
  mkdirSync(input.appDir, { recursive: true })
  const target = join(input.appDir, input.appName)
  rmSync(target, { force: true })
  copyFileSync(input.artifactPath, target)
  if (input.executable) chmodSync(target, 0o755)
  return target
}

async function runInstallApp(args) {
  const json = hasFlag(args.flags, "json")
  const manifestLocation = getFlag(args.flags, "manifest") || process.env.REDROB_INSTALL_MANIFEST
  if (!manifestLocation) throw new Error("missing_required_flag: --manifest")

  const appDir = resolve(getFlag(args.flags, "app-dir", defaultAppDir()))
  const workDir = join(tmpdir(), `redrob-app-install-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(workDir, { recursive: true })

  try {
    const manifest = await readJsonLocation(manifestLocation)
    const artifact = selectArtifact(manifest)
    const type = artifact.type || inferArtifactType(artifact.url)
    if (!type) throw new Error("unsupported_app_artifact_type: unknown")

    const artifactPath = join(workDir, artifact.fileName || "Redrob Cowork.dmg")
    await downloadArtifact(artifact.url, artifactPath)
    const digest = sha256(readFileSync(artifactPath))
    if (artifact.sha256 && digest !== artifact.sha256) {
      throw new Error(`checksum_mismatch: expected ${artifact.sha256} got ${digest}`)
    }

    const appName = defaultInstalledName(type, manifest, artifact)
    const appPath = type === "dmg"
      ? installDmg({ artifactPath, workDir, appDir, appName })
      : type === "zip"
        ? installZip({ artifactPath, workDir, appDir, appName, executable: !appName.endsWith(".app") && process.platform !== "win32" })
        : type === "tar.gz"
          ? installTarGz({ artifactPath, workDir, appDir, appName, executable: process.platform !== "win32" })
          : type === "appimage"
            ? installSingleFile({ artifactPath, appDir, appName, executable: true })
            : type === "exe" || type === "msi"
              ? installSingleFile({ artifactPath, appDir, appName, executable: false })
              : (() => { throw new Error(`unsupported_app_artifact_type: ${type}`) })()

    const install = {
      version: manifest.version || artifact.version || null,
      installedAt: new Date().toISOString(),
      appDir,
      appPath,
      manifest: manifestLocation,
      artifact: {
        type,
        url: artifact.url,
        sha256: digest,
        platform: artifact.platform,
        arch: artifact.arch,
      },
    }
    mkdirSync(dirname(appPath), { recursive: true })
    writeFileSync(join(appDir, "redrob-app-install.json"), JSON.stringify(install, null, 2))
    jsonOut({ ok: true, message: `Redrob Cowork app installed at ${appPath}`, install }, json)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

async function runDoctor(args) {
  const installDir = resolve(getFlag(args.flags, "install-dir", defaultInstallDir()))
  const binDir = resolve(getFlag(args.flags, "bin-dir", defaultBinDir()))
  const baseUrl = getFlag(args.flags, "base-url")
  const appDir = resolve(getFlag(args.flags, "app-dir", defaultAppDir()))
  const desktopBootstrapPath = resolve(getFlag(args.flags, "desktop-bootstrap-path", defaultDesktopBootstrapPath()))
  const json = hasFlag(args.flags, "json")
  const checks = []

  checks.push({ name: "node", ok: Number(process.versions.node.split(".")[0]) >= 20, value: process.versions.node })
  checks.push({ name: "installDir", ok: existsSync(installDir), value: installDir })
  checks.push({ name: "binDir", ok: existsSync(binDir), value: binDir })

  const executable = join(binDir, executableBasename())
  const executableOk = existsSync(executable) && statSync(executable).isFile()
  checks.push({ name: "redrobExecutable", ok: executableOk, value: executable })

  const manifestPath = join(installDir, "install.json")
  let manifest = null
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    checks.push({ name: "manifest", ok: true, value: manifestPath })
  } else {
    checks.push({ name: "manifest", ok: false, value: manifestPath })
  }

  if (baseUrl) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`)
      const body = await response.json().catch(() => null)
      checks.push({ name: "denApiHealth", ok: response.ok && body?.ok === true, value: { status: response.status, body } })
    } catch (error) {
      checks.push({ name: "denApiHealth", ok: false, value: error instanceof Error ? error.message : String(error) })
    }
  }

  if (hasFlag(args.flags, "app") || args.flags.has("app-dir")) {
    const appManifest = join(appDir, "redrob-app-install.json")
    let appPath = process.platform === "darwin"
      ? join(appDir, "Redrob Cowork.app")
      : process.platform === "win32"
        ? join(appDir, "Redrob Cowork.exe")
        : join(appDir, "redrob")
    if (existsSync(appManifest)) {
      try {
        const appInstall = JSON.parse(readFileSync(appManifest, "utf8"))
        if (appInstall.appPath) appPath = appInstall.appPath
      } catch {
        // Keep fallback path.
      }
    }
    checks.push({ name: "redrobApp", ok: existsSync(appPath), value: appPath })
    checks.push({ name: "appInstallManifest", ok: existsSync(appManifest), value: appManifest })
  }

  const ok = checks.every((check) => check.ok)
  jsonOut({ ok, message: ok ? "Redrob Cowork doctor: ok" : "Redrob Cowork doctor: failed", version: VERSION, manifest, checks }, json)
  if (!ok) process.exitCode = 1
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (hasFlag(args.flags, "help") || args.positionals[0] === "help") {
    printHelp()
    return
  }
  if (hasFlag(args.flags, "version")) {
    console.log(VERSION)
    return
  }

  const command = args.positionals[0] || "help"
  if (command === "install") {
    runInstall(args)
    return
  }
  if (command === "doctor") {
    await runDoctor(args)
    return
  }

  printHelp()
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
