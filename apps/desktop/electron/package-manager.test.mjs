import assert from "node:assert/strict";
import test from "node:test";

import {
  packageManagerInvocation,
  resolveBunExecutable,
} from "../scripts/package-manager.mjs";

test("reuses the inherited package-manager CLI without relying on PATH", () => {
  assert.deepEqual(
    packageManagerInvocation({
      execPath: "/usr/bin/node",
      npmExecPath: "/opt/pnpm/bin/pnpm.cjs",
      platform: "linux",
    }),
    {
      command: "/usr/bin/node",
      args: ["/opt/pnpm/bin/pnpm.cjs"],
    },
  );
});

test("falls back to the platform pnpm command for direct script launches", () => {
  assert.deepEqual(
    packageManagerInvocation({ execPath: "/usr/bin/node", npmExecPath: "", platform: "linux" }),
    { command: "pnpm", args: [] },
  );
  assert.deepEqual(
    packageManagerInvocation({ execPath: "C:\\node.exe", npmExecPath: "", platform: "win32" }),
    { command: "pnpm.cmd", args: [] },
  );
});

test("finds an installed Bun executable without relying on PATH", () => {
  const installed = "/home/user/.bun/bin/bun";
  assert.equal(
    resolveBunExecutable({
      bunInstall: "",
      bunVersion: undefined,
      execPath: "/usr/bin/node",
      exists: candidate => candidate === installed,
      homeDir: "/home/user",
      platform: "linux",
    }),
    installed,
  );
  assert.equal(
    resolveBunExecutable({
      bunInstall: "",
      bunVersion: "1.3.6",
      execPath: installed,
      exists: () => false,
      homeDir: "/home/user",
      platform: "linux",
    }),
    installed,
  );
});
