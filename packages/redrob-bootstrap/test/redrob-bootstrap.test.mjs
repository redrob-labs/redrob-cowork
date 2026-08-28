import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import assert from "node:assert/strict"

const root = fileURLToPath(new URL("..", import.meta.url))
const cli = join(root, "bin", "redrob.mjs")
const temp = mkdtempSync(join(tmpdir(), "redrob-bootstrap-test-"))

try {
  const installDir = join(temp, "install")
  const binDir = join(temp, "bin")
  const install = spawnSync(process.execPath, [cli, "install", "--install-dir", installDir, "--bin-dir", binDir, "--json"], {
    encoding: "utf8",
  })
  assert.equal(install.status, 0, install.stderr)
  const installJson = JSON.parse(install.stdout)
  assert.equal(installJson.ok, true)
  const executableName = process.platform === "win32" ? "redrob-bootstrap.cmd" : "redrob-bootstrap"
  assert.equal(installJson.install.executable, join(binDir, executableName))

  const doctor = spawnSync(process.execPath, [cli, "doctor", "--install-dir", installDir, "--bin-dir", binDir, "--json"], {
    encoding: "utf8",
  })
  assert.equal(doctor.status, 0, doctor.stderr)
  const doctorJson = JSON.parse(doctor.stdout)
  assert.equal(doctorJson.ok, true)
  assert.equal(doctorJson.checks.every((check) => check.ok), true)

  // The CLI only installs and checks a local install; it must not advertise or
  // accept any control-plane command.
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" })
  assert.equal(help.status, 0, help.stderr)
  assert.doesNotMatch(help.stdout, /cloud/)
  const cloud = spawnSync(process.execPath, [cli, "cloud", "onboard"], { encoding: "utf8" })
  assert.notEqual(cloud.status, 0)

  console.log("redrob-bootstrap CLI tests passed")
} finally {
  rmSync(temp, { recursive: true, force: true })
}
