import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export function packageManagerInvocation({
  execPath = process.execPath,
  npmExecPath = process.env.npm_execpath,
  platform = process.platform,
} = {}) {
  const inheritedCli = npmExecPath?.trim();
  if (inheritedCli) {
    return { command: execPath, args: [inheritedCli] };
  }
  return {
    command: platform === "win32" ? "pnpm.cmd" : "pnpm",
    args: [],
  };
}

export function resolveBunExecutable({
  bunInstall = process.env.BUN_INSTALL,
  bunVersion = process.versions.bun,
  execPath = process.execPath,
  exists = existsSync,
  homeDir = homedir(),
  platform = process.platform,
} = {}) {
  if (bunVersion) return execPath;

  const executable = platform === "win32" ? "bun.exe" : "bun";
  const candidates = [
    bunInstall?.trim() ? resolve(bunInstall, "bin", executable) : "",
    homeDir ? resolve(homeDir, ".bun", "bin", executable) : "",
  ];
  return candidates.find((candidate) => candidate && exists(candidate)) ?? executable;
}
